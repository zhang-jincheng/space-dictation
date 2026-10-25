//! Existing dictionary recordings downloaded before a listening session. Never
//! falls back to the operating system speech synthesizer.
use crate::space::{AudioProgress, Word};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::BufReader;
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
static CANCEL_NOTIFY: tokio::sync::Notify = tokio::sync::Notify::const_new();
static CANCEL: AtomicBool = AtomicBool::new(false);
static PREPARE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
    CANCEL_NOTIFY.notify_waiters();
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Recording {
    pub word: String,
    pub accent: String,
    pub author: String,
    pub source: String,
    pub license: String,
    pub license_url: String,
    pub url: String,
    pub digest: String,
}
#[derive(Serialize)]
pub struct Missing {
    pub word: String,
    pub error: String,
}
#[derive(Default, Serialize)]
pub struct Report {
    pub ready: Vec<String>,
    pub missing: Vec<Missing>,
    pub sources: Vec<Recording>,
}
fn normal(text: &str) -> String {
    text.trim().to_lowercase()
}
pub fn audio_path(dir: &Path, text: &str, accent: &str) -> PathBuf {
    let key = serde_json::to_vec(&(1, normal(text), accent)).unwrap();
    dir.join("recordings-v1")
        .join(format!("{:x}.mp3", Sha256::digest(key)))
}
pub fn cached(dir: &Path, text: &str, accent: &str) -> Option<Recording> {
    if let Some(recording) = crate::personal_recordings::cached(dir, text) {
        return Some(recording);
    }
    let path = audio_path(dir, text, accent);
    let meta: Recording =
        serde_json::from_slice(&std::fs::read(path.with_extension("json")).ok()?).ok()?;
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 100
        || meta.word != normal(text)
        || meta.digest != format!("{:x}", Sha256::digest(bytes))
    {
        return None;
    }
    Some(meta)
}
pub(crate) fn decodable_audio(path: &Path) -> bool {
    let Ok(file) = std::fs::File::open(path) else {
        return false;
    };
    rodio::Decoder::new(BufReader::new(file)).is_ok()
}
fn plain(html: &str) -> String {
    regex::Regex::new("<[^>]*>")
        .unwrap()
        .replace_all(html, "")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .to_string()
}
fn accent(title: &str) -> String {
    let t = title.to_lowercase();
    if t.contains("en-us-") || t.contains("-us.") {
        "en_US"
    } else if t.contains("en-uk-") || t.contains("-uk.") || t.contains("en-gb-") {
        "en_GB"
    } else {
        "other"
    }
    .into()
}
fn candidates(value: &Value, preferred: &str, word: &str) -> Vec<Recording> {
    let mut out = vec![];
    if let Some(pages) = value["query"]["pages"].as_object() {
        for page in pages.values() {
            let Some(infos) = page["videoinfo"].as_array() else {
                continue;
            };
            for info in infos {
                let m = &info["extmetadata"];
                let field = |k: &str| plain(m[k]["value"].as_str().unwrap_or(""));
                let license = field("LicenseShortName");
                let license_url = field("LicenseUrl");
                if !(license.starts_with("CC BY") || license == "CC0" || license == "Public domain")
                {
                    continue;
                }
                let source = info["descriptionurl"].as_str().unwrap_or("");
                let Some(derivatives) = info["derivatives"].as_array() else {
                    continue;
                };
                for d in derivatives {
                    if d["type"].as_str() != Some("audio/mpeg") {
                        continue;
                    }
                    let url = d["src"].as_str().unwrap_or("");
                    if !url.starts_with("https://upload.wikimedia.org/") {
                        continue;
                    }
                    out.push(Recording {
                        word: normal(word),
                        accent: accent(page["title"].as_str().unwrap_or("")),
                        author: field("Artist"),
                        source: source.into(),
                        license: license.clone(),
                        license_url: license_url.clone(),
                        url: url.into(),
                        digest: String::new(),
                    });
                }
            }
        }
    }
    out.sort_by_key(|r| {
        if r.accent == preferred {
            0
        } else if r.accent == "other" {
            2
        } else {
            1
        }
    });
    out
}
async fn json(client: &reqwest::Client, params: &[(&str, String)]) -> Result<Value, String> {
    client
        .get("https://commons.wikimedia.org/w/api.php")
        .query(params)
        .send()
        .await
        .map_err(|_| "当前网络无法连接 Wikimedia 录音服务".to_string())?
        .error_for_status()
        .map_err(|_| "Wikimedia 录音服务暂时不可用".to_string())?
        .json()
        .await
        .map_err(|_| "Wikimedia 返回了无法识别的数据".to_string())
}
fn query_base() -> Vec<(&'static str, String)> {
    vec![
        ("action", "query".into()),
        ("format", "json".into()),
        ("prop", "videoinfo".into()),
        ("viprop", "url|derivatives|extmetadata".into()),
    ]
}
fn titles(word: &str) -> Vec<String> {
    ["us", "uk", "gb"]
        .iter()
        .map(|a| format!("File:En-{a}-{word}.ogg"))
        .collect()
}
async fn batch_find(
    client: &reqwest::Client,
    words: &[Word],
    preferred: &str,
) -> Result<std::collections::HashMap<String, Vec<Recording>>, String> {
    let mut results = std::collections::HashMap::new();
    // Commons permits 50 titles per ordinary request; 15 words use 45 titles.
    for chunk in words.chunks(15) {
        let mut query = query_base();
        query.push((
            "titles",
            chunk
                .iter()
                .flat_map(|w| titles(&normal(&w.front)))
                .collect::<Vec<_>>()
                .join("|"),
        ));
        let value = json(client, &query).await?;
        for w in chunk {
            let expected = titles(&normal(&w.front))
                .iter()
                .map(|t| t.to_lowercase())
                .collect::<Vec<_>>();
            let pages = value["query"]["pages"]
                .as_object()
                .ok_or("录音来源未返回有效索引，请稍后重试")?;
            let matching: serde_json::Map<String, Value> = pages
                .iter()
                .filter(|(_, p)| {
                    expected.contains(
                        &p["title"]
                            .as_str()
                            .unwrap_or("")
                            .replace('_', " ")
                            .to_lowercase(),
                    )
                })
                .map(|(id, p)| (id.clone(), p.clone()))
                .collect();
            results.insert(
                w.id.clone(),
                candidates(
                    &serde_json::json!({"query":{"pages":matching}}),
                    preferred,
                    &w.front,
                ),
            );
        }
    }
    Ok(results)
}
async fn lookup_index(
    client: &reqwest::Client,
    word: &str,
    preferred: &str,
) -> Result<Vec<Recording>, String> {
    // The public dictionary index supplies Commons page ids for less regular filenames.
    let mut endpoint =
        reqwest::Url::parse("https://api.dictionaryapi.dev/api/v2/entries/en/").unwrap();
    endpoint
        .path_segments_mut()
        .unwrap()
        .pop_if_empty()
        .push(word);
    let entries: Value = client
        .get(endpoint)
        .send()
        .await
        .map_err(|_| "备用录音索引连接失败".to_string())?
        .error_for_status()
        .map_err(|_| "备用录音索引暂不可用".to_string())?
        .json()
        .await
        .map_err(|_| "备用录音索引返回了无法识别的数据".to_string())?;
    let mut ids = vec![];
    if let Some(entries) = entries.as_array() {
        for e in entries {
            if let Some(ps) = e["phonetics"].as_array() {
                for p in ps {
                    if let Some(source) = p["sourceUrl"].as_str() {
                        if let Ok(url) = reqwest::Url::parse(source) {
                            if url.host_str() == Some("commons.wikimedia.org") {
                                for (k, v) in url.query_pairs() {
                                    if k == "curid"
                                        && v.chars().all(|c| c.is_ascii_digit())
                                        && !v.is_empty()
                                    {
                                        ids.push(v.into_owned());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if ids.is_empty() {
        return Err("未找到带开放许可的现成录音，短语和部分生僻词可能缺失".into());
    }
    let mut query = query_base();
    query.push(("pageids", ids.join("|")));
    Ok(candidates(&json(client, &query).await?, preferred, word))
}
fn direct_candidates(word: &str, preferred: &str) -> Vec<Recording> {
    let word = normal(word);
    let suffix = if preferred == "en_GB" { "gb" } else { "us" };
    let mut out = vec![];
    if !word.is_empty()
        && word.len() <= 100
        && word
            .chars()
            .all(|c| c.is_ascii_alphabetic() || matches!(c, ' ' | '-' | '\''))
    {
        let slug = word.replace(' ', "_");
        out.push(Recording {
            word: word.clone(),
            accent: preferred.into(),
            author: "Google Dictionary".into(),
            source: "https://www.google.com/search?q=define".into(),
            license: "公开词典录音 · 仅供个人学习".into(),
            license_url: "https://policies.google.com/terms".into(),
            url: format!(
                "https://ssl.gstatic.com/dictionary/static/sounds/20200429/{slug}--_{suffix}_1.mp3"
            ),
            digest: String::new(),
        });
    }
    let mut url = reqwest::Url::parse("https://dict.youdao.com/dictvoice").unwrap();
    url.query_pairs_mut()
        .append_pair("audio", &word)
        .append_pair("type", if preferred == "en_GB" { "1" } else { "2" });
    let mut source = reqwest::Url::parse("https://dict.youdao.com/result").unwrap();
    source
        .query_pairs_mut()
        .append_pair("word", &word)
        .append_pair("lang", "en");
    out.push(Recording {
        word: word.clone(),
        accent: preferred.into(),
        author: "网易有道词典".into(),
        source: source.into(),
        license: "公开词典录音 · 仅供个人学习".into(),
        license_url: "https://www.youdao.com/about/terms".into(),
        url: url.into(),
        digest: String::new(),
    });
    out
}
async fn download(
    client: &reqwest::Client,
    dir: &Path,
    word: &str,
    preferred: &str,
    choices: Vec<Recording>,
) -> Result<Recording, String> {
    let mut pending = direct_candidates(word, preferred);
    pending.extend(choices);
    let mut tried_index = false;
    let mut last = "没有可用的 MP3 录音".to_string();
    loop {
        for mut r in pending {
            if CANCEL.load(Ordering::SeqCst) {
                return Err("已取消".into());
            }
            let response = client.get(&r.url).send().await;
            let mut response = match response.and_then(|r| r.error_for_status()) {
                Ok(r) => r,
                Err(_) => {
                    last = "当前网络无法连接可用的录音服务".into();
                    continue;
                }
            };
            let mut data = Vec::new();
            let mut interrupted = false;
            loop {
                match response.chunk().await {
                    Ok(Some(chunk)) => {
                        if data.len() + chunk.len() > 5_000_000 {
                            last = "录音文件过大".into();
                            interrupted = true;
                            break;
                        }
                        data.extend_from_slice(&chunk);
                    }
                    Ok(None) => break,
                    Err(_) => {
                        last = "录音下载中断，请稍后重试".into();
                        interrupted = true;
                        break;
                    }
                }
            }
            if interrupted {
                continue;
            }
            let target = audio_path(dir, word, preferred);
            let mut temp = tempfile::Builder::new()
                .suffix(".mp3")
                .tempfile_in(target.parent().unwrap())
                .map_err(|e| e.to_string())?;
            use std::io::Write;
            temp.write_all(&data).map_err(|e| e.to_string())?;
            if data.len() < 100 || !decodable_audio(temp.path()) {
                last = "录音服务没有返回可播放的音频".into();
                continue;
            }
            r.digest = format!("{:x}", Sha256::digest(&data));
            temp.persist(&target).map_err(|e| e.to_string())?;
            let mut meta = tempfile::NamedTempFile::new_in(target.parent().unwrap())
                .map_err(|e| e.to_string())?;
            meta.write_all(&serde_json::to_vec_pretty(&r).unwrap())
                .map_err(|e| e.to_string())?;
            meta.persist(target.with_extension("json"))
                .map_err(|e| e.to_string())?;
            return Ok(r);
        }
        if tried_index {
            break;
        }
        tried_index = true;
        pending = lookup_index(client, &normal(word), preferred)
            .await
            .unwrap_or_default();
        if pending.is_empty() {
            break;
        }
    }
    Err(last)
}
async fn bounded<T>(
    future: impl std::future::Future<Output = Result<T, String>>,
    deadline: tokio::time::Instant,
    notify: &tokio::sync::Notify,
) -> Result<T, String> {
    tokio::select! {
        biased;
        _=notify.notified()=>Err("已取消下载；已下载录音保留".into()),
        result=tokio::time::timeout_at(deadline,future)=>result.map_err(|_|"录音准备超时，请检查网络后重试；已下载的录音可以继续使用".to_string())?,
    }
}
pub async fn prepare(
    dir: &Path,
    words: &[Word],
    preferred: &str,
    progress: impl Fn(AudioProgress),
) -> Result<Report, String> {
    let _guard = PREPARE
        .try_lock()
        .map_err(|_| "已有录音正在准备，请等待或取消后再试")?;
    CANCEL.store(false, Ordering::SeqCst);
    if !["en_US", "en_GB"].contains(&preferred) {
        return Err("请选择英式或美式录音".into());
    }
    std::fs::create_dir_all(dir.join("recordings-v1")).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .user_agent("SpaceDictation/1.2.1 personal-learning")
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(60);
    let mut report = Report::default();
    let mut remaining = vec![];
    progress(AudioProgress {
        ready: 0,
        total: words.len(),
    });
    // Read every existing file first: one unreachable word cannot block cached playback.
    for w in words {
        if let Some(r) = cached(dir, &w.front, preferred) {
            report.ready.push(w.id.clone());
            report.sources.push(r);
        } else {
            remaining.push(w.clone());
        }
    }
    progress(AudioProgress {
        ready: report.ready.len(),
        total: words.len(),
    });
    if remaining.is_empty() {
        return Ok(report);
    }
    let lookup = bounded(
        batch_find(&client, &remaining, preferred),
        deadline,
        &CANCEL_NOTIFY,
    )
    .await;
    if CANCEL.load(Ordering::SeqCst) {
        return Err("已取消下载；已下载录音保留".into());
    }
    // Wikimedia may be inaccessible on some networks. Its failure must not stop
    // the direct Google Dictionary and Youdao fallbacks used below.
    let mut choices = lookup.unwrap_or_default();
    for w in remaining {
        if CANCEL.load(Ordering::SeqCst) {
            return Err("已取消下载；已下载录音保留".into());
        }
        let word_deadline = std::cmp::min(
            deadline,
            tokio::time::Instant::now() + std::time::Duration::from_secs(12),
        );
        let result = bounded(
            download(
                &client,
                dir,
                &w.front,
                preferred,
                choices.remove(&w.id).unwrap_or_default(),
            ),
            word_deadline,
            &CANCEL_NOTIFY,
        )
        .await;
        match result {
            Ok(r) => {
                report.ready.push(w.id.clone());
                report.sources.push(r);
            }
            Err(error) => report.missing.push(Missing {
                word: w.front.clone(),
                error,
            }),
        };
        progress(AudioProgress {
            ready: report.ready.len() + report.missing.len(),
            total: words.len(),
        });
    }
    if CANCEL.load(Ordering::SeqCst) {
        return Err("已取消下载；已下载录音保留".into());
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn stalled_download_times_out_and_cancel_does_not_wait_for_network() {
        let notify = tokio::sync::Notify::new();
        let started = std::time::Instant::now();
        let result: Result<(), String> = bounded(
            std::future::pending(),
            tokio::time::Instant::now() + std::time::Duration::from_millis(20),
            &notify,
        )
        .await;
        assert!(result.unwrap_err().contains("超时"));
        assert!(started.elapsed().as_secs() < 1);
        let cancel = async {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            notify.notify_waiters();
        };
        let download = bounded::<()>(
            std::future::pending(),
            tokio::time::Instant::now() + std::time::Duration::from_secs(30),
            &notify,
        );
        let (r, _) = tokio::join!(download, cancel);
        assert!(r.unwrap_err().contains("取消"));
        assert!(started.elapsed().as_secs() < 1);
    }
    #[test]
    fn cache_rejects_old_synthesis_corruption_and_includes_accent() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(
            audio_path(d.path(), "Apple", "en_US"),
            audio_path(d.path(), " apple ", "en_US")
        );
        assert_ne!(
            audio_path(d.path(), "apple", "en_US"),
            audio_path(d.path(), "apple", "en_GB")
        );
        assert!(cached(d.path(), "apple", "en_US").is_none());
        let p = audio_path(d.path(), "apple", "en_US");
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, b"bad audio").unwrap();
        assert!(cached(d.path(), "apple", "en_US").is_none());
    }
    #[test]
    fn selects_licensed_mp3_and_prioritizes_requested_accent() {
        let page = |title: &str, license: &str| serde_json::json!({"title":title,"videoinfo":[{"descriptionurl":"https://commons.wikimedia.org/wiki/File:test","extmetadata":{"LicenseShortName":{"value":license},"Artist":{"value":"<a>Speaker</a>"}},"derivatives":[{"type":"audio/mpeg","src":"https://upload.wikimedia.org/test.mp3"}]}]});
        let value = serde_json::json!({"query":{"pages":{"1":page("File:En-us-test.ogg","CC BY-SA 3.0"),"2":page("File:En-uk-test.ogg","CC BY 3.0"),"3":page("File:En-us-test.ogg","All rights reserved")}}});
        let r = candidates(&value, "en_GB", "test");
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].accent, "en_GB");
        assert_eq!(r[0].author, "Speaker");
    }
    #[test]
    fn direct_dictionary_candidates_encode_words_and_keep_requested_accent() {
        let r = direct_candidates("Blue Chip", "en_GB");
        assert_eq!(r.len(), 2);
        assert!(r.iter().all(|x| x.accent == "en_GB"));
        assert!(r[0].url.contains("blue_chip--_gb_1.mp3"));
        assert!(r[1].url.contains("audio=blue+chip"));
        assert!(r[1].url.contains("type=1"));
        assert!(!r.iter().any(|x| x.url.contains(' ')));
    }
    #[tokio::test]
    #[ignore = "Requires public network; run explicitly"]
    async fn downloads_real_recording_and_reuses_it() {
        let d = tempfile::tempdir().unwrap();
        let words = vec![
            Word {
                id: "apple".into(),
                front: "apple".into(),
                back: "苹果".into(),
            },
            Word {
                id: "owners".into(),
                front: "owners".into(),
                back: "所有者".into(),
            },
            Word {
                id: "blue-chip".into(),
                front: "blue chip".into(),
                back: "蓝筹".into(),
            },
        ];
        let r = prepare(d.path(), &words, "en_US", |_| {}).await.unwrap();
        assert!(
            r.missing.is_empty(),
            "{:?}",
            r.missing.iter().map(|m| &m.error).collect::<Vec<_>>()
        );
        assert_eq!(r.ready.len(), 3);
        let p = audio_path(d.path(), "apple", "en_US");
        let t = std::fs::metadata(&p).unwrap().modified().unwrap();
        let r = prepare(d.path(), &words, "en_US", |_| {}).await.unwrap();
        assert_eq!(r.ready.len(), 3);
        assert_eq!(t, std::fs::metadata(p).unwrap().modified().unwrap());
        let fixture = std::env::var("SPACE_RECORDING_FIXTURE").ok();
        if let Some(path) = fixture {
            std::fs::create_dir_all(&path).unwrap();
            for f in std::fs::read_dir(d.path().join("recordings-v1")).unwrap() {
                let f = f.unwrap();
                std::fs::copy(f.path(), Path::new(&path).join(f.file_name())).unwrap();
            }
        }
    }
}
