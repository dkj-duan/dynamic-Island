use crate::storage::Storage;
use mailparse::MailHeaderMap;
use regex::Regex;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::{self, Cursor, Read, Write},
    net::{TcpStream, ToSocketAddrs},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tauri::{Manager, State};

/// Upper bound for one poll's server response. Reset before every check so a
/// reused connection cannot exhaust the budget over a long session.
const RESPONSE_BUDGET: usize = 8 * 1024 * 1024;

struct BoundedStream {
    inner: native_tls::TlsStream<TcpStream>,
    remaining: Arc<AtomicUsize>,
    greeting: Cursor<Vec<u8>>,
}
impl Read for BoundedStream {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }
        if (self.greeting.position() as usize) < self.greeting.get_ref().len() {
            return self.greeting.read(buffer);
        }
        let remaining = self.remaining.load(Ordering::Relaxed);
        if remaining == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "mail response limit exceeded",
            ));
        }
        let length = buffer.len().min(remaining);
        let read = self.inner.read(&mut buffer[..length])?;
        self.remaining.fetch_sub(read, Ordering::Relaxed);
        Ok(read)
    }
}
impl Write for BoundedStream {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.inner.write(buffer)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAccount {
    id: String,
    email: String,
    host: String,
    port: u16,
}
#[derive(Deserialize)]
pub struct MailInput {
    email: String,
    host: String,
    port: u16,
    secret: String,
}
#[derive(Serialize, Deserialize)]
struct StoredCredential {
    email: String,
    host: String,
    port: u16,
    secret: String,
}
#[derive(Serialize)]
struct CredentialRef<'a> {
    email: &'a str,
    host: &'a str,
    port: u16,
    secret: &'a str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailNotice {
    account_id: String,
    account: String,
    subject: String,
    code: Option<String>,
}
#[derive(Default)]
pub struct MailMonitor {
    running: Mutex<HashSet<String>>,
    status: Mutex<HashMap<String, String>>,
    /// Keeping the TLS session alive avoids a login round-trip every check.
    sessions: Mutex<HashMap<String, CachedSession>>,
}
struct CachedSession {
    session: imap::Session<BoundedStream>,
    budget: Arc<AtomicUsize>,
}
struct Flight<'a> {
    monitor: &'a MailMonitor,
    id: String,
}
impl Drop for Flight<'_> {
    fn drop(&mut self) {
        if let Ok(mut set) = self.monitor.running.lock() {
            set.remove(&self.id);
        }
    }
}

#[cfg(target_os = "windows")]
fn credential(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.dynamicisland.mail", id)
        .map_err(|_| "无法访问 Windows 凭据管理器".into())
}

fn connect(
    email: &str,
    host: &str,
    port: u16,
    secret: &str,
) -> Result<(imap::Session<BoundedStream>, Arc<AtomicUsize>), String> {
    let fail = || "无法连接或登录邮箱，请检查 IMAP 服务器、端口和授权码".to_string();
    let addresses = (host, port).to_socket_addrs().map_err(|_| fail())?;
    let stream = addresses
        .take(3)
        .find_map(|addr| TcpStream::connect_timeout(&addr, Duration::from_secs(6)).ok())
        .ok_or_else(fail)?;
    stream
        .set_read_timeout(Some(Duration::from_secs(12)))
        .map_err(|_| fail())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(12)))
        .map_err(|_| fail())?;
    let tls = native_tls::TlsConnector::new()
        .map_err(|_| fail())?
        .connect(host, stream)
        .map_err(|_| fail())?;
    let budget = Arc::new(AtomicUsize::new(RESPONSE_BUDGET));
    let mut transport = BoundedStream {
        inner: tls,
        remaining: budget.clone(),
        greeting: Cursor::new(Vec::new()),
    };
    if matches!(host, "imap.163.com" | "imap.126.com" | "imap.yeah.net") {
        transport.greeting =
            Cursor::new(netease_greeting_and_id(&mut transport).map_err(|_| fail())?);
    }
    let mut client = imap::Client::new(transport);
    client.read_greeting().map_err(|_| fail())?;
    let session = client.login(email, secret).map_err(|_| fail())?;
    Ok((session, budget))
}

