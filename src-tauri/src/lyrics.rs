//! Fetch lyrics without blocking the UI. Song metadata is sent to the lyrics service.
use serde::Serialize;
use std::{io::Read, time::Duration};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricResult {
    synced: bool,
    text: String,
}

fn normalized(s: &str) -> String {
    s.chars()
        .flat_map(char::to_lowercase)
        .filter(|c| c.is_alphanumeric())
        .collect()
}
fn request(url: &str, query: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    use std::net::ToSocketAddrs;
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(6))
        .redirects(0)
        .resolver(|host: &str| {
            let mut addresses: Vec<_> = host.to_socket_addrs()?.collect();
            addresses.sort_by_key(|address| address.is_ipv6());
            Ok(addresses)
        })
        .tls_connector(std::sync::Arc::new(
            native_tls::TlsConnector::new().map_err(|_| "歌词连接初始化失败".to_string())?,
        ))
        .build();
    let mut req = agent
        .get(url)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36")
        .set("Referer", "https://music.163.com/")
        .set("Accept", "application/json");
    for (key, value) in query {
        req = req.query(key, value);
    }
    let response = req.call().map_err(|error| {
        #[cfg(test)]
        eprintln!("lyrics request failed: {error}");
        #[cfg(not(test))]
        let _ = error;
        "歌词服务暂不可用".to_string()
    })?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(1_000_001)
        .read_to_end(&mut bytes)
        .map_err(|_| "歌词读取失败".to_string())?;
    if bytes.len() > 1_000_000 {
        return Err("歌词响应过大".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "歌词响应格式错误".into())
}
pub(crate) fn fetch(
    title: &str,
    artist: &str,
    duration: Option<f64>,
) -> Result<LyricResult, String> {
    if title.trim().is_empty()
        || artist.trim().is_empty()
        || title.len() > 500
        || artist.len() > 500
    {
        return Err("歌曲信息不完整".into());
    }
    let query = format!("{title} {artist}");
    let result = request(
        "https://music.163.com/api/search/get/web",
        &[("s", &query), ("type", "1"), ("limit", "12")],
    );
    if let Ok(value) = result
        && let Some(items) = value.pointer("/result/songs").and_then(|v| v.as_array())
    {
        for item in items {
            let matches_title = item["name"]
                .as_str()
                .is_some_and(|s| normalized(s) == normalized(title));
            let artists = item["artists"].as_array().map(|a| {
                a.iter()
                    .filter_map(|x| x["name"].as_str())
                    .collect::<Vec<_>>()
                    .join("/")
            });
            let matches_artist = artists
                .as_deref()
                .is_some_and(|s| normalized(s) == normalized(artist));
            let secs = item["duration"].as_f64().unwrap_or(0.0) / 1000.0;
            if !matches_title
                || !matches_artist
                || duration.is_some_and(|d| secs > 0.0 && (d - secs).abs() > (d * 0.03).max(10.0))
            {
                continue;
            }
            if let Some(id) = item["id"].as_u64()
                && let Ok(data) = request(
                    "https://music.163.com/api/song/lyric",
                    &[("id", &id.to_string()), ("lv", "-1")],
                )
                && let Some(text) = data
                    .pointer("/lrc/lyric")
                    .and_then(|v| v.as_str())
                    .filter(|v| !v.trim().is_empty())
            {
                return Ok(LyricResult {
                    synced: text
                        .lines()
                        .any(|line| line.starts_with('[') && line.contains(':')),
                    text: text.to_owned(),
                });
            }
        }
    }
    let value = request(
        "https://lrclib.net/api/search",
        &[("track_name", title), ("artist_name", artist)],
    )?;
    if let Some(items) = value.as_array() {
        for item in items {
            if !item["trackName"]
                .as_str()
                .is_some_and(|s| normalized(s) == normalized(title))
                || !item["artistName"]
                    .as_str()
                    .is_some_and(|s| normalized(s) == normalized(artist))
            {
                continue;
            }
            let secs = item["duration"].as_f64().unwrap_or(0.0);
            if duration.is_some_and(|d| secs > 0.0 && (d - secs).abs() > (d * 0.03).max(10.0)) {
                continue;
            }
            if let Some(text) = item["syncedLyrics"]
                .as_str()
                .filter(|s| !s.trim().is_empty())
            {
                return Ok(LyricResult {
                    synced: true,
                    text: text.to_string(),
                });
            }
            if let Some(text) = item["plainLyrics"]
                .as_str()
                .filter(|s| !s.trim().is_empty())
            {
                return Ok(LyricResult {
                    synced: false,
                    text: text.to_string(),
                });
            }
        }
    }
    Err("未找到匹配歌词".into())
}
#[tauri::command]
pub async fn get_lyrics(
    title: String,
    artist: String,
    duration: Option<f64>,
) -> Result<LyricResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fetch(
            &title,
            &artist,
            duration.filter(|d| d.is_finite() && *d > 0.0),
        )
    })
    .await
    .map_err(|_| "歌词查询失败".to_string())?
}

#[test]
#[ignore = "requires network access to lyrics services"]
fn live_search_lyrics() {
    let result = fetch("冬天的秘密", "周传雄", None).expect("lyrics lookup");
    assert!(!result.text.trim().is_empty());
    println!("lyrics found; synced={}", result.synced);
}

#[cfg(target_os = "windows")]
#[test]
#[ignore = "requires music playing and network access"]
fn live_current_media_lyrics() {
    let media = crate::read_media_state().unwrap().expect("media session");
    assert!(
        media.position_seconds.is_some() && media.duration_seconds.is_some(),
        "timeline unavailable"
    );
    let lyrics =
        fetch(&media.title, &media.artist, media.duration_seconds).expect("current song lyrics");
    assert!(
        lyrics.synced && !lyrics.text.is_empty(),
        "synchronized lyrics unavailable"
    );
}
