//! Fetch lyrics without blocking the UI. Song metadata is sent to the lyrics
//! service: NetEase first, then QQ Music for its exclusive catalogue, then
//! LRCLIB.
use serde::Serialize;
use std::{
    collections::HashMap,
    io::Read,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, PartialEq, Serialize)]
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
fn request(url: &str, referer: &str, query: &[(&str, &str)]) -> Result<serde_json::Value, String> {
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
        .set("Referer", referer)
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

/// 播放器上报的时长与曲库时长是否可视为同一版本。QQ 音乐等播放器对未开
/// 通的曲目只放 30/60 秒试听，SMTC 报的是试听长度，远短于曲库的完整时长；
/// 此时长度不再承担版本区分，交给歌名+歌手的精确匹配（试听总是正式版的
/// 开头，搜索排序第一的就是它）。曲库反而比“试听”还短的差距不是预览形
/// 态，仍按容差拒绝。
fn duration_matches(smtc: Option<f64>, catalogue: f64) -> bool {
    if catalogue <= 0.0 {
        return true;
    }
    let Some(d) = smtc else {
        return true;
    };
    let tolerance = (d * 0.03).max(10.0);
    (d - catalogue).abs() <= tolerance || (d <= 90.0 && catalogue > d + tolerance)
}

#[test]
fn duration_tolerates_preview_lengths() {
    assert!(duration_matches(Some(180.0), 180.0));
    // 容差取 max(3%, 10s)。
    assert!(duration_matches(Some(184.0), 180.0));
    assert!(!duration_matches(Some(200.0), 180.0));
    // 60 秒试听对 3 分钟完整版、30 秒试听对更长曲库。
    assert!(duration_matches(Some(60.0), 180.0));
    assert!(duration_matches(Some(30.0), 272.0));
    // 曲库比试听还短：不是预览，拒绝。
    assert!(!duration_matches(Some(60.0), 20.0));
    // 无时长信息时沿用旧行为：不比较。
    assert!(duration_matches(None, 180.0));
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
        "https://music.163.com/",
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
            if !matches_title || !matches_artist || !duration_matches(duration, secs) {
                continue;
            }
            if let Some(id) = item["id"].as_u64()
                && let Ok(data) = request(
                    "https://music.163.com/api/song/lyric",
                    "https://music.163.com/",
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
    // QQ 音乐独家版权曲在网易云搜不到；歌词时间轴由 SMTC 提供，
    // 缺的只是这一步按曲名补齐的查找。
    if let Some(result) = qq_music_lyric(title, artist, duration) {
        return Ok(result);
    }
    let value = request(
        "https://lrclib.net/api/search",
        "https://lrclib.net/",
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
            if !duration_matches(duration, secs) {
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

/// QQ 音乐网页端公开接口（无需登录）：先按曲名+歌手搜索，再取 base64 编码的
/// LRC。与网易云路径同一套约束——精确匹配歌名与歌手、时长容差、限重定向
/// 与响应大小。QQ 音乐的独家曲库是网易云搜索填补不了的缺口。
fn qq_music_lyric(title: &str, artist: &str, duration: Option<f64>) -> Option<LyricResult> {
    let query = format!("{title} {artist}");
    let value = request(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp",
        "https://y.qq.com/",
        &[("w", &query), ("format", "json"), ("n", "12")],
    )
    .ok()?;
    let items = value.pointer("/data/song/list")?.as_array()?;
    for item in items {
        let matches_title = item["songname"]
            .as_str()
            .is_some_and(|s| normalized(s) == normalized(title));
        let singers = item["singer"].as_array().map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str())
                .collect::<Vec<_>>()
                .join("/")
        });
        // SMTC 上报的歌手可能是多人中的任一写法：完整串或单个歌手名都接受。
        let matches_artist = singers.as_deref().is_some_and(|s| {
            normalized(s) == normalized(artist)
                || s.split('/')
                    .any(|name| normalized(name) == normalized(artist))
        });
        let secs = item["interval"].as_f64().unwrap_or(0.0);
        if !matches_title || !matches_artist || !duration_matches(duration, secs) {
            continue;
        }
        let Some(mid) = item["songmid"].as_str() else {
            continue;
        };
        let Ok(data) = request(
            "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg",
            "https://y.qq.com/",
            &[("songmid", mid), ("g_tk", "5381"), ("format", "json")],
        ) else {
            continue;
        };
        let encoded = data["lyric"].as_str().filter(|v| !v.trim().is_empty());
        let Some(encoded) = encoded else {
            continue;
        };
        use base64::Engine as _;
        let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) else {
            continue;
        };
        let Ok(text) = String::from_utf8(bytes) else {
            continue;
        };
        if text.trim().is_empty() {
            continue;
        }
        return Some(LyricResult {
            synced: text
                .lines()
                .any(|line| line.starts_with('[') && line.contains(':')),
            text,
        });
    }
    None
}
#[tauri::command]
pub async fn get_lyrics(
    title: String,
    artist: String,
    duration: Option<f64>,
) -> Result<LyricResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fetch_cached(
            &title,
            &artist,
            duration.filter(|d| d.is_finite() && *d > 0.0),
        )
    })
    .await
    .map_err(|_| "歌词查询失败".to_string())?
}