// IMAP ID is valid before authentication. The stable IMAP parser cannot
// decode NetEase's untagged ID response, so consume this extension separately.
fn netease_greeting_and_id<T: Read + Write>(stream: &mut T) -> io::Result<Vec<u8>> {
    fn line<T: Read>(stream: &mut T) -> io::Result<Vec<u8>> {
        let mut result = Vec::new();
        while result.len() < 8192 {
            let mut byte = [0u8; 1];
            stream.read_exact(&mut byte)?;
            result.push(byte[0]);
            if byte[0] == b'\n' {
                return Ok(result);
            }
        }
        Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "IMAP line too long",
        ))
    }
    let greeting = line(stream)?;
    if !greeting.starts_with(b"* OK") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid IMAP greeting",
        ));
    }
    stream.write_all(b"z0 ID (\"name\" \"Dynamic Island\" \"version\" \"0.1\")\r\n")?;
    stream.flush()?;
    for _ in 0..32 {
        let response = line(stream)?;
        if response.starts_with(b"z0 OK") {
            return Ok(greeting);
        }
        if response.starts_with(b"z0 ") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "IMAP ID rejected",
            ));
        }
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "IMAP ID response missing",
    ))
}

fn validate(input: &MailInput) -> Result<(), String> {
    if input.email.len() > 254
        || !input.email.contains('@')
        || input
            .email
            .chars()
            .any(|c| c.is_whitespace() || c.is_control())
    {
        return Err("请输入有效邮箱地址".into());
    }
    if input.host.is_empty()
        || input.host.len() > 253
        || !input
            .host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        || input.port == 0
    {
        return Err("请输入有效的 IMAP 服务器和端口".into());
    }
    if input.secret.is_empty()
        || input.secret.len() > 1024
        || input.secret.chars().any(char::is_control)
    {
        return Err("请输入邮箱授权码".into());
    }
    Ok(())
}

fn require_window(window: &tauri::WebviewWindow, label: &str) -> Result<(), String> {
    if window.label() == label {
        Ok(())
    } else {
        Err("当前窗口不能执行此操作".into())
    }
}

