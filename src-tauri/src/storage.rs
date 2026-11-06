use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{Emitter, Manager, State};

const DB_NAME: &str = "dynamic-island.sqlite3";
const SCHEMA_VERSION: i64 = 4;

#[derive(Serialize, Deserialize)]
struct Bootstrap {
    version: u8,
    data_directory: PathBuf,
}
pub struct Storage(pub Mutex<Inner>);
pub struct Inner {
    pub(crate) connection: Connection,
    directory: PathBuf,
    bootstrap: PathBuf,
}

#[cfg(test)]
pub(crate) fn memory_storage() -> Storage {
    let connection = initialize_connection(Connection::open_in_memory().unwrap()).unwrap();
    Storage(Mutex::new(Inner {
        connection,
        directory: PathBuf::new(),
        bootstrap: PathBuf::new(),
    }))
}

fn open_database(path: &Path) -> Result<Connection, String> {
    initialize_connection(Connection::open(path).map_err(|e| e.to_string())?)
}

fn initialize_connection(mut conn: Connection) -> Result<Connection, String> {
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|e| e.to_string())?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version > SCHEMA_VERSION {
        return Err("数据库版本高于当前应用，请升级应用".into());
    }
    if version == 0 {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); CREATE TABLE mail_accounts (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL, uid_validity INTEGER NOT NULL, last_uid INTEGER NOT NULL, UNIQUE(email, host)); PRAGMA user_version = 2;").map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    } else if version == 1 {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("ALTER TABLE mail_accounts ADD COLUMN uid_validity INTEGER NOT NULL DEFAULT 0; ALTER TABLE mail_accounts ADD COLUMN last_uid INTEGER NOT NULL DEFAULT 0; PRAGMA user_version = 2;").map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 3 {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("CREATE TABLE ai_accounts (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, name TEXT NOT NULL, secret BLOB NOT NULL, pinned INTEGER NOT NULL DEFAULT 0); PRAGMA user_version = 3;").map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    if version < 4 {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("CREATE TABLE daily_stats (day TEXT PRIMARY KEY NOT NULL, water_ml INTEGER NOT NULL DEFAULT 0, pomodoros INTEGER NOT NULL DEFAULT 0, focus_seconds INTEGER NOT NULL DEFAULT 0); PRAGMA user_version = 4;").map_err(|e| e.to_string())?;
        // Carry the pomodoro count stored for the current day into daily_stats.
        let focus_minutes = tx
            .query_row(
                "SELECT value FROM settings WHERE key='pomodoro'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
            .and_then(|value| {
                value
                    .get("focusMinutes")
                    .and_then(serde_json::Value::as_u64)
            })
            .unwrap_or(25);
        let progress = tx
            .query_row(
                "SELECT value FROM settings WHERE key='pomodoro_progress'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(progress) = progress
            && let Ok(value) = serde_json::from_str::<serde_json::Value>(&progress)
            && let Some(day) = value.get("day").and_then(serde_json::Value::as_str)
        {
            let done = value
                .get("completedToday")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0);
            if valid_day(day) && done > 0 {
                tx.execute(
                    "INSERT INTO daily_stats(day, water_ml, pomodoros, focus_seconds) VALUES (?1, 0, ?2, ?3)",
                    params![day, done, done * focus_minutes * 60],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(conn)
}

pub fn initialize(app: &tauri::AppHandle) -> Result<Storage, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let default_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    initialize_at(config_dir, default_dir)
}

fn initialize_at(config_dir: PathBuf, default_dir: PathBuf) -> Result<Storage, String> {
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let bootstrap = config_dir.join("data-location.json");
    let configured = bootstrap.exists();
    let directory = if configured {
        let data = fs::read(&bootstrap).map_err(|e| e.to_string())?;
        let value: Bootstrap =
            serde_json::from_slice(&data).map_err(|e| format!("数据目录配置无效: {e}"))?;
        if value.version != 1 || !value.data_directory.is_absolute() {
            return Err("数据目录配置无效".into());
        }
        value.data_directory
    } else {
        default_dir.clone()
    };
    if configured && !directory.join(DB_NAME).is_file() {
        return Err("指定的数据文件不存在，请检查数据目录是否可访问".into());
    }
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let db_path = directory.join(DB_NAME);
    let conn = if configured {
        initialize_connection(
            Connection::open_with_flags(&db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(|e| e.to_string())?,
        )?
    } else {
        open_database(&db_path)?
    };
    let has_appearance: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM settings WHERE key='appearance')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !configured && !has_appearance {
        let old = default_dir.join("settings.json");
        if old.exists() {
            let bytes = fs::read(old).map_err(|e| e.to_string())?;
            let value: serde_json::Value =
                serde_json::from_slice(&bytes).map_err(|e| format!("旧设置读取失败: {e}"))?;
            if let Some(appearance) = value.get("appearance") {
                conn.execute(
                    "INSERT INTO settings(key,value) VALUES ('appearance',?1)",
                    [appearance.to_string()],
                )
                .map_err(|e| format!("旧设置迁移失败: {e}"))?;
            }
        }
    }
    Ok(Storage(Mutex::new(Inner {
        connection: conn,
        directory,
        bootstrap,
    })))
}

#[tauri::command]
pub fn load_appearance(storage: State<'_, Storage>) -> Result<Option<serde_json::Value>, String> {
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    let value: Option<String> = db
        .connection
        .query_row(
            "SELECT value FROM settings WHERE key='appearance'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    value
        .map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
        .transpose()
}

/// Extracts the island size multiplier (0.8–1.2) from a stored appearance
/// payload; anything missing or malformed falls back to the default.
fn parse_island_user_scale(value: Option<serde_json::Value>) -> f64 {
    value
        .and_then(|v| v.get("scale").and_then(|s| s.as_f64()))
        .filter(|s| (0.8..=1.2).contains(s))
        .unwrap_or(1.0)
}

/// The saved island size multiplier, applied to the island at startup before
/// its position is restored. Defaults when the setting or database is
/// unavailable so a broken settings row cannot break the island.
pub fn load_island_user_scale(storage: &Storage) -> f64 {
    let Ok(db) = storage.0.lock() else {
        return 1.0;
    };
    let value: Option<String> = db
        .connection
        .query_row(
            "SELECT value FROM settings WHERE key='appearance'",
            [],
            |row| row.get(0),
        )
        .optional()
        .unwrap_or(None);
    parse_island_user_scale(value.and_then(|s| serde_json::from_str(&s).ok()))
}

#[tauri::command]
pub fn save_appearance(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    value: serde_json::Value,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("当前窗口不能修改设置".into());
    }
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    save_appearance_value(&db.connection, &value)
}

fn save_appearance_value(conn: &Connection, value: &serde_json::Value) -> Result<(), String> {
    validate_appearance(value)?;
    conn.execute("INSERT INTO settings(key,value) VALUES ('appearance',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![value.to_string()]).map_err(|e| e.to_string())?;
    Ok(())
}

fn validate_appearance(value: &serde_json::Value) -> Result<(), String> {
    let scale = value
        .get("scale")
        .and_then(|v| v.as_f64())
        .filter(|v| (0.8..=1.2).contains(v));
    let delay = value
        .get("autoCollapseSeconds")
        .and_then(|v| v.as_u64())
        .filter(|v| [0, 1, 3, 5, 10, 15].contains(v));
    let language = value.get("language").and_then(|v| v.as_str());
    let version = value.get("version").and_then(|v| v.as_u64());
    let idle_widgets_valid = match version {
        Some(8..=13) => value
            .get("idleWidgets")
            .and_then(|v| v.as_array())
            .is_some_and(|items| {
                let mut seen: Vec<&str> = Vec::new();
                items.len() <= 6
                    && items.iter().all(|item| match item.as_str() {
                        Some(id)
                            if (matches!(
                                id,
                                "clock"
                                    | "quota"
                                    | "water"
                                    | "pomodoro"
                                    | "music"
                                    | "battery"
                                    | "focus"
                                    | "streak"
                                    | "volume"
                                    | "bluetooth"
                                    | "waterTimer"
                                    | "countdown"
                            ) || (id == "mascot" && matches!(version, Some(11..=13))))
                                && !seen.contains(&id) =>
                        {
                            seen.push(id);
                            true
                        }
                        _ => false,
                    })
            }),
        Some(6 | 7) => value
            .get("idleWidgets")
            .and_then(|v| v.as_array())
            .is_some_and(|items| {
                let mut seen: Vec<&str> = Vec::new();
                items.len() <= 5
                    && items.iter().all(|item| match item.as_str() {
                        Some(id)
                            if matches!(id, "clock" | "quota" | "water" | "pomodoro" | "music")
                                && !seen.contains(&id) =>
                        {
                            seen.push(id);
                            true
                        }
                        _ => false,
                    })
            }),
        Some(5) => true,
        _ => false,
    };
    let lyrics_valid = match version {
        Some(7..=13) => value
            .get("islandLyrics")
            .and_then(|v| v.as_bool())
            .is_some(),
        _ => true,
    };
    let pomodoro_view_valid = match version {
        Some(8..=13) => matches!(
            value.get("pomodoroView").and_then(|v| v.as_str()),
            Some("count" | "focus" | "cycle")
        ),
        _ => true,
    };
    let reminder_valid = match version {
        Some(10..=13) => {
            matches!(
                value.get("reminderStyle").and_then(|v| v.as_str()),
                Some("breathe" | "sweep" | "pulse" | "beam" | "none")
            ) && value
                .get("reminderAutoExpand")
                .and_then(|v| v.as_bool())
                .is_some()
        }
        Some(9) => {
            matches!(
                value.get("reminderStyle").and_then(|v| v.as_str()),
                Some("breathe" | "sweep" | "pulse" | "none")
            ) && value
                .get("reminderAutoExpand")
                .and_then(|v| v.as_bool())
                .is_some()
        }
        _ => true,
    };
    let shape_valid = !matches!(version, Some(12 | 13))
        || matches!(
            value.get("expandedShape").and_then(|v| v.as_str()),
            Some("classic" | "soft" | "asymmetric" | "oval")
        );
    let hotkeys_valid = match version {
        Some(13) => {
            value.get("hotkeyFocus").is_some_and(hotkey_setting_valid)
                && value.get("hotkeyWater").is_some_and(hotkey_setting_valid)
                && value.get("hotkeyIsland").is_some_and(hotkey_setting_valid)
                && value
                    .get("forwardNotifications")
                    .and_then(|v| v.as_bool())
                    .is_some()
        }
        _ => true,
    };
    if !shape_valid
        || !hotkeys_valid
        || !idle_widgets_valid
        || !lyrics_valid
        || !pomodoro_view_valid
        || !reminder_valid
        || !matches!(
            value.get("theme").and_then(|v| v.as_str()),
            Some("system" | "light" | "dark")
        )
        || !matches!(
            value.get("expandTrigger").and_then(|v| v.as_str()),
            Some("click" | "hover")
        )
        || !matches!(language, Some("zh-CN" | "en-US"))
        || scale.is_none()
        || delay.is_none()
        || value.get("showClock").and_then(|v| v.as_bool()).is_none()
    {
        return Err("设置格式无效，未保存".into());
    }
    Ok(())
}

/// `null` disables a hotkey; otherwise modifiers plus exactly one key.
fn hotkey_setting_valid(value: &serde_json::Value) -> bool {
    if value.is_null() {
        return true;
    }
    let Some(combo) = value.get("combo").and_then(|v| v.as_str()) else {
        return false;
    };
    if combo.is_empty() || combo.len() > 32 || !hotkey_combo_valid(combo) {
        return false;
    }
    value.get("double").and_then(|v| v.as_bool()).is_some()
}

/// Mirrors the frontend rules: Ctrl/Shift/Alt/Win at most once each, then one
/// key. Bare letters, digits and Space would swallow normal typing.
fn hotkey_combo_valid(combo: &str) -> bool {
    let parts: Vec<&str> = combo.split('+').map(str::trim).collect();
    let Some((key, modifier_parts)) = parts.split_last() else {
        return false;
    };
    if key.is_empty() || modifier_parts.len() > 4 {
        return false;
    }
    let mut seen = [false; 4];
    for part in modifier_parts {
        let index = match part.to_ascii_lowercase().as_str() {
            "ctrl" => 0,
            "shift" => 1,
            "alt" => 2,
            "win" => 3,
            _ => return false,
        };
        if seen[index] {
            return false;
        }
        seen[index] = true;
    }
    let function_key = key.len() >= 2
        && key.starts_with('F')
        && key[1..]
            .parse::<u8>()
            .is_ok_and(|number| (1..=24).contains(&number));
    if function_key {
        return true;
    }
    if *key == "Space" {
        return !modifier_parts.is_empty();
    }
    let mut chars = key.chars();
    match (chars.next(), chars.next()) {
        (Some(c), None) if c.is_ascii_uppercase() || c.is_ascii_digit() => {
            !modifier_parts.is_empty()
        }
        _ => false,
    }
}

const POSITION_KEY: &str = "island_position";
const POMODORO_KEY: &str = "pomodoro";
const POMODORO_PROGRESS_KEY: &str = "pomodoro_progress";
const WATER_KEY: &str = "water";
const COUNTDOWNS_KEY: &str = "countdowns";
const TIMER_KEY: &str = "timer";

fn load_json_setting(storage: &Storage, key: &str) -> Result<Option<serde_json::Value>, String> {
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    let value: Option<String> = db
        .connection
        .query_row("SELECT value FROM settings WHERE key=?1", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())?;
    value
        .map(|stored| serde_json::from_str(&stored).map_err(|e| e.to_string()))
        .transpose()
}

fn save_json_setting(
    storage: &Storage,
    key: &str,
    value: &serde_json::Value,
) -> Result<(), String> {
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    db.connection
        .execute(
            "INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value.to_string()],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn setting_number(value: &serde_json::Value, key: &str, min: u64, max: u64) -> bool {
    value
        .get(key)
        .and_then(serde_json::Value::as_u64)
        .is_some_and(|number| (min..=max).contains(&number))
}

fn validate_pomodoro(value: &serde_json::Value) -> Result<(), String> {
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || !setting_number(value, "focusMinutes", 1, 180)
        || !setting_number(value, "shortBreakMinutes", 1, 60)
        || !setting_number(value, "longBreakMinutes", 1, 120)
        || !setting_number(value, "longBreakEvery", 2, 12)
    {
        return Err("番茄钟设置格式无效，未保存".into());
    }
    Ok(())
}

fn valid_day(day: &str) -> bool {
    day.len() == 10
        && day.as_bytes().iter().enumerate().all(|(index, byte)| {
            if index == 4 || index == 7 {
                *byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
}

fn validate_pomodoro_progress(value: &serde_json::Value) -> Result<(), String> {
    let day_valid = value
        .get("day")
        .and_then(serde_json::Value::as_str)
        .is_some_and(valid_day);
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || !day_valid
        || !setting_number(value, "completedToday", 0, 999)
        || !setting_number(value, "cycle", 0, 99)
    {
        return Err("番茄钟进度格式无效，未保存".into());
    }
    Ok(())
}

#[tauri::command]
pub fn load_pomodoro(storage: State<'_, Storage>) -> Result<Option<serde_json::Value>, String> {
    load_json_setting(storage.inner(), POMODORO_KEY)
}

#[tauri::command]
pub fn save_pomodoro(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    value: serde_json::Value,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("当前窗口不能修改番茄钟设置".into());
    }
    validate_pomodoro(&value)?;
    save_json_setting(storage.inner(), POMODORO_KEY, &value)
}

#[tauri::command]
pub fn load_pomodoro_progress(
    storage: State<'_, Storage>,
) -> Result<Option<serde_json::Value>, String> {
    load_json_setting(storage.inner(), POMODORO_PROGRESS_KEY)
}

#[tauri::command]
pub fn save_pomodoro_progress(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    value: serde_json::Value,
) -> Result<(), String> {
    if window.label() != "island" {
        return Err("当前窗口不能保存番茄钟进度".into());
    }
    validate_pomodoro_progress(&value)?;
    save_json_setting(storage.inner(), POMODORO_PROGRESS_KEY, &value)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStat {
    day: String,
    water_ml: i64,
    pomodoros: i64,
    focus_seconds: i64,
}

fn validate_water(value: &serde_json::Value) -> Result<(), String> {
    let start = value.get("activeStart").and_then(serde_json::Value::as_u64);
    let end = value.get("activeEnd").and_then(serde_json::Value::as_u64);
    let (Some(start), Some(end)) = (start, end) else {
        return Err("喝水设置格式无效，未保存".into());
    };
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || value
            .get("enabled")
            .and_then(serde_json::Value::as_bool)
            .is_none()
        || !setting_number(value, "goalMl", 500, 10000)
        || !setting_number(value, "cupMl", 50, 2000)
        || !value
            .get("reminderMinutes")
            .and_then(serde_json::Value::as_u64)
            .is_some_and(|minutes| minutes >= 1)
        || start > 23
        || !(1..=24).contains(&end)
        || start >= end
    {
        return Err("喝水设置格式无效，未保存".into());
    }
    Ok(())
}

#[tauri::command]
pub fn load_water(storage: State<'_, Storage>) -> Result<Option<serde_json::Value>, String> {
    load_json_setting(storage.inner(), WATER_KEY)
}

#[tauri::command]
pub fn save_water(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    value: serde_json::Value,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("当前窗口不能修改喝水设置".into());
    }
    validate_water(&value)?;
    save_json_setting(storage.inner(), WATER_KEY, &value)
}

#[tauri::command]
pub fn load_countdowns(storage: State<'_, Storage>) -> Result<Option<serde_json::Value>, String> {
    load_json_setting(storage.inner(), COUNTDOWNS_KEY)
}

#[tauri::command]
pub fn save_countdowns(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    value: serde_json::Value,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("当前窗口不能修改倒计时设置".into());
    }
    validate_countdowns(&value)?;
    save_json_setting(storage.inner(), COUNTDOWNS_KEY, &value)
}

#[tauri::command]
pub fn load_timer(storage: State<'_, Storage>) -> Result<Option<serde_json::Value>, String> {
    load_json_setting(storage.inner(), TIMER_KEY)
}

#[tauri::command]
pub fn save_timer(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    value: Option<serde_json::Value>,
) -> Result<(), String> {
    if !matches!(window.label(), "island" | "main") {
        return Err("当前窗口不能保存计时状态".into());
    }
    match value {
        Some(snapshot) => {
            validate_timer(&snapshot)?;
            save_json_setting(storage.inner(), TIMER_KEY, &snapshot)
        }
        None => {
            let db = storage.0.lock().map_err(|error| error.to_string())?;
            db.connection
                .execute("DELETE FROM settings WHERE key=?1", params![TIMER_KEY])
                .map_err(|error| error.to_string())?;
            Ok(())
        }
    }
}

fn valid_clock(text: &str) -> bool {
    let mut parts = text.split(':');
    let (Some(hours), Some(minutes), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    hours.len() == 2
        && minutes.len() == 2
        && hours.chars().all(|value| value.is_ascii_digit())
        && minutes.chars().all(|value| value.is_ascii_digit())
        && hours.parse::<u32>().is_ok_and(|value| value <= 23)
        && minutes.parse::<u32>().is_ok_and(|value| value <= 59)
}

fn validate_countdowns(value: &serde_json::Value) -> Result<(), String> {
    let record = value.as_object().ok_or("倒计时设置无效")?;
    if record.get("version") != Some(&serde_json::json!(1)) {
        return Err("倒计时设置版本无效".into());
    }
    let items = record
        .get("items")
        .and_then(serde_json::Value::as_array)
        .ok_or("倒计时列表无效")?;
    if items.len() > 8 {
        return Err("倒计时数量过多".into());
    }
    let mut ids: Vec<String> = Vec::new();
    for item in items {
        let entry = item.as_object().ok_or("倒计时项目无效")?;
        let id = entry
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= 64)
            .ok_or("倒计时标识无效")?;
        let label = entry
            .get("label")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.chars().count() <= 24)
            .ok_or("倒计时名称无效")?;
        let _ = label;
        if ids.iter().any(|existing| existing == id) {
            return Err("倒计时标识重复".into());
        }
        match entry.get("kind").and_then(serde_json::Value::as_str) {
            Some("target") => {
                let time = entry
                    .get("targetTime")
                    .and_then(serde_json::Value::as_str)
                    .ok_or("倒计时时间无效")?;
                if !valid_clock(time) {
                    return Err("倒计时时间无效".into());
                }
            }
            Some("duration") => {
                let seconds = entry
                    .get("durationSeconds")
                    .and_then(serde_json::Value::as_u64)
                    .ok_or("倒计时时长无效")?;
                if !(1..=59_999).contains(&seconds) {
                    return Err("倒计时时长无效".into());
                }
            }
            _ => return Err("倒计时类型无效".into()),
        }
        ids.push(id.to_string());
    }
    if let Some(island) = record.get("islandId")
        && !island.is_null()
    {
        let id = island.as_str().ok_or("岛上倒计时选择无效")?;
        if !ids.iter().any(|existing| existing == id) {
            return Err("岛上倒计时选择无效".into());
        }
    }
    Ok(())
}

fn validate_timer(value: &serde_json::Value) -> Result<(), String> {
    let record = value.as_object().ok_or("计时器状态无效")?;
    if record.get("version") != Some(&serde_json::json!(1)) {
        return Err("计时器状态版本无效".into());
    }
    let kind = record
        .get("kind")
        .and_then(serde_json::Value::as_str)
        .ok_or("计时器类型无效")?;
    let mode = record
        .get("mode")
        .and_then(serde_json::Value::as_str)
        .ok_or("计时器模式无效")?;
    let mode_valid = match kind {
        "pomodoro" => matches!(mode, "focus" | "break" | "longBreak"),
        "timer" => mode == "timer",
        "countdown" => mode == "countdown",
        _ => false,
    };
    if !mode_valid {
        return Err("计时器类型无效".into());
    }
    let duration_ms = record
        .get("durationMs")
        .and_then(serde_json::Value::as_u64)
        .filter(|value| (1000..=59_999_000).contains(value))
        .ok_or("计时器时长无效")?;
    let _ = duration_ms;
    if let Some(label) = record.get("label")
        && !label.is_null()
    {
        let text = label.as_str().ok_or("计时器名称无效")?;
        if text.is_empty() || text.chars().count() > 24 {
            return Err("计时器名称无效".into());
        }
    }
    let countdown_id = record
        .get("countdownId")
        .and_then(serde_json::Value::as_str);
    if let Some(id) = countdown_id {
        if id.is_empty() || id.len() > 64 {
            return Err("倒计时标识无效".into());
        }
    } else if kind == "countdown" {
        return Err("倒计时标识缺失".into());
    }
    let state = record
        .get("state")
        .and_then(serde_json::Value::as_object)
        .ok_or("计时器状态无效")?;
    let status = state
        .get("status")
        .and_then(serde_json::Value::as_str)
        .ok_or("计时器状态无效")?;
    match status {
        "idle" | "finished" => {}
        "running" => {
            if state
                .get("endsAt")
                .and_then(serde_json::Value::as_f64)
                .filter(|value| value.is_finite() && *value > 0.0)
                .is_none()
            {
                return Err("计时器结束时间无效".into());
            }
        }
        "paused" => {
            if state
                .get("remainingMs")
                .and_then(serde_json::Value::as_f64)
                .filter(|value| value.is_finite() && *value > 0.0)
                .is_none()
            {
                return Err("计时器剩余时间无效".into());
            }
        }
        _ => return Err("计时器状态无效".into()),
    }
    Ok(())
}

fn read_daily_stat(connection: &Connection, day: &str) -> Result<DailyStat, String> {
    connection
        .query_row(
            "SELECT day, water_ml, pomodoros, focus_seconds FROM daily_stats WHERE day=?1",
            [day],
            |row| {
                Ok(DailyStat {
                    day: row.get(0)?,
                    water_ml: row.get(1)?,
                    pomodoros: row.get(2)?,
                    focus_seconds: row.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_daily_stats(storage: State<'_, Storage>, limit: u32) -> Result<Vec<DailyStat>, String> {
    let limit = limit.clamp(1, 366);
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    let mut statement = db
        .connection
        .prepare("SELECT day, water_ml, pomodoros, focus_seconds FROM daily_stats ORDER BY day DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([limit], |row| {
            Ok(DailyStat {
                day: row.get(0)?,
                water_ml: row.get(1)?,
                pomodoros: row.get(2)?,
                focus_seconds: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_water(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    day: String,
    amount_ml: u32,
) -> Result<DailyStat, String> {
    if !matches!(window.label(), "main" | "island") {
        return Err("当前窗口不能记录饮水".into());
    }
    if !valid_day(&day) || amount_ml == 0 || amount_ml > 5000 {
        return Err("饮水记录无效".into());
    }
    let stat = {
        let db = storage.0.lock().map_err(|e| e.to_string())?;
        db.connection
            .execute(
                "INSERT INTO daily_stats(day, water_ml) VALUES (?1, ?2) ON CONFLICT(day) DO UPDATE SET water_ml = water_ml + excluded.water_ml",
                params![day, amount_ml],
            )
            .map_err(|e| e.to_string())?;
        read_daily_stat(&db.connection, &day)?
    };
    let _ = app.emit("daily-stats-changed", &stat);
    Ok(stat)
}

fn reset_water_for_day(connection: &Connection, day: &str) -> Result<DailyStat, String> {
    connection
        .execute("UPDATE daily_stats SET water_ml = 0 WHERE day=?1", [day])
        .map_err(|e| e.to_string())?;
    connection
        .query_row(
            "SELECT day, water_ml, pomodoros, focus_seconds FROM daily_stats WHERE day=?1",
            [day],
            |row| {
                Ok(DailyStat {
                    day: row.get(0)?,
                    water_ml: row.get(1)?,
                    pomodoros: row.get(2)?,
                    focus_seconds: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
        .map(|stat| {
            stat.unwrap_or(DailyStat {
                day: day.to_string(),
                water_ml: 0,
                pomodoros: 0,
                focus_seconds: 0,
            })
        })
}

#[tauri::command]
pub fn reset_water(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    day: String,
) -> Result<DailyStat, String> {
    if window.label() != "main" {
        return Err("当前窗口不能重置饮水数据".into());
    }
    if !valid_day(&day) {
        return Err("日期无效".into());
    }
    let stat = {
        let db = storage.0.lock().map_err(|e| e.to_string())?;
        reset_water_for_day(&db.connection, &day)?
    };
    let _ = app.emit("daily-stats-changed", &stat);
    Ok(stat)
}

#[tauri::command]
pub fn record_pomodoro(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    day: String,
    focus_minutes: u32,
) -> Result<DailyStat, String> {
    if window.label() != "island" {
        return Err("当前窗口不能记录专注".into());
    }
    if !valid_day(&day) || focus_minutes == 0 || focus_minutes > 180 {
        return Err("专注记录无效".into());
    }
    let stat = {
        let db = storage.0.lock().map_err(|e| e.to_string())?;
        db.connection
            .execute(
                "INSERT INTO daily_stats(day, pomodoros, focus_seconds) VALUES (?1, 1, ?2) ON CONFLICT(day) DO UPDATE SET pomodoros = pomodoros + 1, focus_seconds = focus_seconds + excluded.focus_seconds",
                params![day, focus_minutes * 60],
            )
            .map_err(|e| e.to_string())?;
        read_daily_stat(&db.connection, &day)?
    };
    let _ = app.emit("daily-stats-changed", &stat);
    Ok(stat)
}

/// Where the island window was last dragged to, in physical screen pixels.
pub fn load_island_position(storage: &Storage) -> Option<(i32, i32)> {
    let db = storage.0.lock().ok()?;
    let value: Option<String> = db
        .connection
        .query_row(
            "SELECT value FROM settings WHERE key=?1",
            [POSITION_KEY],
            |row| row.get(0),
        )
        .optional()
        .ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&value?).ok()?;
    let x = parsed.get("x")?.as_i64()?;
    let y = parsed.get("y")?.as_i64()?;
    Some((i32::try_from(x).ok()?, i32::try_from(y).ok()?))
}

pub fn save_island_position(storage: &Storage, x: i32, y: i32) -> Result<(), String> {
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    let value = serde_json::json!({ "x": x, "y": y }).to_string();
    db.connection
        .execute(
            "INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![POSITION_KEY, value],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Forgets the remembered position so the island returns to its default spot.
pub fn clear_island_position(storage: &Storage) -> Result<(), String> {
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    db.connection
        .execute("DELETE FROM settings WHERE key=?1", [POSITION_KEY])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_data_directory(storage: State<'_, Storage>) -> Result<String, String> {
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    Ok(display_directory(&db.directory))
}

fn display_directory(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }
}

fn write_bootstrap(path: &Path, directory: &Path) -> Result<(), String> {
    let mut file = tempfile::NamedTempFile::new_in(path.parent().ok_or("配置目录无效")?)
        .map_err(|e| e.to_string())?;
    serde_json::to_writer(
        &mut file,
        &Bootstrap {
            version: 1,
            data_directory: directory.to_path_buf(),
        },
    )
    .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_data_directory(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    directory: String,
) -> Result<String, String> {
    if window.label() != "main" {
        return Err("当前窗口不能修改数据目录".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        migrate_directory(&app.state::<Storage>(), directory)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn migrate_directory(storage: &Storage, directory: String) -> Result<String, String> {
    let mut db = storage.0.lock().map_err(|e| e.to_string())?;
    let target_dir = fs::canonicalize(&directory).map_err(|e| format!("无法访问所选目录: {e}"))?;
    if !target_dir.is_dir() {
        return Err("请选择一个目录".into());
    }
    if fs::canonicalize(&db.directory).map_err(|e| e.to_string())? == target_dir {
        return Ok(display_directory(&target_dir));
    }
    let target = target_dir.join(DB_NAME);
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| format!("无法创建数据库（目标可能已存在）: {e}"))?;
    let result = (|| -> Result<Connection, String> {
        let mut destination = Connection::open(&target).map_err(|e| e.to_string())?;
        let backup = rusqlite::backup::Backup::new(&db.connection, &mut destination)
            .map_err(|e| e.to_string())?;
        backup
            .run_to_completion(100, Duration::from_millis(20), None)
            .map_err(|e| e.to_string())?;
        drop(backup);
        let check: String = destination
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if check != "ok" {
            return Err("复制后的数据库校验失败".into());
        }
        drop(destination);
        let destination = open_database(&target)?;
        write_bootstrap(&db.bootstrap, &target_dir)?;
        Ok(destination)
    })();
    match result {
        Ok(connection) => {
            db.connection = connection;
            db.directory = target_dir;
            Ok(display_directory(&db.directory))
        }
        Err(error) => {
            let _ = fs::remove_file(&target);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn use_existing_data_directory(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    directory: String,
) -> Result<String, String> {
    if window.label() != "main" {
        return Err("当前窗口不能修改数据目录".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        open_existing_directory(&app.state::<Storage>(), directory)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn open_existing_directory(storage: &Storage, directory: String) -> Result<String, String> {
    let mut db = storage.0.lock().map_err(|e| e.to_string())?;
    let target_dir = fs::canonicalize(directory).map_err(|e| format!("无法访问所选目录: {e}"))?;
    if !target_dir.is_dir() {
        return Err("请选择一个目录".into());
    }
    if fs::canonicalize(&db.directory).map_err(|e| e.to_string())? == target_dir {
        return Ok(display_directory(&target_dir));
    }
    let target = target_dir.join(DB_NAME);
    let check = Connection::open_with_flags(&target, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "所选目录没有可读取的数据库")?;
    let version: i64 = check
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let integrity: String = check
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let tables: i64 = check.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('settings','mail_accounts')", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if !(1..=SCHEMA_VERSION).contains(&version) || integrity != "ok" || tables != 2 {
        return Err("数据库无效或版本不受支持，未切换数据目录".into());
    }
    check
        .prepare("SELECT key,value FROM settings LIMIT 0")
        .map_err(|_| "数据库结构无效，未切换数据目录")?;
    let account_columns = if version == 1 {
        "SELECT id,email,host,port FROM mail_accounts LIMIT 0"
    } else {
        "SELECT id,email,host,port,uid_validity,last_uid FROM mail_accounts LIMIT 0"
    };
    check
        .prepare(account_columns)
        .map_err(|_| "数据库结构无效，未切换数据目录")?;
    if version >= 3 {
        check
            .prepare("SELECT id,provider,name,secret,pinned FROM ai_accounts LIMIT 0")
            .map_err(|_| "数据库结构无效，未切换数据目录")?;
    }
    drop(check);
    let connection = initialize_connection(
        Connection::open_with_flags(&target, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
            .map_err(|e| e.to_string())?,
    )?;
    write_bootstrap(&db.bootstrap, &target_dir)?;
    db.connection = connection;
    db.directory = target_dir;
    Ok(display_directory(&db.directory))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_island_user_scale_with_fallback() {
        assert_eq!(
            parse_island_user_scale(Some(serde_json::json!({"scale": 1.2}))),
            1.2
        );
        assert_eq!(
            parse_island_user_scale(Some(serde_json::json!({"scale": 0.8}))),
            0.8
        );
        assert_eq!(
            parse_island_user_scale(Some(serde_json::json!({"scale": 1.5}))),
            1.0
        );
        assert_eq!(parse_island_user_scale(Some(serde_json::json!({}))), 1.0);
        assert_eq!(parse_island_user_scale(None), 1.0);
        assert_eq!(parse_island_user_scale(Some(serde_json::json!("bad"))), 1.0);
    }

    #[test]
    fn validates_pomodoro_settings_and_progress() {
        assert!(
            validate_pomodoro(&serde_json::json!({
                "version": 1,
                "focusMinutes": 25,
                "shortBreakMinutes": 5,
                "longBreakMinutes": 15,
                "longBreakEvery": 4
            }))
            .is_ok()
        );
        assert!(
            validate_pomodoro(&serde_json::json!({
                "version": 1,
                "focusMinutes": 0,
                "shortBreakMinutes": 5,
                "longBreakMinutes": 15,
                "longBreakEvery": 4
            }))
            .is_err()
        );
        assert!(
            validate_pomodoro_progress(&serde_json::json!({
                "version": 1,
                "day": "2026-11-05",
                "completedToday": 2,
                "cycle": 1
            }))
            .is_ok()
        );
        assert!(
            validate_pomodoro_progress(&serde_json::json!({
                "version": 1,
                "day": "2026/11/05",
                "completedToday": 2,
                "cycle": 1
            }))
            .is_err()
        );
    }

    #[test]
    fn migrates_legacy_settings_and_preserves_database_when_switching() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("config");
        let old = root.path().join("old");
        let new = root.path().join("new");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(
            old.join("settings.json"),
            r#"{"appearance":{"version":2,"scale":1.1,"showClock":true,"autoCollapseSeconds":3}}"#,
        )
        .unwrap();
        let storage = initialize_at(config.clone(), old.clone()).unwrap();
        {
            let db = storage.0.lock().unwrap();
            let value: String = db
                .connection
                .query_row(
                    "SELECT value FROM settings WHERE key='appearance'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&value).unwrap()["scale"],
                1.1
            );
            db.connection.execute("INSERT INTO mail_accounts VALUES ('a','a@example.com','imap.example.com',993,1,10)", []).unwrap();
        }
        migrate_directory(&storage, new.to_string_lossy().into_owned()).unwrap();
        assert!(old.join(DB_NAME).exists());
        assert!(new.join(DB_NAME).exists());
        let reopened = initialize_at(config, old.clone()).unwrap();
        assert_eq!(
            reopened
                .0
                .lock()
                .unwrap()
                .connection
                .query_row("SELECT count(*) FROM mail_accounts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(migrate_directory(&storage, old.to_string_lossy().into_owned()).is_err());
        open_existing_directory(&storage, old.to_string_lossy().into_owned()).unwrap();
        assert_eq!(
            storage
                .0
                .lock()
                .unwrap()
                .connection
                .query_row("SELECT count(*) FROM mail_accounts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn refuses_unknown_versions_and_invalid_appearance() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(DB_NAME);
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        drop(conn);
        assert!(open_database(&path).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 5, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "hover", "language": "zh-CN"})).is_ok());
        assert!(validate_appearance(&serde_json::json!({"version": 5, "theme": "invalid", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 5, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "double", "language": "zh-CN"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 5, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "xx"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 5, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 4, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 3, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 6, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN", "idleWidgets": ["water", "clock"]})).is_ok());
        assert!(validate_appearance(&serde_json::json!({"version": 6, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 6, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN", "idleWidgets": ["clock", "clock"]})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 6, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN", "idleWidgets": ["clock", "unknown"]})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 7, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN", "idleWidgets": ["clock", "music"], "islandLyrics": false})).is_ok());
        assert!(validate_appearance(&serde_json::json!({"version": 7, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN", "idleWidgets": ["clock"], "islandLyrics": true})).is_ok());
        assert!(validate_appearance(&serde_json::json!({"version": 7, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click", "language": "zh-CN", "idleWidgets": ["clock"]})).is_err());

        let v8 = serde_json::json!({
            "version": 8,
            "theme": "system",
            "scale": 1.0,
            "showClock": true,
            "autoCollapseSeconds": 3,
            "expandTrigger": "hover",
            "language": "zh-CN",
            "idleWidgets": ["clock", "battery", "focus", "streak", "volume", "bluetooth"],
            "pomodoroView": "cycle",
            "islandLyrics": false
        });
        assert!(validate_appearance(&v8).is_ok());
        let mut too_many = v8.clone();
        too_many["idleWidgets"] = serde_json::json!([
            "clock",
            "battery",
            "focus",
            "streak",
            "volume",
            "bluetooth",
            "waterTimer"
        ]);
        assert!(validate_appearance(&too_many).is_err());
        let mut unknown_widget = v8.clone();
        unknown_widget["idleWidgets"] = serde_json::json!(["clock", "weather"]);
        assert!(validate_appearance(&unknown_widget).is_err());
        let mut bad_view = v8.clone();
        bad_view["pomodoroView"] = serde_json::json!("unknown");
        assert!(validate_appearance(&bad_view).is_err());
        let mut missing_view = v8.clone();
        missing_view.as_object_mut().unwrap().remove("pomodoroView");
        assert!(validate_appearance(&missing_view).is_err());

        let v9 = serde_json::json!({
            "version": 9,
            "theme": "system",
            "scale": 1.0,
            "showClock": true,
            "autoCollapseSeconds": 3,
            "expandTrigger": "click",
            "language": "zh-CN",
            "idleWidgets": ["clock", "water"],
            "pomodoroView": "count",
            "islandLyrics": true,
            "reminderStyle": "sweep",
            "reminderAutoExpand": true
        });
        assert!(validate_appearance(&v9).is_ok());
        let mut bad_style = v9.clone();
        bad_style["reminderStyle"] = serde_json::json!("sparkle");
        assert!(validate_appearance(&bad_style).is_err());
        let mut missing_expand = v9.clone();
        missing_expand
            .as_object_mut()
            .unwrap()
            .remove("reminderAutoExpand");
        assert!(validate_appearance(&missing_expand).is_err());
        let mut missing_style = v9.clone();
        missing_style
            .as_object_mut()
            .unwrap()
            .remove("reminderStyle");
        assert!(validate_appearance(&missing_style).is_err());

        let mut v10 = v9.clone();
        v10["version"] = serde_json::json!(10);
        v10["reminderStyle"] = serde_json::json!("beam");
        assert!(validate_appearance(&v10).is_ok());
        let mut v11 = v10.clone();
        v11["version"] = serde_json::json!(11);
        v11["idleWidgets"] = serde_json::json!(["mascot", "clock"]);
        assert!(validate_appearance(&v11).is_ok());
        let mut legacy_mascot = v10.clone();
        legacy_mascot["idleWidgets"] = serde_json::json!(["mascot", "clock"]);
        assert!(validate_appearance(&legacy_mascot).is_err());
        let mut v12 = v11.clone();
        v12["version"] = serde_json::json!(12);
        assert!(validate_appearance(&v12).is_err());
        v12["expandedShape"] = serde_json::json!("soft");
        assert!(validate_appearance(&v12).is_ok());
        v12["expandedShape"] = serde_json::json!("invalid");
        assert!(validate_appearance(&v12).is_err());
        v11["idleWidgets"] = serde_json::json!(["mascot", "mascot"]);
        assert!(validate_appearance(&v11).is_err());
        let conn = initialize_connection(Connection::open_in_memory().unwrap()).unwrap();
        save_appearance_value(&conn, &v10).unwrap();
        assert!(save_appearance_value(&conn, &v11).is_err());
        let stored: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key='appearance'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&stored).unwrap(),
            v10
        );
        v11["idleWidgets"] = serde_json::json!(["mascot", "clock"]);
        save_appearance_value(&conn, &v11).unwrap();
        let stored: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key='appearance'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&stored).unwrap(),
            v11
        );
        let mut legacy_beam = v9.clone();
        legacy_beam["reminderStyle"] = serde_json::json!("beam");
        assert!(validate_appearance(&legacy_beam).is_err());
    }

    #[test]
    fn validates_countdowns_and_timer_snapshots() {
        let countdowns = serde_json::json!({
            "version": 1,
            "items": [
                {"id": "off-work", "label": "下班", "kind": "target", "targetTime": "18:00"},
                {"id": "tea", "label": "泡茶", "kind": "duration", "durationSeconds": 300}
            ],
            "islandId": "off-work"
        });
        assert!(validate_countdowns(&countdowns).is_ok());
        let mut bad_time = countdowns.clone();
        bad_time["items"][0]["targetTime"] = serde_json::json!("25:00");
        assert!(validate_countdowns(&bad_time).is_err());
        let mut bad_island = countdowns.clone();
        bad_island["islandId"] = serde_json::json!("missing");
        assert!(validate_countdowns(&bad_island).is_err());
        let mut duplicate = countdowns.clone();
        duplicate["items"][1]["id"] = serde_json::json!("off-work");
        assert!(validate_countdowns(&duplicate).is_err());

        let timer = serde_json::json!({
            "version": 1,
            "kind": "countdown",
            "mode": "countdown",
            "durationMs": 300000,
            "label": "泡茶",
            "countdownId": "tea",
            "state": {"status": "running", "endsAt": 123456}
        });
        assert!(validate_timer(&timer).is_ok());
        let mut bad_duration = timer.clone();
        bad_duration["durationMs"] = serde_json::json!(0);
        assert!(validate_timer(&bad_duration).is_err());
        let mut bad_state = timer.clone();
        bad_state["state"] = serde_json::json!({"status": "running"});
        assert!(validate_timer(&bad_state).is_err());
        let mut missing_id = timer.clone();
        missing_id["countdownId"] = serde_json::Value::Null;
        assert!(validate_timer(&missing_id).is_err());
    }

    #[test]
    fn upgrades_version_one_and_rejects_invalid_existing_database() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("old");
        let config = root.path().join("config");
        let broken = root.path().join("broken");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&broken).unwrap();
        let conn = Connection::open(old.join(DB_NAME)).unwrap();
        conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); CREATE TABLE mail_accounts (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL); PRAGMA user_version = 1;").unwrap();
        drop(conn);
        let storage = initialize_at(config, old).unwrap();
        assert_eq!(
            storage
                .0
                .lock()
                .unwrap()
                .connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            4
        );
        let conn = Connection::open(broken.join(DB_NAME)).unwrap();
        conn.execute_batch("CREATE TABLE settings (bad TEXT); CREATE TABLE mail_accounts (bad TEXT); PRAGMA user_version = 2;").unwrap();
        drop(conn);
        assert!(open_existing_directory(&storage, broken.to_string_lossy().into_owned()).is_err());
        assert!(broken.join(DB_NAME).exists());
    }

    #[test]
    fn upgrades_v2_without_losing_existing_settings() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); CREATE TABLE mail_accounts (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL, uid_validity INTEGER NOT NULL, last_uid INTEGER NOT NULL); INSERT INTO settings VALUES ('example', 'kept'); PRAGMA user_version = 2;").unwrap();
        let conn = initialize_connection(conn).unwrap();
        assert_eq!(
            conn.query_row("SELECT value FROM settings WHERE key='example'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
            "kept"
        );
        assert_eq!(
            conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            4
        );
        assert!(
            conn.prepare("SELECT id,provider,name,secret,pinned FROM ai_accounts")
                .is_ok()
        );
        assert!(
            conn.prepare("SELECT day,water_ml,pomodoros,focus_seconds FROM daily_stats")
                .is_ok()
        );
    }

    #[test]
    fn migrates_pomodoro_progress_into_daily_stats() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); \
             CREATE TABLE mail_accounts (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL, uid_validity INTEGER NOT NULL, last_uid INTEGER NOT NULL); \
             CREATE TABLE ai_accounts (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, name TEXT NOT NULL, secret BLOB NOT NULL, pinned INTEGER NOT NULL DEFAULT 0); \
             INSERT INTO settings VALUES ('pomodoro', '{\"version\":1,\"focusMinutes\":30,\"shortBreakMinutes\":5,\"longBreakMinutes\":15,\"longBreakEvery\":4}'); \
             INSERT INTO settings VALUES ('pomodoro_progress', '{\"version\":1,\"day\":\"2026-11-05\",\"completedToday\":2,\"cycle\":2}'); \
             PRAGMA user_version = 3;",
        )
        .unwrap();
        let conn = initialize_connection(conn).unwrap();
        let (pomodoros, focus_seconds): (i64, i64) = conn
            .query_row(
                "SELECT pomodoros, focus_seconds FROM daily_stats WHERE day='2026-11-05'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(pomodoros, 2);
        assert_eq!(focus_seconds, 2 * 30 * 60);
    }

    #[test]
    fn validates_water_settings() {
        let valid = serde_json::json!({
            "version": 1,
            "goalMl": 2000,
            "cupMl": 250,
            "reminderMinutes": 60,
            "activeStart": 9,
            "activeEnd": 21,
            "enabled": true
        });
        assert!(validate_water(&valid).is_ok());
        let mut short_interval = valid.clone();
        short_interval["reminderMinutes"] = serde_json::json!(1);
        assert!(validate_water(&short_interval).is_ok());
        let mut zero_interval = valid.clone();
        zero_interval["reminderMinutes"] = serde_json::json!(0);
        assert!(validate_water(&zero_interval).is_err());
        let mut reversed = valid.clone();
        reversed["activeStart"] = serde_json::json!(21);
        reversed["activeEnd"] = serde_json::json!(9);
        assert!(validate_water(&reversed).is_err());
        let mut small_cup = valid.clone();
        small_cup["cupMl"] = serde_json::json!(10);
        assert!(validate_water(&small_cup).is_err());
        let mut large_goal = valid;
        large_goal["goalMl"] = serde_json::json!(20000);
        assert!(validate_water(&large_goal).is_err());
    }

    #[test]
    fn resets_only_the_water_for_a_day() {
        let storage = memory_storage();
        let db = storage.0.lock().unwrap();
        db.connection
            .execute(
                "INSERT INTO daily_stats(day, water_ml, pomodoros, focus_seconds) VALUES ('2026-11-05', 1200, 3, 4500)",
                [],
            )
            .unwrap();
        let stat = reset_water_for_day(&db.connection, "2026-11-05").unwrap();
        assert_eq!(stat.water_ml, 0);
        assert_eq!(stat.pomodoros, 3);
        assert_eq!(stat.focus_seconds, 4500);
        let empty = reset_water_for_day(&db.connection, "2026-11-06").unwrap();
        assert_eq!(empty.water_ml, 0);
        assert_eq!(empty.pomodoros, 0);
    }

    #[test]
    fn validates_version_thirteen_hotkeys() {
        let base = serde_json::json!({
            "version": 13,
            "theme": "dark",
            "scale": 1.0,
            "showClock": true,
            "autoCollapseSeconds": 3,
            "expandTrigger": "click",
            "language": "zh-CN",
            "idleWidgets": ["clock"],
            "islandLyrics": false,
            "pomodoroView": "count",
            "reminderStyle": "breathe",
            "reminderAutoExpand": false,
            "expandedShape": "classic",
            "forwardNotifications": false,
        });
        let with_hotkeys = |focus: serde_json::Value| {
            let mut value = base.clone();
            value["hotkeyFocus"] = focus;
            value["hotkeyWater"] = serde_json::json!(null);
            value["hotkeyIsland"] = serde_json::json!({"combo": "F9", "double": true});
            value
        };
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "Ctrl+Alt+P", "double": false})
            ))
            .is_ok()
        );
        assert!(validate_appearance(&with_hotkeys(serde_json::json!(null))).is_ok());
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "F9", "double": false})
            ))
            .is_ok()
        );
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "Ctrl+Shift+Space", "double": false})
            ))
            .is_ok()
        );
        // Disabled actions must still carry the switch fields.
        assert!(validate_appearance(&with_hotkeys(serde_json::json!(true))).is_err());
        assert!(
            validate_appearance(&with_hotkeys(serde_json::json!({"combo": "Ctrl+Alt+P"}))).is_err()
        );
        // A bare letter would swallow normal typing.
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "P", "double": false})
            ))
            .is_err()
        );
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "Ctrl+P+Q", "double": false})
            ))
            .is_err()
        );
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "Ctrl+Alt+Ctrl", "double": false})
            ))
            .is_err()
        );
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "Ctrl+F25", "double": false})
            ))
            .is_err()
        );
        assert!(
            validate_appearance(&with_hotkeys(
                serde_json::json!({"combo": "", "double": false})
            ))
            .is_err()
        );
        // Version 13 also requires the forwarding switch.
        let mut missing_forward = base.clone();
        missing_forward["hotkeyFocus"] = serde_json::json!(null);
        missing_forward["hotkeyWater"] = serde_json::json!(null);
        missing_forward["hotkeyIsland"] = serde_json::json!(null);
        missing_forward
            .as_object_mut()
            .unwrap()
            .remove("forwardNotifications");
        assert!(validate_appearance(&missing_forward).is_err());
    }
}
