//! Local, read-only QQ NT session-list monitoring. Mirrors `wechat.rs`: one
//! dedicated worker owns every UI Automation call so none of them block a
//! window thread or overlap another poll.
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

static ENABLED: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Bring an already running, verified QQ main window to the foreground.
#[tauri::command]
pub async fn open_qq() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(activate_qq)
        .await
        .map_err(|_| "无法打开QQ，请手动打开QQ窗口。".to_string())?
}

/// Bring an already running, verified QQ main window to the foreground.
#[cfg(target_os = "windows")]
fn activate_qq() -> Result<(), String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SW_RESTORE, SW_SHOW,
        SetForegroundWindow, ShowWindowAsync,
    };
    use windows::core::{PWSTR, w};

    unsafe {
        let hwnd =
            FindWindowW(None, w!("QQ")).map_err(|_| "未找到QQ窗口，请先打开QQ。".to_string())?;
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
            .map_err(|_| "无法确认QQ窗口，请手动打开QQ。".to_string())?;
        let mut path = [0u16; 1024];
        let mut length = path.len() as u32;
        let result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(process);
        result.map_err(|_| "无法确认QQ窗口，请手动打开QQ。".to_string())?;
        let path = String::from_utf16_lossy(&path[..length as usize]);
        let executable = path.rsplit(['\\', '/']).next().unwrap_or("");
        if !executable.eq_ignore_ascii_case("QQ.exe") {
            return Err("找到的窗口不是QQ，请手动打开QQ。".into());
        }
        if IsIconic(hwnd).as_bool() {
            if !ShowWindowAsync(hwnd, SW_RESTORE).as_bool() {
                return Err("无法恢复QQ窗口，请手动打开QQ。".to_string());
            }
        } else if !IsWindowVisible(hwnd).as_bool() && !ShowWindowAsync(hwnd, SW_SHOW).as_bool() {
            return Err("无法显示QQ窗口，请手动打开QQ。".to_string());
        }
        // ShowWindowAsync returns before the other process paints its window.
        // Keep the wait bounded and on this worker, never on the window thread.
        for _ in 0..10 {
            if IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return Err("无法显示QQ窗口，请手动打开QQ。".to_string());
        }
        if !SetForegroundWindow(hwnd).as_bool() {
            return Err("系统未允许切换到QQ，请手动打开QQ。".into());
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn activate_qq() -> Result<(), String> {
    Err("打开QQ目前仅支持 Windows。".into())
}

/// The handle of a running QQ main window, when present.
#[cfg(target_os = "windows")]
fn qq_window() -> Option<windows::Win32::Foundation::HWND> {
    use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
    use windows::core::w;
    unsafe { FindWindowW(None, w!("QQ")).ok() }
}

#[cfg(target_os = "windows")]
fn qq_pid() -> u32 {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
    let Some(hwnd) = qq_window() else {
        return 0;
    };
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid
}

#[tauri::command]
pub fn set_qq_notifications(app: tauri::AppHandle, enabled: bool) {
    if ENABLED.swap(enabled, Ordering::SeqCst) != enabled {
        GENERATION.fetch_add(1, Ordering::SeqCst);
    }
    #[cfg(target_os = "windows")]
    if enabled && !STARTED.swap(true, Ordering::SeqCst) {
        std::thread::spawn(move || worker(app));
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (app, &STARTED);
}

#[cfg(target_os = "windows")]
fn worker(app: tauri::AppHandle) {
    use std::collections::HashMap;
    use std::time::Duration;
    use tauri::Emitter;
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    };
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};
    let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if com.is_err() {
        STARTED.store(false, Ordering::SeqCst);
        return;
    }
    let automation: windows::core::Result<IUIAutomation> =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) };
    if let Ok(automation) = automation {
        let mut previous: HashMap<String, Session> = HashMap::new();
        let mut initialized = false;
        let mut generation = GENERATION.load(Ordering::SeqCst);
        let mut process_id = 0;
        loop {
            let current_generation = GENERATION.load(Ordering::SeqCst);
            if current_generation != generation {
                previous.clear();
                initialized = false;
                generation = current_generation;
            }
            if !ENABLED.load(Ordering::SeqCst) {
                previous.clear();
                initialized = false;
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            // Scanning QQ's UIA tree while it is in the foreground steals its
            // UI thread and stalls the app, so pause while the user is
            // actually looking at QQ. Background queries keep reminders alive.
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
                let foreground = GetForegroundWindow();
                let mut foreground_pid = 0u32;
                if !foreground.is_invalid() {
                    windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(
                        foreground,
                        Some(&mut foreground_pid),
                    );
                }
                if foreground_pid == qq_pid() {
                    std::thread::sleep(Duration::from_millis(1500));
                    continue;
                }
            }
            if let Some((pid, rows)) = scan(&automation) {
                if process_id != pid {
                    previous.clear();
                    initialized = false;
                    process_id = pid;
                }
                if !ENABLED.load(Ordering::SeqCst)
                    || generation != GENERATION.load(Ordering::SeqCst)
                {
                    continue;
                }
                if !rows.is_empty() {
                    for (key, current) in rows {
                        if initialized
                            && previous
                                .get(&key)
                                .is_some_and(|old| is_new_unread(old, &current))
                        {
                            let text: String = format!("{}：{}", current.contact, current.preview)
                                .chars()
                                .take(80)
                                .collect();
                            let _ = app.emit_to(
                                "island",
                                "app-notification",
                                crate::notifications::AppNotification {
                                    app: "QQ".into(),
                                    text,
                                    source: "qq",
                                },
                            );
                        }
                        if previous.len() < 500 || previous.contains_key(&key) {
                            previous.insert(key, current);
                        }
                    }
                    initialized = true;
                }
            }
            // QQ NT's Chromium UIA bridge is heavier than WeChat's; poll it
            // at half the WeChat rate to keep the app responsive.
            std::thread::sleep(Duration::from_millis(3000));
        }
    }
    unsafe { CoUninitialize() };
    STARTED.store(false, Ordering::SeqCst);
}