#[tauri::command]
pub fn list_mail_accounts(storage: State<'_, Storage>) -> Result<Vec<MailAccount>, String> {
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .connection
        .prepare("SELECT id,email,host,port FROM mail_accounts ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MailAccount {
                id: row.get(0)?,
                email: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mail_monitor_status(
    window: tauri::WebviewWindow,
    monitor: State<'_, MailMonitor>,
) -> Result<HashMap<String, String>, String> {
    require_window(&window, "main")?;
    Ok(monitor.status.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn add_mail_account(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    input: MailInput,
) -> Result<MailAccount, String> {
    require_window(&window, "main")?;
    validate(&input)?;
    tauri::async_runtime::spawn_blocking(move || add_account(&app, input))
        .await
        .map_err(|_| "邮箱连接任务失败".to_string())?
}

fn add_account(app: &tauri::AppHandle, input: MailInput) -> Result<MailAccount, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, input);
        return Err("邮箱凭据目前仅支持 Windows".into());
    }
    #[cfg(target_os = "windows")]
    {
        let secret = zeroize::Zeroizing::new(input.secret);
        let email = input.email.trim().to_string();
        let host = input.host.trim().to_ascii_lowercase();
        let (mut session, _budget) = connect(&email, &host, input.port, &secret)?;
        let mailbox = session
            .examine("INBOX")
            .map_err(|_| "无法读取收件箱".to_string())?;
        let validity = mailbox
            .uid_validity
            .ok_or("邮箱未提供 UIDVALIDITY，无法安全跟踪新邮件")?;
        let last_uid = match mailbox.uid_next {
            Some(next) => next.saturating_sub(1),
            None => session
                .uid_search("ALL")
                .map_err(|_| "无法读取邮件标识".to_string())?
                .into_iter()
                .max()
                .unwrap_or(0),
        };
        let _ = session.logout();
        let account = MailAccount {
            id: uuid::Uuid::new_v4().to_string(),
            email,
            host,
            port: input.port,
        };
        let entry = credential(&account.id)?;
        let encoded = zeroize::Zeroizing::new(
            serde_json::to_string(&CredentialRef {
                email: &account.email,
                host: &account.host,
                port: account.port,
                secret: &secret,
            })
            .map_err(|_| "无法保存邮箱授权码")?,
        );
        entry
            .set_password(&encoded)
            .map_err(|_| "无法保存邮箱授权码".to_string())?;
        let storage = app.state::<Storage>();
        let insert = (|| {
            let db = storage.0.lock().map_err(|e| e.to_string())?;
            db.connection.execute("INSERT INTO mail_accounts(id,email,host,port,uid_validity,last_uid) VALUES (?1,?2,?3,?4,?5,?6)", params![account.id, account.email, account.host, account.port, validity, last_uid]).map_err(|_| "无法保存邮箱账户，可能已添加相同账户".to_string())?;
            Ok(())
        })();
        if let Err(error) = insert {
            let _ = entry.delete_credential();
            return Err(error);
        }
        Ok(account)
    }
}

#[tauri::command]
pub fn remove_mail_account(
    window: tauri::WebviewWindow,
    storage: State<'_, Storage>,
    monitor: State<'_, MailMonitor>,
    id: String,
) -> Result<(), String> {
    require_window(&window, "main")?;
    let db = storage.0.lock().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let entry = credential(&id)?;
        if let Err(error) = entry.delete_credential()
            && !matches!(error, keyring::Error::NoEntry)
        {
            return Err("无法删除邮箱授权码".into());
        }
    }
    db.connection
        .execute("DELETE FROM mail_accounts WHERE id=?1", [&id])
        .map_err(|e| e.to_string())?;
    if let Ok(mut states) = monitor.status.lock() {
        states.remove(&id);
    }
    if let Ok(mut sessions) = monitor.sessions.lock() {
        sessions.remove(&id);
    }
    Ok(())
}

#[tauri::command]
pub async fn poll_mail(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
) -> Result<Vec<MailNotice>, String> {
    require_window(&window, "island")?;
    tauri::async_runtime::spawn_blocking(move || poll_account(&app, &id))
        .await
        .map_err(|_| "邮件检查任务失败".to_string())?
}

fn poll_account(app: &tauri::AppHandle, id: &str) -> Result<Vec<MailNotice>, String> {
    let result = poll_account_inner(app, id);
    let monitor = app.state::<MailMonitor>();
    if let Ok(mut states) = monitor.status.lock() {
        states.insert(
            id.to_string(),
            if result.is_ok() {
                "检查正常".into()
            } else {
                "检查失败，请检查网络和授权码".into()
            },
        );
    }
    result
}

