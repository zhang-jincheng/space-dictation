//! Microphone capture stays on its owning thread; no microphone data is uploaded.
use crate::{db::Database, recordings::Recording};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tauri::State;

struct Active {
    id: uuid::Uuid,
    control: mpsc::Sender<bool>,
    done: mpsc::Receiver<Result<Recording, String>>,
}
#[derive(Default)]
pub struct Microphone(Mutex<Option<Active>>);
impl Microphone {
    pub fn cancel(&self) {
        if let Ok(mut active) = self.0.lock() {
            if let Some(active) = active.take() {
                let _ = active.control.send(false);
            }
        }
    }
    fn cancel_if_current(&self, id: uuid::Uuid) {
        if let Ok(mut active) = self.0.lock() {
            if active.as_ref().is_some_and(|take| take.id == id) {
                if let Some(take) = active.take() {
                    let _ = take.control.send(false);
                }
            }
        }
    }
}
pub fn path(dir: &Path, word: &str) -> PathBuf {
    dir.join("personal-recordings-v1").join(format!(
        "{:x}.wav",
        Sha256::digest(word.trim().to_lowercase().as_bytes())
    ))
}
pub fn cached(dir: &Path, word: &str) -> Option<Recording> {
    let file = path(dir, word);
    let bytes = std::fs::read(&file).ok()?;
    if bytes.len() < 100 || !crate::recordings::decodable_audio(&file) {
        return None;
    }
    Some(Recording {
        word: word.trim().to_lowercase(),
        accent: "personal".into(),
        author: "我自己".into(),
        source: "本机个人录音".into(),
        license: "个人录音 · 仅本地保存".into(),
        license_url: String::new(),
        url: String::new(),
        digest: format!("{:x}", Sha256::digest(bytes)),
    })
}
fn save(dir: &Path, word: &str, rate: u32, samples: &[i16]) -> Result<Recording, String> {
    if rate == 0 || samples.len() < rate as usize / 3 {
        return Err("录音太短，请读完单词或短语后再保存".into());
    }
    if samples.iter().map(|x| x.unsigned_abs()).max().unwrap_or(0) < 64 {
        return Err("没有录到声音，请检查麦克风权限和输入设备后重试".into());
    }
    let target = path(dir, word);
    let parent = target.parent().ok_or("录音目录无效")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("无法创建录音目录：{e}"))?;
    // Replace only after a complete WAV is on disk, so failed re-recording keeps the old take.
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    let size = (samples.len() * 2) as u32;
    file.write_all(b"RIFF")
        .and_then(|_| file.write_all(&(36 + size).to_le_bytes()))
        .and_then(|_| file.write_all(b"WAVEfmt "))
        .and_then(|_| file.write_all(&16u32.to_le_bytes()))
        .and_then(|_| file.write_all(&1u16.to_le_bytes()))
        .and_then(|_| file.write_all(&1u16.to_le_bytes()))
        .and_then(|_| file.write_all(&rate.to_le_bytes()))
        .and_then(|_| file.write_all(&(rate * 2).to_le_bytes()))
        .and_then(|_| file.write_all(&2u16.to_le_bytes()))
        .and_then(|_| file.write_all(&16u16.to_le_bytes()))
        .and_then(|_| file.write_all(b"data"))
        .and_then(|_| file.write_all(&size.to_le_bytes()))
        .map_err(|e| e.to_string())?;
    let pcm: Vec<u8> = samples.iter().flat_map(|x| x.to_le_bytes()).collect();
    file.write_all(&pcm).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    if !crate::recordings::decodable_audio(file.path()) {
        return Err("录音文件无效，请重新录制".into());
    }
    file.persist(target)
        .map_err(|e| format!("保存录音失败：{e}"))?;
    cached(dir, word).ok_or_else(|| "保存后无法读取录音".into())
}
fn input<T: cpal::SizedSample + cpal::Sample>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    buffer: Arc<Mutex<Vec<i16>>>,
    failure: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, String>
