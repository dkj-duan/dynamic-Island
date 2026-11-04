use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{Manager, State};

const DB_NAME: &str = "dynamic-island.sqlite3";
const SCHEMA_VERSION: i64 = 3;

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

#[tauri::command]
pub fn save_appearance(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    value: serde_json::Value,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("当前窗口不能修改设置".into());
    }
    validate_appearance(&value)?;
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    db.connection.execute("INSERT INTO settings(key,value) VALUES ('appearance',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![value.to_string()]).map_err(|e| e.to_string())?;
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
    if value.get("version").and_then(|v| v.as_u64()) != Some(4)
        || !matches!(
            value.get("theme").and_then(|v| v.as_str()),
            Some("system" | "light" | "dark")
        )
        || !matches!(
            value.get("expandTrigger").and_then(|v| v.as_str()),
            Some("click" | "hover")
        )
        || scale.is_none()
        || delay.is_none()
        || value.get("showClock").and_then(|v| v.as_bool()).is_none()
    {
        return Err("设置格式无效，未保存".into());
    }
    Ok(())
}

const POSITION_KEY: &str = "island_position";

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
        assert!(validate_appearance(&serde_json::json!({"version": 4, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "hover"})).is_ok());
        assert!(validate_appearance(&serde_json::json!({"version": 4, "theme": "invalid", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "click"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 4, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3, "expandTrigger": "double"})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 4, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3})).is_err());
        assert!(validate_appearance(&serde_json::json!({"version": 3, "theme": "system", "scale": 1.0, "showClock": true, "autoCollapseSeconds": 3})).is_err());
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
            3
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
            3
        );
        assert!(
            conn.prepare("SELECT id,provider,name,secret,pinned FROM ai_accounts")
                .is_ok()
        );
    }
}