fn poll_account_inner(app: &tauri::AppHandle, id: &str) -> Result<Vec<MailNotice>, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, id);
        return Err("邮箱凭据目前仅支持 Windows".into());
    }
    #[cfg(target_os = "windows")]
    {
        let monitor = app.state::<MailMonitor>();
        {
            let mut running = monitor.running.lock().map_err(|e| e.to_string())?;
            if !running.insert(id.to_string()) {
                return Ok(vec![]);
            }
        }
        let _flight = Flight {
            monitor: &monitor,
            id: id.to_string(),
        };
        let storage = app.state::<Storage>();
        let (account, old_validity, last_uid): (MailAccount, u32, u32) = {
            let db = storage.0.lock().map_err(|e| e.to_string())?;
            db.connection.query_row("SELECT id,email,host,port,uid_validity,last_uid FROM mail_accounts WHERE id=?1", [id], |row| Ok((MailAccount { id: row.get(0)?, email: row.get(1)?, host: row.get(2)?, port: row.get(3)? }, row.get(4)?, row.get(5)?))).optional().map_err(|e| e.to_string())?.ok_or("邮箱账户不存在")?
        };
        let encoded = zeroize::Zeroizing::new(
            credential(id)?
                .get_password()
                .map_err(|_| "无法读取授权码，请重新添加邮箱".to_string())?,
        );
        let credential: StoredCredential =
            serde_json::from_str(&encoded).map_err(|_| "授权码格式无效，请重新添加邮箱")?;
        let password = zeroize::Zeroizing::new(credential.secret);
        if credential.email != account.email
            || credential.host != account.host
            || credential.port != account.port
        {
            return Err("邮箱配置与授权码不匹配，请重新添加邮箱".into());
        }
        for attempt in 0..2 {
            // Reuse the cached TLS session; a dead connection gets one retry.
            let cached = if attempt == 0 {
                monitor
                    .sessions
                    .lock()
                    .ok()
                    .and_then(|mut sessions| sessions.remove(id))
            } else {
                None
            };
            let reused = cached.is_some();
            let (mut session, budget) = match cached {
                Some(entry) => {
                    entry.budget.store(RESPONSE_BUDGET, Ordering::Relaxed);
                    (entry.session, entry.budget)
                }
                None => connect(&account.email, &account.host, account.port, &password)?,
            };
            let scanned = (|| -> Result<(u32, u32, Vec<MailNotice>), String> {
                let mailbox = session
                    .examine("INBOX")
                    .map_err(|_| "无法读取收件箱".to_string())?;
                let validity = mailbox.uid_validity.ok_or("邮箱未提供 UIDVALIDITY")?;
                if validity != old_validity {
                    let newest = match mailbox.uid_next {
                        Some(next) => next.saturating_sub(1),
                        None => session
                            .uid_search("ALL")
                            .map_err(|_| "无法读取邮件标识")?
                            .into_iter()
                            .max()
                            .unwrap_or(0),
                    };
                    Ok((validity, newest, Vec::new()))
                } else {
                    let (newest, notices) = scan_new_messages(&mut session, &account, last_uid)?;
                    Ok((validity, newest, notices))
                }
            })();
            match scanned {
                Ok((validity, newest, notices)) => {
                    if let Ok(mut sessions) = monitor.sessions.lock() {
                        sessions.insert(id.to_string(), CachedSession { session, budget });
                    }
                    let db = storage.0.lock().map_err(|e| e.to_string())?;
                    let updated = db.connection.execute("UPDATE mail_accounts SET uid_validity=?1,last_uid=?2 WHERE id=?3 AND uid_validity=?4 AND last_uid=?5", params![validity, newest, id, old_validity, last_uid]).map_err(|e| e.to_string())?;
                    if updated == 0 {
                        return Ok(vec![]);
                    }
                    return Ok(notices);
                }
                Err(error) => {
                    drop(session);
                    if !reused {
                        return Err(error);
                    }
                }
            }
        }
        Err("邮箱连接已断开，请稍后重试".into())
    }
}

fn scan_new_messages<T: Read + Write>(
    session: &mut imap::Session<T>,
    account: &MailAccount,
    last_uid: u32,
) -> Result<(u32, Vec<MailNotice>), String> {
    let mut ids: Vec<u32> = session
        .uid_search(format!("UID {}:*", last_uid.saturating_add(1)))
        .map_err(|_| "邮件检查失败")?
        .into_iter()
        .filter(|uid| *uid > last_uid)
        .collect();
    ids.sort_unstable();
    let last = ids.iter().take(20).next_back().copied().unwrap_or(last_uid);
    let mut notices = Vec::new();
    for uid in ids.iter().take(20) {
        let result = session
            .uid_fetch(uid.to_string(), "(UID BODY.PEEK[]<0.131072>)")
            .map_err(|_| "邮件读取失败")?;
        for item in result.iter() {
            if let Some(body) = item.body() {
                let parsed = mailparse::parse_mail(body);
                let subject = parsed
                    .as_ref()
                    .ok()
                    .and_then(|mail| mail.headers.get_first_value("Subject"))
                    .or_else(|| {
                        mailparse::parse_headers(body)
                            .ok()
                            .and_then(|(headers, _)| headers.get_first_value("Subject"))
                    })
                    .unwrap_or_else(|| "新邮件".into());
                let mut text = subject.clone();
                if let Ok(mail) = parsed {
                    append_text(&mail, &mut text, 0);
                }
                notices.push(MailNotice {
                    account_id: account.id.clone(),
                    account: account.email.clone(),
                    subject: subject.chars().take(100).collect(),
                    code: extract_code(&text),
                });
            }
        }
    }
    Ok((last, notices))
}