/// A short-lived cache keyed by normalized song info. Players re-report the
/// same track as their timeline details settle (for example a duration
/// arriving after the title), and each such report must not turn into a
/// fresh request to the external lyrics services.
const LYRICS_TTL: Duration = Duration::from_secs(600);
const LYRICS_ERROR_TTL: Duration = Duration::from_secs(120);
const LYRICS_CACHE_CAP: usize = 32;

struct CachedLyrics {
    fetched_at: Instant,
    result: Result<LyricResult, String>,
}

static LYRICS_CACHE: LazyLock<Mutex<HashMap<(String, String), CachedLyrics>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn lyrics_cache_key(title: &str, artist: &str) -> (String, String) {
    (normalized(title), normalized(artist))
}

/// The cached result when present and fresh; misses must trigger a real
/// fetch. The freshness window depends on whether the entry holds a result
/// or a failure. `ttl` is injected so tests can exercise expiry instantly.
fn cached_lyrics(
    cache: &HashMap<(String, String), CachedLyrics>,
    key: &(String, String),
    now: Instant,
    ttl: Duration,
    error_ttl: Duration,
) -> Option<Result<LyricResult, String>> {
    let entry = cache.get(key)?;
    let fresh = now.saturating_duration_since(entry.fetched_at)
        <= if entry.result.is_ok() { ttl } else { error_ttl };
    fresh.then(|| entry.result.clone())
}

fn remember_lyrics(
    cache: &mut HashMap<(String, String), CachedLyrics>,
    key: (String, String),
    result: Result<LyricResult, String>,
    now: Instant,
) {
    cache.insert(
        key,
        CachedLyrics {
            fetched_at: now,
            result,
        },
    );
    // Bound the cache; oldest entries go first.
    while cache.len() > LYRICS_CACHE_CAP {
        let oldest = cache
            .iter()
            .min_by_key(|(_, entry)| entry.fetched_at)
            .map(|(key, _)| key.clone());
        match oldest {
            Some(key) => {
                cache.remove(&key);
            }
            None => break,
        }
    }
}

fn fetch_cached(title: &str, artist: &str, duration: Option<f64>) -> Result<LyricResult, String> {
    let key = lyrics_cache_key(title, artist);
    {
        let cache = LYRICS_CACHE
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(hit) = cached_lyrics(&cache, &key, Instant::now(), LYRICS_TTL, LYRICS_ERROR_TTL)
        {
            return hit;
        }
    }
    let result = fetch(title, artist, duration);
    let mut cache = LYRICS_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    remember_lyrics(&mut cache, key, result.clone(), Instant::now());
    result
}

#[cfg(test)]
mod cache_tests {
    use super::{LYRICS_CACHE_CAP, LyricResult, cached_lyrics, remember_lyrics};
    use std::{
        collections::HashMap,
        time::{Duration, Instant},
    };

    fn lyric(text: &str) -> Result<LyricResult, String> {
        Ok(LyricResult {
            synced: false,
            text: text.to_string(),
        })
    }

