use crate::storage::Storage;
use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use std::{io::Read, time::Duration};
use tauri::{Emitter, Manager, State};
use zeroize::Zeroizing;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAccount {
    id: String,
    provider: String,
    name: String,
    pinned: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQuota {
    id: String,
    name: String,
    provider: String,
    items: Vec<QuotaItem>,
}
/// Broadcast so every window (settings and island) shows the same quota.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiQuotaUpdate {
    id: String,
    quota: AiQuota,
    updated_at: u64,
}
#[derive(Clone, Serialize)]
pub struct QuotaItem {
    label: String,
    value: String,
}
fn endpoint(provider: &str) -> Option<&'static str> {
    match provider {
        "codex-local" => Some("local-codex"),
        "kimi-local" => Some("local-kimi"),
        "deepseek" => Some("https://api.deepseek.com/user/balance"),
        "openrouter" => Some("https://openrouter.ai/api/v1/credits"),
        "minimax-cn" => Some("https://www.minimaxi.com/v1/token_plan/remains"),
        "minimax-global" => Some("https://www.minimax.io/v1/token_plan/remains"),
        _ => None,
    }
}
fn main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("当前窗口不能修改 AI 账户".into())
    }
}
#[cfg(windows)]
fn crypt(input: &[u8], id: &str, protect: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
        },
    };
    let input_blob = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: id.len() as u32,
        pbData: id.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let ok = unsafe {
        if protect {
            CryptProtectData(
                &input_blob,
                std::ptr::null(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input_blob,
                std::ptr::null_mut(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return Err("密钥加密或解密失败，请检查当前 Windows 用户".into());
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        if !protect {
            std::ptr::write_bytes(output.pbData, 0, output.cbData as usize);
        }
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}
#[cfg(not(windows))]
fn crypt(_: &[u8], _: &str, _: bool) -> Result<Vec<u8>, String> {
    Err("AI 密钥加密需要 Windows".into())
}
#[tauri::command]
pub fn list_ai_accounts(storage: State<'_, Storage>) -> Result<Vec<AiAccount>, String> {
    let db = storage.0.lock().map_err(|_| "数据暂不可用")?;
    let mut query = db
        .connection
        .prepare("SELECT id,provider,name,pinned FROM ai_accounts ORDER BY rowid")
        .map_err(|_| "读取 AI 账户失败")?;
    let rows = query
        .query_map([], |r| {
            Ok(AiAccount {
                id: r.get(0)?,
                provider: r.get(1)?,
                name: r.get(2)?,
                pinned: r.get(3)?,
            })
        })
        .map_err(|_| "读取 AI 账户失败")?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "读取 AI 账户失败".into())
}
#[tauri::command]
pub fn add_ai_account(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    provider: String,
    name: String,
    secret: String,
) -> Result<(), String> {
    main_window(&window)?;
    let secret = Zeroizing::new(secret);
    let name = name.trim();
    if endpoint(&provider).is_none()
        || name.is_empty()
        || name.chars().count() > 40
        || secret.is_empty()
        || secret.len() > 4096
        || secret.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return Err("请检查服务、名称和密钥".into());
    }
    if provider == "kimi-local"
        && !secret.split_once(':').is_some_and(|(port, token)| {
            port.parse::<u16>().is_ok_and(|p| p > 0) && !token.is_empty()
        })
    {
        return Err("请填写有效的 Kimi 本地端口和令牌".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let encrypted = crypt(secret.as_bytes(), &id, true)?;
    let db = storage.0.lock().map_err(|_| "数据暂不可用")?;
    db.connection.execute("INSERT INTO ai_accounts(id,provider,name,secret,pinned) VALUES (?1,?2,?3,?4,CASE WHEN EXISTS(SELECT 1 FROM ai_accounts WHERE pinned=1) THEN 0 ELSE 1 END)",params![id,provider,name,encrypted]).map_err(|_|"保存 AI 账户失败")?;
    Ok(())
}
#[tauri::command]
pub fn remove_ai_account(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    id: String,
) -> Result<(), String> {
    main_window(&window)?;
    let mut db = storage.0.lock().map_err(|_| "数据暂不可用")?;
    let tx = db.connection.transaction().map_err(|_| "删除账户失败")?;
    tx.execute("DELETE FROM ai_accounts WHERE id=?1", [id])
        .map_err(|_| "删除账户失败")?;
    tx.execute("UPDATE ai_accounts SET pinned=1 WHERE id=(SELECT id FROM ai_accounts ORDER BY rowid LIMIT 1) AND NOT EXISTS(SELECT 1 FROM ai_accounts WHERE pinned=1)",[]).map_err(|_|"更新常驻账户失败")?;
    tx.commit().map_err(|_| "删除账户失败")?;
    Ok(())
}
#[tauri::command]
pub fn pin_ai_account(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    id: String,
) -> Result<(), String> {
    main_window(&window)?;
    let mut db = storage.0.lock().map_err(|_| "数据暂不可用")?;
    let tx = db
        .connection
        .transaction()
        .map_err(|_| "更新常驻账户失败")?;
    let exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM ai_accounts WHERE id=?1)",
            [&id],
            |r| r.get(0),
        )
        .map_err(|_| "更新常驻账户失败")?;
    if !exists {
        return Err("账户不存在".into());
    }
    tx.execute("UPDATE ai_accounts SET pinned=(id=?1)", [id])
        .map_err(|_| "更新常驻账户失败")?;
    tx.commit().map_err(|_| "更新常驻账户失败")?;
    Ok(())
}
fn parse_quota(provider: &str, data: &serde_json::Value) -> Result<Vec<QuotaItem>, String> {
    let bad = || "服务未返回可识别的额度数据".to_string();
    match provider {
        "kimi-local" => {
            if data["code"].as_i64() != Some(0)
                || data.pointer("/data/kind").and_then(|v| v.as_str()) != Some("ok")
            {
                return Err("Kimi Code 未登录或额度查询失败".into());
            }
            let mut result = Vec::new();
            for (key, label) in [
                ("limit5h", "5 小时剩余"),
                ("limit7d", "7 天剩余"),
                ("monthTotal", "本月剩余"),
                ("monthCode", "本月编码剩余"),
            ] {
                if let Some(used) = data
                    .pointer(&format!("/data/quota/usages/{key}/usedRatio"))
                    .and_then(|v| v.as_f64())
                    .filter(|v| v.is_finite() && (0.0..=1.0).contains(v))
                {
                    result.push(QuotaItem {
                        label: label.into(),
                        value: format!("{:.0}%", (1.0 - used) * 100.0),
                    });
                }
            }
            if result.is_empty() {
                Err(bad())
            } else {
                Ok(result)
            }
        }
        "codex-local" => {
            let rate = data
                .pointer("/result/rateLimits")
                .filter(|v| v.is_object())
                .ok_or_else(bad)?;
            let mut result = Vec::new();
            for key in ["primary", "secondary"] {
                let window = &rate[key];
                let Some(used) = window["usedPercent"]
                    .as_f64()
                    .filter(|v| v.is_finite() && (0.0..=100.0).contains(v))
                else {
                    continue;
                };
                let label = match window["windowDurationMins"].as_u64() {
                    Some(300) => "5 小时剩余".to_string(),
                    Some(10080) => "7 天剩余".to_string(),
                    Some(n) if n > 0 && n % 1440 == 0 => format!("{} 天剩余", n / 1440),
                    Some(n) if n > 0 && n % 60 == 0 => format!("{} 小时剩余", n / 60),
                    Some(n) if n > 0 => format!("{n} 分钟剩余"),
                    _ => "周期剩余".to_string(),
                };
                result.push(QuotaItem {
                    label,
                    value: format!("{:.0}%", 100.0 - used),
                });
            }
            if result.is_empty() {
                Err(bad())
            } else {
                Ok(result)
            }
        }
        "deepseek" => {
            let rows = data["balance_infos"].as_array().ok_or_else(bad)?;
            let mut result = Vec::new();
            for row in rows {
                let cur = row["currency"]
                    .as_str()
                    .filter(|s| *s == "CNY" || *s == "USD");
                let value = row["total_balance"]
                    .as_str()
                    .and_then(|v| v.parse::<f64>().ok())
                    .filter(|v| v.is_finite() && *v >= 0.0);
                if let (Some(cur), Some(value)) = (cur, value) {
                    result.push(QuotaItem {
                        label: format!("{cur} 可用余额"),
                        value: format!("{value:.2}"),
                    });
                }
            }
            if result.is_empty() {
                Err(bad())
            } else {
                Ok(result)
            }
        }
        "openrouter" => {
            let total = data["data"]["total_credits"]
                .as_f64()
                .filter(|v| v.is_finite() && *v >= 0.0)
                .ok_or_else(bad)?;
            let used = data["data"]["total_usage"]
                .as_f64()
                .filter(|v| v.is_finite() && *v >= 0.0)
                .ok_or_else(bad)?;
            Ok(vec![QuotaItem {
                label: "USD 剩余积分".into(),
                value: format!("{:.2}", total - used),
            }])
        }
        "minimax-cn" | "minimax-global" => {
            if data["base_resp"]["status_code"].as_i64() != Some(0) {
                return Err("MiniMax 密钥无效或套餐查询失败".into());
            }
            let rows = data["model_remains"].as_array().ok_or_else(bad)?;
            let row = rows
                .iter()
                .find(|row| row["model_name"].as_str() == Some("general"))
                .ok_or_else(bad)?;
            // Some plans report 100% for an unprovisioned 0/0 bucket; do not
            // present that as confirmed available quota.
            if row["current_interval_status"].as_i64() == Some(3)
                && row["current_weekly_status"].as_i64() == Some(3)
                && row["current_interval_total_count"].as_f64() == Some(0.0)
                && row["current_weekly_total_count"].as_f64() == Some(0.0)
            {
                return Err("MiniMax 未确认可用额度".into());
            }
            let mut result = Vec::new();
            for (key, label) in [
                ("current_interval_remaining_percent", "5 小时剩余"),
                ("current_weekly_remaining_percent", "本周剩余"),
            ] {
                if let Some(value) = row[key]
                    .as_f64()
                    .filter(|v| v.is_finite() && (0.0..=100.0).contains(v))
                {
                    result.push(QuotaItem {
                        label: label.into(),
                        value: format!("{value:.0}%"),
                    });
                }
            }
            if result.is_empty() {
                Err(bad())
            } else {
                Ok(result)
            }
        }
        _ => Err("不支持的 AI 服务".into()),
    }
}

#[cfg(windows)]
fn codex_installations(local_app_data: &std::path::Path) -> Vec<std::path::PathBuf> {
    let bin = local_app_data.join("OpenAI").join("Codex").join("bin");
    let mut candidates: Vec<_> = std::fs::read_dir(bin)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| {
            (
                entry.metadata().and_then(|m| m.modified()).ok(),
                entry.path().join("codex.exe"),
            )
        })
        .filter(|(_, path)| path.is_file())
        .collect();
    candidates.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    let mut paths: Vec<_> = candidates.into_iter().map(|(_, path)| path).collect();
    let alias = local_app_data
        .join("Microsoft")
        .join("WindowsApps")
        .join("codex.exe");
    if alias.is_file() {
        paths.push(alias);
    }
    paths
}

fn read_local_codex() -> Result<Vec<QuotaItem>, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Command, Stdio};
    let mut executables = vec![std::path::PathBuf::from("codex")];
    #[cfg(windows)]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        executables.extend(codex_installations(std::path::Path::new(&local)));
    }
    let mut child = executables
        .into_iter()
        .find_map(|executable| {
            let mut command = Command::new(executable);
            command
                .args(["app-server", "--listen", "stdio://"])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            command.spawn().ok()
        })
        .ok_or("无法启动 Codex CLI，请检查安装及登录状态")?;
    let result = (|| {
        let mut input = child.stdin.take().ok_or("无法启动 Codex 额度查询")?;
        let output = child.stdout.take().ok_or("无法启动 Codex 额度查询")?;
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        std::thread::spawn(move || {
            for line in BufReader::new(output.take(1_048_576)).lines() {
                let Ok(line) = line else { break };
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line)
                    && value["id"].as_i64() == Some(3)
                {
                    let _ = sender.send(value);
                    return;
                }
            }
        });
        input.write_all(b"{\"id\":1,\"method\":\"initialize\",\"params\":{\"clientInfo\":{\"name\":\"dynamic_island\",\"title\":\"Dynamic Island\",\"version\":\"0.1.0\"}}}\n{\"method\":\"initialized\"}\n{\"id\":3,\"method\":\"account/rateLimits/read\"}\n").map_err(|_|"无法连接 Codex CLI")?;
        input.flush().map_err(|_| "无法连接 Codex CLI")?;
        let value = receiver
            .recv_timeout(Duration::from_secs(12))
            .map_err(|_| "Codex 额度查询超时或不可用")?;
        if value.get("error").is_some() {
            return Err("Codex 未登录或无法查询额度".to_string());
        }
        parse_quota("codex-local", &value)
    })();
    let _ = child.kill();
    let _ = child.wait();
    result
}
fn query_account(storage: &Storage, id: &str) -> Result<AiQuota, String> {
    let (account, encrypted) = {
        let db = storage.0.lock().map_err(|_| "数据暂不可用")?;
        db.connection
            .query_row(
                "SELECT id,provider,name,pinned,secret FROM ai_accounts WHERE id=?1",
                [id],
                |r| {
                    Ok((
                        AiAccount {
                            id: r.get(0)?,
                            provider: r.get(1)?,
                            name: r.get(2)?,
                            pinned: r.get(3)?,
                        },
                        r.get::<_, Vec<u8>>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(|_| "读取 AI 账户失败")?
            .ok_or("账户不存在")?
    };
    if account.provider == "codex-local" {
        let items = read_local_codex()?;
        return Ok(AiQuota {
            id: account.id,
            name: account.name,
            provider: account.provider,
            items,
        });
    }
    let url = endpoint(&account.provider).ok_or("不支持的 AI 服务")?;
    let bytes = Zeroizing::new(crypt(&encrypted, &account.id, false)?);
    let saved = std::str::from_utf8(&bytes).map_err(|_| "密钥无效")?;
    let (url, token) = if account.provider == "kimi-local" {
        let (port, token) = saved.split_once(':').ok_or("Kimi 连接配置无效")?;
        let port = port
            .parse::<u16>()
            .ok()
            .filter(|p| *p > 0)
            .ok_or("Kimi 端口无效")?;
        if token.is_empty() {
            return Err("Kimi 令牌无效".into());
        }
        (format!("http://127.0.0.1:{port}/api/v1/oauth/usage"), token)
    } else {
        (url.to_string(), saved)
    };
    use std::net::ToSocketAddrs;
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .redirects(0)
        .resolver(|host: &str| {
            let mut addrs: Vec<_> = host.to_socket_addrs()?.collect();
            addrs.sort_by_key(|a| a.is_ipv6());
            Ok(addrs)
        })
        .tls_connector(std::sync::Arc::new(
            native_tls::TlsConnector::new().map_err(|_| "网络初始化失败")?,
        ))
        .build();
    let auth = Zeroizing::new(format!("Bearer {token}"));
    let response = agent
        .get(&url)
        .set("Authorization", &auth)
        .set("Accept", "application/json")
        .call()
        .map_err(|err| match err {
            ureq::Error::Status(401, _) | ureq::Error::Status(403, _) => "密钥无效或权限不足",
            ureq::Error::Status(429, _) => "查询过于频繁，请稍后重试",
            _ => "连接额度服务失败",
        })?;
    let mut raw = Vec::new();
    response
        .into_reader()
        .take(262145)
        .read_to_end(&mut raw)
        .map_err(|_| "读取额度失败")?;
    if raw.len() > 262144 {
        return Err("额度响应过大".into());
    }
    let data: serde_json::Value = serde_json::from_slice(&raw).map_err(|_| "额度响应格式错误")?;
    let items = parse_quota(&account.provider, &data)?;
    Ok(AiQuota {
        id: account.id,
        name: account.name,
        provider: account.provider,
        items,
    })
}
#[tauri::command]
pub async fn query_ai_quota(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    id: String,
) -> Result<AiQuota, String> {
    if window.label() != "main" && window.label() != "island" {
        return Err("当前窗口不能查询 AI 额度".into());
    }
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        query_account(app.state::<Storage>().inner(), &id)
    })
    .await
    .map_err(|_| "额度查询失败".to_string())?;
    if let Ok(quota) = &result {
        let updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis() as u64)
            .unwrap_or(0);
        let _ = handle.emit(
            "ai-quota-updated",
            AiQuotaUpdate {
                id: quota.id.clone(),
                quota: quota.clone(),
                updated_at,
            },
        );
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[cfg(windows)]
    #[test]
    fn finds_codex_desktop_install_without_path() {
        let root = tempfile::tempdir().unwrap();
        let bin = root.path().join("OpenAI/Codex/bin");
        std::fs::create_dir_all(bin.join("version-a")).unwrap();
        std::fs::write(bin.join("version-a/codex.exe"), b"test").unwrap();
        std::fs::create_dir_all(bin.join("unrelated")).unwrap();
        let found = codex_installations(root.path());
        assert_eq!(found, vec![bin.join("version-a/codex.exe")]);
    }
    #[test]
    fn codex_windows_are_reported_as_remaining() {
        let items = parse_quota("codex-local", &json!({"result":{"rateLimits":{"primary":{"usedPercent":25,"windowDurationMins":300},"secondary":{"usedPercent":100,"windowDurationMins":10080}}}})).unwrap();
        assert_eq!(items[0].value, "75%");
        assert_eq!(items[1].value, "0%");
        assert!(parse_quota("codex-local", &json!({"result":{"rateLimits":null}})).is_err());
    }
    #[test]
    fn kimi_local_handles_usage_and_reports_errors() {
        let items = parse_quota("kimi-local", &json!({"code":0,"data":{"kind":"ok","quota":{"usages":{"limit5h":{"usedRatio":0.25},"limit7d":{"usedRatio":1.0}}}}})).unwrap();
        assert_eq!(items[0].value, "75%");
        assert_eq!(items[1].value, "0%");
        assert!(parse_quota("kimi-local", &json!({"data":{"kind":"error"}})).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn kimi_query_reads_encrypted_credentials_and_calls_only_loopback() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut buffer = [0; 4096];
            let n = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..n]);
            assert!(request.starts_with("GET /api/v1/oauth/usage "));
            assert!(
                request
                    .to_lowercase()
                    .contains("authorization: bearer test-secret")
            );
            let body = r#"{"code":0,"data":{"kind":"ok","quota":{"usages":{"limit5h":{"usedRatio":0.25}}}}}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });
        let storage = crate::storage::memory_storage();
        let encrypted = crypt(format!("{port}:test-secret").as_bytes(), "test", true).unwrap();
        assert!(!encrypted.windows(11).any(|w| w == b"test-secret"));
        storage
            .0
            .lock()
            .unwrap()
            .connection
            .execute(
                "INSERT INTO ai_accounts VALUES ('test','kimi-local','test',?1,1)",
                [&encrypted],
            )
            .unwrap();
        let quota = query_account(&storage, "test").unwrap();
        assert_eq!(quota.items[0].value, "75%");
        server.join().unwrap();
    }
    #[test]
    #[ignore = "requires local Codex CLI with a compatible signed-in account"]
    fn live_codex_quota() {
        assert!(!read_local_codex().expect("Codex quota").is_empty());
    }
    #[test]
    fn parses_authoritative_balances_and_rejects_unknown() {
        assert_eq!(
            parse_quota(
                "deepseek",
                &json!({"balance_infos":[{"currency":"CNY","total_balance":"10.20"}]})
            )
            .unwrap()[0]
                .value,
            "10.20"
        );
        assert_eq!(
            parse_quota(
                "openrouter",
                &json!({"data":{"total_credits":10.0,"total_usage":3.5}})
            )
            .unwrap()[0]
                .value,
            "6.50"
        );
        assert!(parse_quota("deepseek", &json!({})).is_err());
        assert!(parse_quota("openrouter", &json!({"data":{"total_credits":10}})).is_err());
    }
    #[test]
    fn minimax_uses_remaining_percent_and_rejects_missing() {
        let items=parse_quota("minimax-cn",&json!({"base_resp":{"status_code":0},"model_remains":[{"model_name":"general","current_interval_remaining_percent":0,"current_weekly_remaining_percent":75}]})).unwrap();
        assert_eq!(items[0].value, "0%");
        assert_eq!(items[1].value, "75%");
        assert!(parse_quota("minimax-cn", &json!({"base_resp":{"status_code":1}})).is_err());
        assert!(parse_quota("minimax-cn", &json!({"base_resp":{"status_code":0},"model_remains":[{"model_name":"general","current_interval_status":3,"current_weekly_status":3,"current_interval_total_count":0,"current_weekly_total_count":0,"current_interval_remaining_percent":100,"current_weekly_remaining_percent":100}]})).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn ciphertext_is_bound_to_id() {
        let cipher = crypt(b"test-key", "one", true).unwrap();
        assert!(!cipher.windows(8).any(|w| w == b"test-key"));
        assert_eq!(crypt(&cipher, "one", false).unwrap(), b"test-key");
        assert!(crypt(&cipher, "other", false).is_err());
    }
}