fn append_text(mail: &mailparse::ParsedMail<'_>, output: &mut String, depth: u8) {
    if output.len() >= 120_000 || depth > 12 {
        return;
    }
    if mail.subparts.is_empty()
        && (mail.ctype.mimetype == "text/plain" || mail.ctype.mimetype == "text/html")
    {
        if let Ok(body) = mail.get_body() {
            output.push(' ');
            output.extend(body.chars().take(60_000));
        }
    } else {
        for part in &mail.subparts {
            append_text(part, output, depth + 1);
        }
    }
}

/// Keywords that introduce a one-time code, in the lowercased form used for
/// matching. ASCII keywords rely on `to_ascii_lowercase`, which keeps byte
/// offsets identical to the original text.
const CODE_KEYWORDS: [&str; 11] = [
    "验证码",
    "校验码",
    "动态码",
    "安全码",
    "确认码",
    "verification code",
    "security code",
    "one-time code",
    "one-time password",
    "passcode",
    "otp",
];

struct DigitRun {
    start: usize,
    end: usize,
}

/// Strip markup and collapse whitespace while keeping line breaks: providers
/// often put the code on its own line, and the word "验证码" on another.
fn clean_mail_text(text: &str) -> String {
    use std::sync::OnceLock;
    static TAG: OnceLock<Regex> = OnceLock::new();
    let tag = TAG.get_or_init(|| Regex::new(r"(?s)<[^>]{1,300}>").unwrap());
    let stripped = tag.replace_all(text, "\n");
    let mut result = String::with_capacity(stripped.len());
    for line in stripped.lines() {
        let line = line
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'");
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !result.is_empty() {
            result.push('\n');
        }
        let mut spaced = false;
        for ch in trimmed.chars() {
            if ch.is_whitespace() {
                if !spaced {
                    result.push(' ');
                    spaced = true;
                }
            } else {
                result.push(ch);
                spaced = false;
            }
        }
    }
    result
}

/// Maximal runs of ASCII digits. Runs longer than a code are skipped as a
/// whole, so an order number cannot contribute a 4–8 digit slice.
fn digit_runs(text: &str) -> Vec<DigitRun> {
    let bytes = text.as_bytes();
    let mut runs = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if !bytes[index].is_ascii_digit() {
            index += 1;
            continue;
        }
        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if (4..=8).contains(&(index - start)) {
            runs.push(DigitRun { start, end: index });
        }
    }
    runs
}

fn keyword_spans(text: &str) -> Vec<(usize, usize)> {
    let lower = text.to_ascii_lowercase();
    let mut spans = Vec::new();
    for keyword in CODE_KEYWORDS {
        for (index, _) in lower.match_indices(keyword) {
            spans.push((index, index + keyword.len()));
        }
    }
    spans.sort_unstable();
    spans
}

