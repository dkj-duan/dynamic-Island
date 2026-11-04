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
    artist: String,
    artwork_url: Option<String>,
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
            self.artist = track["artists"]
                .as_array()
                .map(|artists| {
                    artists
                        .iter()
                        .filter_map(|a| a["name"].as_str())
                        .collect::<Vec<_>>()
                        .join("/")
                })
                .unwrap_or_default();
            self.artwork_url = track
                .pointer("/album/picUrl")
                .and_then(|v| v.as_str())
                .and_then(cover_url);
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
    fn poll(&mut self) -> Option<Snapshot> {
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
        if self.ready && !self.title.is_empty() && self.duration > 0.0 {
            Some(Snapshot {
                title: self.title.clone(),
                artist: self.artist.clone(),
                artwork_url: self.artwork_url.clone(),
                position: self.position(now),
                duration: self.duration,
                playing: self.playing,
            })
        } else {
            None
        }
    }
}
pub struct Snapshot {
    pub title: String,
    pub artist: String,
    pub artwork_url: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub playing: bool,
}
fn cover_url(raw: &str) -> Option<String> {
    let mut url = url::Url::parse(raw).ok()?;
    let host = url.host_str()?;
    if !matches!(url.scheme(), "http" | "https")
        || !(host == "music.126.net" || host.ends_with(".music.126.net"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return None;
    }
    url.set_scheme("https").ok()?;
    url.set_query(Some("param=256y256"));
    url.set_fragment(None);
    Some(url.into())
}
pub fn current() -> Option<Snapshot> {
    static READER: OnceLock<Mutex<Reader>> = OnceLock::new();
    READER
        .get_or_init(|| Mutex::new(Reader::default()))
        .lock()
        .ok()?
        .poll()
}
pub fn timeline(title: &str) -> Option<(f64, f64)> {
    let state = current()?;
    (state.title.trim() == title.trim()).then_some((state.position, state.duration))
}
#[test]
fn cover_url_restricts_hosts_and_upgrades_to_https() {
    assert_eq!(
        cover_url("http://p1.music.126.net/test.jpg?x=1").as_deref(),
        Some("https://p1.music.126.net/test.jpg?param=256y256")
    );
    for input in [
        "http://music.126.net.evil.test/a",
        "http://evil.test/a",
        "http://user@music.126.net/a",
        "https://music.126.net:444/a",
        "file:///a",
    ] {
        assert!(cover_url(input).is_none());
    }
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
    let _ = reader.poll();
    let title = reader.title.clone();
    assert!(!title.is_empty());
    let state = reader.poll().expect("current timeline");
    assert_eq!(state.title, title);
    assert!(state.position >= 0.0 && state.duration > 0.0);
}