where
    i16: cpal::FromSample<T>,
{
    let channels = config.channels as usize;
    let limit = config.sample_rate.0 as usize * 60;
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if let Ok(mut samples) = buffer.lock() {
                    for frame in data.chunks(channels) {
                        if samples.len() >= limit {
                            break;
                        }
                        // Mono recording: average all device channels.
                        let value: i32 = frame.iter().map(|v| v.to_sample::<i16>() as i32).sum();
                        samples.push((value / frame.len() as i32) as i16);
                    }
                }
            },
            move |error| {
                if let Ok(mut failure) = failure.lock() {
                    *failure = Some(error.to_string());
                }
            },
            None,
        )
        .map_err(|e| format!("无法使用麦克风，请在系统隐私设置中允许访问麦克风：{e}"))
}
fn capture(
    dir: PathBuf,
    word: String,
    control: mpsc::Receiver<bool>,
    ready: mpsc::SyncSender<Result<(), String>>,
) -> Result<Recording, String> {
    let setup = || {
        let device = cpal::default_host()
            .default_input_device()
            .ok_or("没有可用麦克风，请连接或启用输入设备")?;
        let supported = device
            .default_input_config()
            .map_err(|e| format!("无法读取麦克风设置：{e}"))?;
        let config: cpal::StreamConfig = supported.clone().into();
        if !(8000..=192000).contains(&config.sample_rate.0) || config.channels == 0 {
            return Err("麦克风格式不受支持，请使用标准输入设备".into());
        }
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let failure = Arc::new(Mutex::new(None));
        let stream = match supported.sample_format() {
            cpal::SampleFormat::F32 => {
                input::<f32>(&device, &config, buffer.clone(), failure.clone())
            }
            cpal::SampleFormat::I16 => {
                input::<i16>(&device, &config, buffer.clone(), failure.clone())
            }
            cpal::SampleFormat::U16 => {
                input::<u16>(&device, &config, buffer.clone(), failure.clone())
            }
            _ => Err("麦克风采样格式不受支持".into()),
        }?;
        stream
            .play()
            .map_err(|e| format!("无法开始录音，请检查麦克风权限：{e}"))?;
        Ok::<_, String>((stream, buffer, failure, config.sample_rate.0))
    };
    let (stream, buffer, failure, rate) = match setup() {
        Ok(parts) => {
            let _ = ready.send(Ok(()));
            parts
        }
        Err(error) => {
            let _ = ready.send(Err(error.clone()));
            return Err(error);
        }
    };
    let keep = match control.recv_timeout(Duration::from_secs(60)) {
        Ok(keep) => keep,
        Err(mpsc::RecvTimeoutError::Timeout) => true,
        Err(_) => false,
    };
    drop(stream); // Release the microphone before saving or returning an error.
    if !keep {
        return Err("已取消录音".into());
    }
    if let Some(error) = failure.lock().map_err(|e| e.to_string())?.take() {
        return Err(format!("录音中断，请重新录制：{error}"));
    }
    let samples = buffer.lock().map_err(|e| e.to_string())?;
    save(&dir, &word, rate, &samples)
}
#[tauri::command]
pub async fn space_start_recording(
    db: State<'_, Database>,
    mic: State<'_, Microphone>,
    speech: State<'_, crate::space::Speech>,
    word: String,
) -> Result<(), String> {
    if word.trim().is_empty() || word.len() > 500 {
        return Err("录音单词无效".into());
    }
    speech.stop();
    let (control, receiver) = mpsc::channel();
    let (done_sender, done) = mpsc::channel();
    let (ready_sender, ready) = mpsc::sync_channel(1);
    let id = uuid::Uuid::new_v4();
    {
        let mut active = mic.0.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("请先保存或取消当前录音".into());
        }
        *active = Some(Active { id, control, done });
    }
    let dir = db.app_dir.clone();
    std::thread::spawn(move || {
        let _ = done_sender.send(capture(dir, word, receiver, ready_sender));
    });
    let result = tokio::task::spawn_blocking(move || {
        ready
            .recv_timeout(Duration::from_secs(90))
            .map_err(|_| "启动麦克风超时，请检查权限后重试".to_string())
            .and_then(|r| r)
    })
    .await
    .map_err(|e| e.to_string())?;
    if result.is_err() {
        mic.cancel_if_current(id);
    }
    result
}
#[tauri::command]
pub async fn space_finish_recording(mic: State<'_, Microphone>) -> Result<Recording, String> {
    let active = mic
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("当前没有正在进行的录音")?;
    let _ = active.control.send(true);
    tokio::task::spawn_blocking(move || {
        active
            .done
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| "保存录音超时，请重试".to_string())
            .and_then(|r| r)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn space_cancel_recording(mic: State<Microphone>) {
    mic.cancel();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_old_start_cannot_cancel_a_new_take() {
        let (control, commands) = mpsc::channel();
        let (_, done) = mpsc::channel();
        let id = uuid::Uuid::new_v4();
        let mic = Microphone(Mutex::new(Some(Active { id, control, done })));
        mic.cancel_if_current(uuid::Uuid::new_v4());
        assert!(commands.try_recv().is_err());
        assert!(mic.0.lock().unwrap().is_some());
        mic.cancel_if_current(id);
        assert_eq!(commands.recv().unwrap(), false);
        assert!(mic.0.lock().unwrap().is_none());
    }
    #[test]
    fn personal_recording_survives_reopen_and_is_reused_across_accents() {
        let dir = tempfile::tempdir().unwrap();
        let samples: Vec<i16> = (0..16000)
            .map(|n| ((n as f32 * 0.1).sin() * 5000.0) as i16)
            .collect();
        save(dir.path(), "A lot of", 16000, &samples).unwrap();
        assert_eq!(path(dir.path(), " a LOT of "), path(dir.path(), "A lot of"));
        for accent in ["en_US", "en_GB"] {
            assert_eq!(
                crate::recordings::cached(dir.path(), "a lot of", accent)
                    .unwrap()
                    .accent,
                "personal"
            );
        }
        assert!(rodio::Decoder::new(std::io::BufReader::new(
            std::fs::File::open(path(dir.path(), "a lot of")).unwrap()
        ))
        .is_ok());
        assert!(save(dir.path(), "A lot of", 16000, &[0; 16000]).is_err());
        assert!(
            cached(dir.path(), "a lot of").is_some(),
            "bad re-record must preserve previous take"
        );
        assert!(save(dir.path(), "other", 16000, &[500; 50]).is_err());
        assert!(cached(dir.path(), "other").is_none());
    }
    #[tokio::test]
    async fn personal_only_session_needs_no_network() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), "invented phrase", 16000, &[500; 16000]).unwrap();
        let words = vec![crate::space::Word {
            id: "one".into(),
            front: "invented phrase".into(),
            back: "".into(),
        }];
        let report = crate::recordings::prepare(dir.path(), &words, "en_GB", |_| {})
            .await
            .unwrap();
        assert_eq!(report.ready, vec!["one"]);
        assert!(report.missing.is_empty());
        assert_eq!(report.sources[0].accent, "personal");
    }
}