/// Reject durations ("15 分钟"), dates and order or amount numbers that sit
/// inside the same window as the keyword.
fn plausible_code(text: &str, run: &DigitRun) -> bool {
    let suffix: String = text[run.end..].chars().take(6).collect();
    let suffix = suffix.trim_start();
    if [
        "分钟", "小时", "分", "秒", "天", "年", "月", "日", "元", "%",
    ]
    .iter()
    .any(|unit| suffix.starts_with(unit))
    {
        return false;
    }
    let prefix: Vec<char> = text[..run.start].chars().rev().take(6).collect();
    let prefix: String = prefix.into_iter().rev().collect();
    let prefix = prefix.trim_end();
    if [
        "订单", "单号", "编号", "金额", "价格", "运费", "电话", "手机", "尾号",
    ]
    .iter()
    .any(|word| prefix.ends_with(word))
    {
        return false;
    }
    if run.end - run.start == 4 {
        let value: u32 = text[run.start..run.end].parse().unwrap_or(0);
        let date_like = ['-', '/', '.', '年', '月', '日']
            .iter()
            .any(|mark| suffix.starts_with(*mark) || prefix.ends_with(*mark));
        if (1900..=2100).contains(&value) && date_like {
            return false;
        }
    }
    true
}

fn extract_code(text: &str) -> Option<String> {
    let cleaned = clean_mail_text(text);
    let spans = keyword_spans(&cleaned);
    if spans.is_empty() {
        return None;
    }
    let runs = digit_runs(&cleaned);
    let mut best: Option<(usize, &str)> = None;
    // Numbers after the keyword, nearest first. The gap may contain a
    // duration or a second occurrence of the keyword.
    for (_, keyword_end) in &spans {
        for run in &runs {
            if run.start < *keyword_end {
                continue;
            }
            let gap = cleaned[*keyword_end..run.start].chars().count();
            if gap > 60 || !plausible_code(&cleaned, run) {
                continue;
            }
            if best.is_none_or(|(distance, _)| gap < distance) {
                best = Some((gap, &cleaned[run.start..run.end]));
            }
        }
    }
    // Numbers before the keyword, e.g. "123456 是您的验证码". Slight penalty so
    // the usual "验证码：123456" layout wins on ties.
    for (keyword_start, _) in &spans {
        for run in &runs {
            if run.end > *keyword_start {
                continue;
            }
            let gap = cleaned[run.end..*keyword_start].chars().count();
            if gap > 24 || !plausible_code(&cleaned, run) {
                continue;
            }
            if best.is_none_or(|(distance, _)| gap + 6 < distance) {
                best = Some((gap + 6, &cleaned[run.start..run.end]));
            }
        }
    }
    if let Some((_, value)) = best {
        return Some(value.to_string());
    }
    // The code alone on its own line, when the mail mentions a code at all.
    cleaned
        .lines()
        .map(str::trim)
        .find(|line| (4..=8).contains(&line.len()) && line.bytes().all(|b| b.is_ascii_digit()))
        .map(str::to_string)
}

