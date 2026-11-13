//! Local, read-only WeChat 4.x session-list monitoring.
//! UI Automation can block inside another process, so one dedicated worker
//! owns all calls. It never runs on a window thread or spawns overlapping polls.
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

static ENABLED: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
static GENERATION: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub fn set_wechat_notifications(app: tauri::AppHandle, enabled: bool) {
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
                                    app: "微信".into(),
                                    text,
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
            std::thread::sleep(Duration::from_millis(1500));
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

#[cfg(target_os = "windows")]
fn parse_session(raw: &str) -> Option<Session> {
    use std::sync::OnceLock;
    static UNREAD: OnceLock<regex::Regex> = OnceLock::new();
    static TIME: OnceLock<regex::Regex> = OnceLock::new();
    let unread = UNREAD.get_or_init(|| {
        regex::Regex::new(r"^(?:\[\s*(\d+)\s*条?\s*\]|(\d+)\s*条(?:未读(?:消息)?|新消息))$")
            .unwrap()
    });
    let time = TIME.get_or_init(|| regex::Regex::new(r"^(?:\d{1,2}:\d{2}|\d{1,2}/\d{1,2}|昨天|前天|星期[一二三四五六日天]|周[一二三四五六日天]|刚刚)$").unwrap());
    let lines: Vec<&str> = raw
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .take(32)
        .collect();
    if lines.len() < 2 {
        return None;
    }
    let mut count = 0;
    let mut preview = "";
    for line in &lines[1..] {
        if let Some(captures) = unread.captures(line) {
            count = captures
                .get(1)
                .or_else(|| captures.get(2))
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
        } else if time.is_match(line) {
            break;
        } else if !matches!(
            *line,
            "已置顶"
                | "置顶聊天"
                | "消息免打扰"
                | "免打扰"
                | "静音"
                | "有新消息"
                | "以下为新消息"
                | "有人@我"
                | "@我"
        ) {
            preview = line;
        }
    }
    Some(Session {
        contact: lines[0].chars().take(80).collect(),
        preview: if preview.is_empty() {
            "收到新消息".into()
        } else {
            preview.chars().take(80).collect()
        },
        unread: count,
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
        let hwnd = FindWindowW(None, w!("微信")).ok()?;
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
            .eq_ignore_ascii_case("Weixin.exe")
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
            if item
                .CurrentAutomationId()
                .is_ok_and(|id| id == "session_list")
            {
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
            let Ok(id) = item.CurrentAutomationId() else {
                continue;
            };
            let id = id.to_string();
            if !id.starts_with("session_item_") || id.len() > 512 {
                continue;
            }
            let Ok(name) = item.CurrentName() else {
                continue;
            };
            if let Some(session) = parse_session(&name.to_string()) {
                rows.push((id, session));
            }
        }
        Some((pid, rows))
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{is_new_unread, parse_session};
    #[test]
    fn parses_unread_session_without_including_status() {
        let item = parse_session("Alice\n[2条]\n你好\n12:30\n消息免打扰").unwrap();
        assert_eq!(
            (item.contact.as_str(), item.preview.as_str(), item.unread),
            ("Alice", "你好", 2)
        );
        let read = parse_session("Bob\n已置顶\n上一条消息\n昨天").unwrap();
        assert_eq!((read.preview.as_str(), read.unread), ("上一条消息", 0));
    }
    #[test]
    fn unread_changes_emit_once_and_read_preview_changes_do_not() {
        let read = parse_session("Alice\n原消息\n12:30").unwrap();
        let unread = parse_session("Alice\n[1条]\n新消息\n12:31").unwrap();
        let second = parse_session("Alice\n[2条]\n新消息\n12:31").unwrap();
        assert!(is_new_unread(&read, &unread));
        assert!(!is_new_unread(&unread, &unread));
        assert!(is_new_unread(&unread, &second));
        assert!(!is_new_unread(&unread, &read));
    }
}
