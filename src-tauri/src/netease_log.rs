//! Read only playback events from the local NetEase log. Based on Daozai's
//! elog reader (MIT); see ../DAOZAI-LICENSE.txt. No other log data is retained.
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    sync::{Mutex, OnceLock},
};
use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, GetWindowThreadProcessId};
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetTickCount64() -> u64;
}
#[derive(Default)]
struct Reader {
    pid: u32,
    offset: u64,
    carry: Vec<u8>,
    title: String,
    duration: f64,
    position: f64,
    at: u64,
    playing: bool,
    ready: bool,
}
fn decode(byte: u8) -> u8 {
    let high = byte >> 4;
    let low = byte & 15;
    ((high ^ ((low + 8) & 15)) << 4) | ((byte >> 6) << 2) | (!high & 3)
}
impl Reader {
    fn position(&self, now: u64) -> f64 {
        (self.position
            + if self.playing {
                now.saturating_sub(self.at) as f64 / 1000.0
            } else {
                0.0
            })
        .min(self.duration)
    }
    fn line(&mut self, line: &str, now: u64) {
        let Some((header, body)) = line.strip_prefix('[').and_then(|s| s.split_once(']')) else {
            return;
        };
        let mut parts = header.split(':');
        if parts.next().and_then(|s| s.parse::<u32>().ok()) != Some(self.pid) {
            return;
        }
        let Some(at) = parts
            .nth(2)
            .and_then(|s| s.parse::<u64>().ok())
            .filter(|at| *at <= now.saturating_add(1000) && *at >= self.at)
        else {
            return;
        };
        let Some((_, event)) = body.split_once("【playing】,") else {
            return;
        };
        let Some((name, args)) = event
            .trim()
            .strip_prefix('"')
            .and_then(|s| s.split_once("\","))
        else {
            return;
        };
        if name == "playOneTrackInPlayingList" {
            let Ok(data) = serde_json::from_str::<serde_json::Value>(args) else {
                return;
            };
            let track = data.get("track").unwrap_or(&data);
            let Some(title) = track["name"].as_str() else {
                return;
            };
            let Some(duration) = track["duration"]
                .as_f64()
                .map(|x| x / 1000.0)
                .filter(|x| *x > 0.0 && *x < 86400.0)
            else {
                return;
            };
            self.title = title.to_owned();
            self.duration = duration;
            self.position = 0.0;
            self.at = at;
            self.playing = false;
            self.ready = false;
        } else if name.starts_with("native") && name.contains("load完成") && !self.title.is_empty()
        {
            self.position = 0.0;
            self.at = at;
            self.playing = true;
            self.ready = true;
        } else if name == "setPlayingPosition" && !self.title.is_empty() {
            if let Some(pos) = args
                .split(',')
                .next()
                .and_then(|x| x.trim().parse::<f64>().ok())
                .filter(|x| x.is_finite() && *x >= 0.0 && *x <= self.duration)
            {
                self.position = pos;
                self.at = at;
                self.ready = true;
            }
        } else if name.starts_with("native")
            && name.ends_with("state")
            && !self.title.is_empty()
            && let Some(state) = args
                .split(',')
                .next()
                .and_then(|x| x.trim().parse::<u8>().ok())
                .filter(|s| *s == 1 || *s == 2)
        {
            self.position = self.position(at);
            self.at = at;
            self.playing = state == 1;
            self.ready = true;
        }
    }
    fn poll(&mut self, title: &str) -> Option<(f64, f64)> {
        let class: Vec<u16> = "OrpheusBrowserHost\0".encode_utf16().collect();
        let hwnd = unsafe { FindWindowW(class.as_ptr(), std::ptr::null()) };
        if hwnd.is_null() {
            *self = Self::default();
            return None;
        }
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == 0 {
            return None;
        }
        if pid != self.pid {
            *self = Self {
                pid,
                ..Self::default()
            };
        }
        let path = std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?)
            .join("NetEase/CloudMusic/cloudmusic.elog");
        let mut f = File::open(path).ok()?;
        let size = f.metadata().ok()?.len();
        if size < self.offset {
            *self = Self {
                pid,
                ..Self::default()
            };
        }
        let start = self.offset.max(size.saturating_sub(4 * 1024 * 1024));
        if start > self.offset {
            self.carry.clear();
        }
        f.seek(SeekFrom::Start(start)).ok()?;
        let mut bytes = Vec::new();
        f.take(4 * 1024 * 1024).read_to_end(&mut bytes).ok()?;
        self.offset = size;
        let now = unsafe { GetTickCount64() };
        for byte in bytes.into_iter().map(decode) {
            if byte == b'\n' {
                let raw = std::mem::take(&mut self.carry);
                if let Ok(line) = std::str::from_utf8(&raw) {
                    self.line(line, now);
                }
            } else if self.carry.len() < 256 * 1024 {
                self.carry.push(byte);
            } else {
                self.carry.clear();
            }
        }
        if self.ready && self.title.trim() == title.trim() && self.duration > 0.0 {
            Some((self.position(now), self.duration))
        } else {
            None
        }
    }
}
pub fn timeline(title: &str) -> Option<(f64, f64)> {
    static READER: OnceLock<Mutex<Reader>> = OnceLock::new();
    READER
        .get_or_init(|| Mutex::new(Reader::default()))
        .lock()
        .ok()?
        .poll(title)
}
#[test]
fn playback_events_track_pause_and_seek_without_crossing_processes() {
    let mut reader = Reader {
        pid: 7,
        ..Default::default()
    };
    reader.line("[7:1:x:1000:INFO] 【playing】,\"playOneTrackInPlayingList\",{\"track\":{\"name\":\"测试\",\"duration\":120000}}", 10000);
    reader.line("[7:1:x:2000:INFO] 【playing】,\"native歌曲state\",1", 10000);
    assert_eq!(reader.position(5000), 3.0);
    reader.line(
        "[8:1:x:5000:INFO] 【playing】,\"setPlayingPosition\",90",
        10000,
    );
    assert_eq!(reader.position(5000), 3.0);
    reader.line("[7:1:x:6000:INFO] 【playing】,\"native歌曲state\",2", 10000);
    assert_eq!(reader.position(9000), 4.0);
    reader.line(
        "[7:1:x:7000:INFO] 【playing】,\"setPlayingPosition\",30",
        10000,
    );
    assert_eq!(reader.position(9000), 30.0);
}
#[test]
#[ignore = "requires NetEase playing locally"]
fn live_log_timeline() {
    let mut reader = Reader::default();
    let _ = reader.poll("");
    let title = reader.title.clone();
    assert!(!title.is_empty());
    let (pos, dur) = reader.poll(&title).expect("current timeline");
    assert!(pos >= 0.0 && dur > 0.0);
    println!("timeline: {:.1}/{:.1}", pos, dur);
}