#[tauri::command]
pub fn copy_mail_code(window: tauri::WebviewWindow, code: String) -> Result<(), String> {
    require_window(&window, "island")?;
    if !(4..=8).contains(&code.len()) || !code.bytes().all(|b| b.is_ascii_digit()) {
        return Err("验证码格式无效".into());
    }
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(code))
        .map_err(|_| "复制失败".to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        MailAccount, append_text, extract_code, netease_greeting_and_id, scan_new_messages,
    };
    #[test]
    fn extracts_code_from_multiline_mail_with_duration() {
        let text = "您好，欢迎使用「即时设计」\n以下是您的验证码，此验证码 15 分钟内有效\n190334";
        assert_eq!(extract_code(text), Some("190334".into()));
    }
    #[test]
    fn extracts_code_from_html_body_with_markup() {
        let html = "<div><p>您好，欢迎使用「即时设计」</p><p>以下是您的验证码，此验证码 15 分钟内有效</p><p><strong>190334</strong></p><p>请勿泄露</p></div>";
        assert_eq!(extract_code(html), Some("190334".into()));
    }
    #[test]
    fn ignores_duration_dates_and_order_numbers() {
        assert_eq!(extract_code("您的验证码 15 分钟内有效，请重新获取"), None);
        assert_eq!(
            extract_code("验证码已于 2026 年 1 月 1 日失效，订单编号 123456"),
            None
        );
    }
    #[test]
    fn extracts_only_codes_with_context() {
        assert_eq!(
            extract_code("您的验证码是 123456，请勿泄露"),
            Some("123456".into())
        );
        assert_eq!(
            extract_code("Your verification code: 385921."),
            Some("385921".into())
        );
        assert_eq!(extract_code("订单编号 123456，金额 1000"), None);
        assert_eq!(extract_code("验证码：1234567890"), None);
    }
    #[test]
    fn reads_verification_code_from_encoded_multipart_mail() {
        let raw = b"Subject: Sign in\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=abc\r\n\r\n--abc\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\nWW91ciB2ZXJpZmljYXRpb24gY29kZTogOTM4Mjc0\r\n--abc--\r\n";
        let message = mailparse::parse_mail(raw).unwrap();
        let mut text = String::new();
        append_text(&message, &mut text, 0);
        assert_eq!(extract_code(&text), Some("938274".into()));
    }
    #[test]
    fn checks_new_uid_and_reads_mail_without_marking_it_seen() {
        use std::io::{Cursor, Read, Write};
        use std::sync::{Arc, Mutex};
        struct Scripted {
            input: Cursor<Vec<u8>>,
            output: Arc<Mutex<Vec<u8>>>,
        }
        impl Read for Scripted {
            fn read(&mut self, data: &mut [u8]) -> std::io::Result<usize> {
                self.input.read(data)
            }
        }
        impl Write for Scripted {
            fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
                self.output.lock().unwrap().extend_from_slice(data);
                Ok(data.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let mail = b"Subject: Verification code\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nYour verification code is 246810.";
        let response = format!(
            "* OK ready\r\na1 OK login\r\n* SEARCH 10 11\r\na2 OK search\r\n* 1 FETCH (UID 11 BODY[]<0> {{{}}}\r\n{})\r\na3 OK fetch\r\n",
            mail.len(),
            String::from_utf8_lossy(mail)
        );
        let output = Arc::new(Mutex::new(Vec::new()));
        let mut client = imap::Client::new(Scripted {
            input: Cursor::new(response.into_bytes()),
            output: output.clone(),
        });
        client.read_greeting().unwrap();
        let mut session = client
            .login("user@example.com", "example-secret")
            .ok()
            .unwrap();
        let account = MailAccount {
            id: "test".into(),
            email: "user@example.com".into(),
            host: "imap.example.com".into(),
            port: 993,
        };
        let (cursor, notices) = scan_new_messages(&mut session, &account, 10).unwrap();
        assert_eq!(cursor, 11);
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].code.as_deref(), Some("246810"));
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("UID SEARCH UID 11:*"));
        assert!(commands.contains("BODY.PEEK[]<0.131072>"));
    }
    #[test]
    fn consumes_netease_id_response_before_imap_login() {
        use std::io::{Cursor, Read, Write};
        struct Script {
            input: Cursor<Vec<u8>>,
            output: Vec<u8>,
        }
        impl Read for Script {
            fn read(&mut self, data: &mut [u8]) -> std::io::Result<usize> {
                self.input.read(data)
            }
        }
        impl Write for Script {
            fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
                self.output.extend_from_slice(data);
                Ok(data.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let mut stream = Script { input: Cursor::new(b"* OK IMAP ready\r\n* ID (\"name\" \"server\")\r\nz0 OK completed\r\na1 OK login\r\n".to_vec()), output: vec![] };
        assert_eq!(
            netease_greeting_and_id(&mut stream).unwrap(),
            b"* OK IMAP ready\r\n"
        );
        assert!(
            String::from_utf8(stream.output.clone())
                .unwrap()
                .starts_with("z0 ID ")
        );
        let mut remaining = String::new();
        stream.read_to_string(&mut remaining).unwrap();
        assert_eq!(remaining, "a1 OK login\r\n");
    }
}