    #[test]
    fn cache_hits_within_ttl_and_expires_after() {
        let mut cache = HashMap::new();
        let key = ("song".into(), "artist".into());
        let now = Instant::now();
        remember_lyrics(&mut cache, key.clone(), lyric("hello"), now);
        assert_eq!(
            cached_lyrics(
                &cache,
                &key,
                now,
                Duration::from_secs(10),
                Duration::from_secs(1)
            ),
            Some(lyric("hello"))
        );
        let later = now + Duration::from_secs(11);
        assert_eq!(
            cached_lyrics(
                &cache,
                &key,
                later,
                Duration::from_secs(10),
                Duration::from_secs(1)
            ),
            None
        );
    }

    #[test]
    fn failures_expire_sooner_than_results() {
        let mut cache = HashMap::new();
        let key = ("missing".into(), "song".into());
        let now = Instant::now();
        remember_lyrics(&mut cache, key.clone(), Err("未找到匹配歌词".into()), now);
        let soon = now + Duration::from_secs(60);
        assert!(
            cached_lyrics(
                &cache,
                &key,
                soon,
                Duration::from_secs(600),
                Duration::from_secs(120)
            )
            .is_some()
        );
        let later = now + Duration::from_secs(180);
        assert!(
            cached_lyrics(
                &cache,
                &key,
                later,
                Duration::from_secs(600),
                Duration::from_secs(120)
            )
            .is_none()
        );
    }

    #[test]
    fn cache_evicts_oldest_beyond_cap() {
        let mut cache = HashMap::new();
        let now = Instant::now();
        for index in 0..=LYRICS_CACHE_CAP {
            let key = (format!("t{index}"), format!("a{index}"));
            remember_lyrics(
                &mut cache,
                key,
                lyric("x"),
                now + Duration::from_millis(index as u64),
            );
        }
        assert_eq!(cache.len(), LYRICS_CACHE_CAP);
        assert!(!cache.contains_key(&("t0".into(), "a0".into())));
        assert!(cache.contains_key(&(
            format!("t{LYRICS_CACHE_CAP}"),
            format!("a{LYRICS_CACHE_CAP}")
        )));
    }

    #[test]
    fn cache_dedupes_concurrent_track_reports() {
        // Simulate the frontend re-reporting the same song with a settling
        // timeline: the first fetch hits the network, the rest the cache.
        let mut cache = HashMap::new();
        let key = ("track".into(), "singer".into());
        let now = Instant::now();
        remember_lyrics(&mut cache, key.clone(), lyric("verse"), now);
        for _ in 0..3 {
            assert_eq!(
                cached_lyrics(
                    &cache,
                    &key,
                    now,
                    Duration::from_secs(600),
                    Duration::from_secs(120)
                ),
                Some(lyric("verse"))
            );
        }
        assert_eq!(cache.len(), 1);
    }
}

#[test]
#[ignore = "requires network access to lyrics services"]
fn live_search_lyrics() {
    let result = fetch("冬天的秘密", "周传雄", None).expect("lyrics lookup");
    assert!(!result.text.trim().is_empty());
    println!("lyrics found; synced={}", result.synced);
}

#[test]
#[ignore = "requires network access to QQ Music services"]
fn live_qq_music_lyrics() {
    // 周杰伦曲库是 QQ 独家，网易云搜索必然落空，正好覆盖新链路。
    let result = qq_music_lyric("晴天", "周杰伦", Some(269.3)).expect("qq lyrics lookup");
    assert!(result.synced, "QQ 音乐应返回同步歌词");
    assert!(!result.text.trim().is_empty());
    println!("qq lyrics found; synced={}", result.synced);
}

#[test]
#[ignore = "requires network access to lyrics services"]
fn live_qq_music_preview_lyrics() {
    // QQ 免费档只放 60 秒试听：SMTC 时长 60s，曲库 180s，走完整 fetch 链。
    let result = fetch("牡丹亭", "浅影阿", Some(60.0)).expect("preview-length lookup");
    assert!(result.synced, "试听时长下也应匹配到同步歌词");
    assert!(!result.text.trim().is_empty());
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
