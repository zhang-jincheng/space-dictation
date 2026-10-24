use serde::Serialize;
use std::{sync::{atomic::{AtomicBool, Ordering}, Mutex}, time::Duration};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate {
    update: Mutex<Option<Update>>,
    installing: AtomicBool,
}
#[derive(Clone, Serialize)]
pub struct UpdateInfo { version: String, current: String, filename: String, notes: String }
#[derive(Clone, Serialize)]
struct Progress { stage: &'static str, received: u64, total: Option<u64> }

fn info(update: &Update) -> Option<UpdateInfo> {
    if !newer(&update.current_version, &update.version) || update.signature.trim().is_empty() { return None; }
    Some(UpdateInfo { version: update.version.clone(), current: update.current_version.clone(), filename: update.download_url.path_segments()?.next_back()?.into(), notes: release_notes(update.body.as_deref()) })
}
fn release_notes(body: Option<&str>) -> String {
    body.unwrap_or_default().trim().lines().map(|line| {
        let text = line.trim();
        if text.starts_with('#') { text.trim_start_matches('#').trim_start() }
        else { text }
    }).collect::<Vec<_>>().join("\n")
}
fn newer(current: &str, next: &str) -> bool {
    match (semver::Version::parse(current), semver::Version::parse(next)) {
        (Ok(current), Ok(next)) => next.pre.is_empty() && next > current,
        _ => false,
    }
}
#[tauri::command]
pub async fn space_check_update(app: tauri::AppHandle) -> Option<UpdateInfo> {
    let state = app.state::<PendingUpdate>();
    if state.installing.load(Ordering::SeqCst) {
        return state.update.lock().ok()?.as_ref().and_then(info);
    }
    // Missing platforms/manifests and network errors remain silent at startup.
    let update = app.updater_builder().timeout(Duration::from_secs(15))
        .build().ok()?.check().await.ok()??;
    let result = info(&update)?;
    *state.update.lock().ok()? = Some(update);
    Some(result)
}
struct Installing<'a>(&'a AtomicBool);
impl Drop for Installing<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }
fn install_error(error: &tauri_plugin_updater::Error) -> &'static str {
    use tauri_plugin_updater::Error::*;
    match error {
        Minisign(_) | Base64(_) | SignatureUtf8(_) | SignedVersionMismatch { .. } | MissingSignedVersion => "更新包验证失败，已停止更新，原应用未被替换。请稍后重试。",
        Reqwest(_) | Network(_) => "更新下载中断，请检查网络后重试，原应用仍可使用。",
        _ => "自动安装未完成，原应用仍可使用。请检查磁盘空间或安装目录权限后重试。",
    }
}
#[tauri::command]
pub async fn space_download_update(app: tauri::AppHandle, version: String) -> Result<(), String> {
    let state = app.state::<PendingUpdate>();
    if state.installing.swap(true, Ordering::SeqCst) { return Err("正在更新，请稍候".into()); }
    let _guard = Installing(&state.installing);
    let mut update = state.update.lock().map_err(|_| "无法读取更新信息")?.clone()
        .filter(|u| u.version == version && info(u).is_some()).ok_or("更新信息已失效，请重新打开应用后重试")?;
    update.timeout = Some(Duration::from_secs(600));
    let mut received = 0;
    let mut last_percent = None;
    let mut last_event = std::time::Instant::now();
    let bytes = update.download(|chunk, total| {
        received += chunk as u64;
        let percent = total.filter(|n| *n > 0).map(|n| received.saturating_mul(100) / n);
        if percent != last_percent || last_event.elapsed() > Duration::from_millis(250) {
            let _ = app.emit("space-update-progress", Progress { stage: "downloading", received, total });
            last_percent = percent;
            last_event = std::time::Instant::now();
        }
    }, || {}).await.map_err(|e| install_error(&e).to_string())?;
    // download() verifies the public-key signature before installation. Never
    // launch a DMG or fall back to a manual installation wizard.
    let _ = app.emit("space-update-progress", Progress { stage: "installing", received, total: Some(received) });
    update.install(bytes).map_err(|e| install_error(&e).to_string())?;
    #[cfg(target_os = "macos")]
    {
        let _ = app.emit("space-update-progress", Progress { stage: "restarting", received, total: Some(received) });
        // LaunchServices registers and presents the new app as a normal Mac app.
        // Spawning the binary directly can leave its new window unavailable.
        let executable = std::env::current_exe().map_err(|_| "无法重新打开应用")?;
        let bundle = executable.parent().and_then(|p| p.parent()).and_then(|p| p.parent()).ok_or("无法重新打开应用")?;
        let status = std::process::Command::new("/usr/bin/open").arg("-n").arg(bundle).status().map_err(|_| "更新已安装，暂时无法重新打开应用")?;
        if !status.success() { return Err("更新已安装，暂时无法重新打开应用".into()); }
        app.exit(0);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    app.restart();
    #[allow(unreachable_code)]
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn release_notes_show_changes_and_handle_missing_content() {
        assert_eq!(release_notes(Some("  ## 相比上一版\n- 新增自动更新\n- 增加豆包提示词  ")), "相比上一版\n- 新增自动更新\n- 增加豆包提示词");
        assert_eq!(release_notes(None), "");
        assert_eq!(release_notes(Some(" \n ")), "");
        assert!(release_notes(Some("<script>alert('x')</script>")).contains("<script>")); // Frontend renders text, never HTML.
    }
    #[test]
    fn only_newer_stable_versions_are_offered() {
        assert!(newer("1.9.0", "1.10.0"));
        for next in ["1.2.1", "1.2.0", "1.3.0-beta.1", "invalid"] {
            assert!(!newer("1.2.1", next));
        }
    }
    #[test]
    fn signed_manifest_resolves_exact_platform_and_rejects_missing_platform() {
        let release: tauri_plugin_updater::RemoteRelease = serde_json::from_value(serde_json::json!({
            "version": "1.3.0", "platforms": {
                "darwin-aarch64": { "url": "https://example.com/mac.app.tar.gz", "signature": "mac-signature" },
                "windows-x86_64": { "url": "https://example.com/windows-setup.exe", "signature": "win-signature" }
            }
        })).unwrap();
        assert!(release.download_url("darwin-aarch64").unwrap().path().ends_with(".app.tar.gz"));
        assert!(release.download_url("windows-x86_64").unwrap().path().ends_with("-setup.exe"));
        assert!(release.download_url("darwin-x86_64").is_err());
        assert_eq!(release.signature("windows-x86_64").unwrap(), "win-signature");
    }
    #[test]
    fn errors_do_not_expose_urls_or_offer_manual_installation() {
        assert!(install_error(&tauri_plugin_updater::Error::Network("https://secret.invalid".into())).contains("重试"));
        assert!(!install_error(&tauri_plugin_updater::Error::Network("https://secret.invalid".into())).contains("https:"));
        assert!(install_error(&tauri_plugin_updater::Error::MissingSignedVersion).contains("验证失败"));
    }
    #[test]
    fn installation_lock_resets_on_failure_for_retry() {
        let state = PendingUpdate::default();
        assert!(!state.installing.swap(true, Ordering::SeqCst));
        assert!(state.installing.swap(true, Ordering::SeqCst));
        { let _guard = Installing(&state.installing); }
        assert!(!state.installing.load(Ordering::SeqCst));
    }
}