#[cfg(target_os = "windows")]
#[derive(Debug)]
struct Session {
    contact: String,
    preview: String,
    unread: u32,
}

#[cfg(target_os = "windows")]
fn is_new_unread(old: &Session, current: &Session) -> bool {
    current.unread > old.unread || (current.unread > 0 && current.preview != old.preview)
}

/// Unread badges: the item's container is named `N条未读`; the visible badge
/// itself may read `99+`.
#[cfg(target_os = "windows")]
fn unread_from_label(label: &str) -> Option<u32> {
    use std::sync::OnceLock;
    static UNREAD: OnceLock<regex::Regex> = OnceLock::new();
    let unread = UNREAD.get_or_init(|| regex::Regex::new(r"^(\d+)条未读$").unwrap());
    unread
        .captures(label)
        .and_then(|captures| captures.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

/// QQ renders one session block as separate elements: the preview line, the
/// timestamp and the contact name come last, in that order. Muted flags and
/// unread containers carry their own names and are not message text.
#[cfg(target_os = "windows")]
fn parse_qq_item(names: &[String]) -> Option<Session> {
    use std::sync::OnceLock;
    static TIME: OnceLock<regex::Regex> = OnceLock::new();
    static BADGE: OnceLock<regex::Regex> = OnceLock::new();
    let time = TIME.get_or_init(|| {
        regex::Regex::new(
            r"^(?:\d{1,2}:\d{2}|\d{1,2}/\d{1,2}|\d{4}/\d{1,2}/\d{1,2}|昨天\d{1,2}:\d{2}|昨天|前天|星期[一二三四五六日天]|周[一二三四五六日天]|刚刚)$",
        )
        .unwrap()
    });
    let badge = BADGE.get_or_init(|| regex::Regex::new(r"^\d+\+?$").unwrap());
    let mut unread = 0;
    let mut texts: Vec<&str> = Vec::new();
    for raw in names {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(count) = unread_from_label(trimmed) {
            unread = count;
            continue;
        }
        if matches!(trimmed, "免打扰" | "消息免打扰" | "静音") {
            continue;
        }
        texts.push(trimmed);
    }
    if texts.len() < 2 {
        return None;
    }
    // The contact name is rendered last; the visible badge number ("1", "99+")
    // sits before the preview and must not become the contact or the preview.
    // QQ splits the preview into sender and content elements — join them.
    let contact = *texts.last()?;
    let body = &texts[..texts.len() - 1];
    let mut preview_parts: Vec<&str> = Vec::new();
    for line in body {
        if badge.is_match(line) {
            continue;
        }
        if time.is_match(line) {
            break;
        }
        preview_parts.push(line);
    }
    let preview = preview_parts.join("");
    Some(Session {
        contact: contact.chars().take(80).collect(),
        preview: if preview.is_empty() {
            "收到新消息".into()
        } else {
            preview.chars().take(80).collect()
        },
        unread,
    })
}

#[cfg(target_os = "windows")]
fn scan(
    automation: &windows::Win32::UI::Accessibility::IUIAutomation,
) -> Option<(u32, Vec<(String, Session)>)> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::Accessibility::{TreeScope_Children, TreeScope_Descendants};
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, GetWindowThreadProcessId};
    use windows::core::{PWSTR, w};
    unsafe {
        let hwnd = FindWindowW(None, w!("QQ")).ok()?;
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut path = [0u16; 1024];
        let mut length = path.len() as u32;
        let query = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(process);
        query.ok()?;
        let path = String::from_utf16_lossy(&path[..length as usize]);
        if !path
            .rsplit(['\\', '/'])
            .next()?
            .eq_ignore_ascii_case("QQ.exe")
        {
            return None;
        }
        let root = automation.ElementFromHandle(hwnd).ok()?;
        let condition = automation.CreateTrueCondition().ok()?;
        let descendants = root.FindAll(TreeScope_Descendants, &condition).ok()?;
        let mut list = None;
        for index in 0..descendants.Length().ok()?.min(500) {
            let Ok(item) = descendants.GetElement(index) else {
                continue;
            };
            if item.CurrentName().is_ok_and(|name| name == "会话列表") {
                list = Some(item);
                break;
            }
        }
        let children = list?.FindAll(TreeScope_Children, &condition).ok()?;
        let mut rows = Vec::new();
        for index in 0..children.Length().ok()?.min(200) {
            let Ok(item) = children.GetElement(index) else {
                continue;
            };
            let block = item.FindAll(TreeScope_Descendants, &condition).ok()?;
            let mut names: Vec<String> = Vec::new();
            for name_index in 0..block.Length().ok()?.min(60) {
                let Ok(entry) = block.GetElement(name_index) else {
                    continue;
                };
                let Ok(name) = entry.CurrentName() else {
                    continue;
                };
                let name = name.to_string();
                if !name.trim().is_empty() && name.len() <= 512 {
                    names.push(name);
                }
            }
            let key = names
                .last()
                .map(|name| name.chars().take(80).collect::<String>())
                .unwrap_or_default();
            if key.is_empty() {
                continue;
            }
            if let Some(session) = parse_qq_item(&names) {
                rows.push((key, session));
            }
        }
        Some((pid, rows))
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{is_new_unread, parse_qq_item};

    fn item(names: &[&str]) -> super::Session {
        parse_qq_item(
            &names
                .iter()
                .map(|name| name.to_string())
                .collect::<Vec<_>>(),
        )
        .unwrap()
    }

    #[test]
    fn parses_unread_session_with_badge_and_muted_flag() {
        let session = item(&["1条未读", "1", "哈哈哈", "15:21", "我的手机"]);
        assert_eq!(
            (
                session.contact.as_str(),
                session.preview.as_str(),
                session.unread
            ),
            ("我的手机", "哈哈哈", 1)
        );
        let muted = item(&[
            "免打扰",
            "99+",
            "9038条未读",
            "蔓野之人：",
            "😯😯",
            "2025/12/03",
            "魔都摄影光影同好会",
        ]);
        assert_eq!(muted.unread, 9038);
        assert_eq!(
            (muted.contact.as_str(), muted.preview.as_str()),
            ("魔都摄影光影同好会", "蔓野之人：😯😯")
        );
    }

    #[test]
    fn parses_read_session_without_unread_marker() {
        let session = item(&["[远程协助] 协助时长 04:05", "10/16", "屑殪"]);
        assert_eq!(
            (
                session.contact.as_str(),
                session.preview.as_str(),
                session.unread
            ),
            ("屑殪", "[远程协助] 协助时长 04:05", 0)
        );
    }

    #[test]
    fn rejects_blocks_without_enough_text() {
        assert!(parse_qq_item(&["1条未读".to_string(), "1".to_string()]).is_none());
        assert!(parse_qq_item(&[]).is_none());
    }

    #[test]
    fn unread_changes_emit_once_and_read_preview_changes_do_not() {
        let read = item(&["原消息", "12:30", "Alice"]);
        let unread = item(&["1条未读", "1", "新消息", "12:31", "Alice"]);
        let second = item(&["2条未读", "2", "新消息", "12:31", "Alice"]);
        assert!(is_new_unread(&read, &unread));
        assert!(!is_new_unread(&unread, &unread));
        assert!(is_new_unread(&unread, &second));
        assert!(!is_new_unread(&unread, &read));
    }
}
