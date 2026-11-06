//! Global hotkeys.
//!
//! A dedicated thread owns a message-only window: the registrations live on
//! that thread, `WM_HOTKEY` arrives in its window procedure and is forwarded
//! to the island as an event, so the webview keeps owning the actions. The
//! island re-applies the configuration whenever the settings change; combos
//! that another program already holds are reported back instead of failing
//! silently.

use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// Ctrl+Alt+P starts or pauses a focus session, Ctrl+Alt+W logs a cup of
/// water, Ctrl+Alt+E expands or collapses the island.
const ENTRIES: [(&str, HotkeyEntry); 3] = [
    (
        "Ctrl+Alt+P",
        HotkeyEntry {
            id: 1,
            vk: 0x50,
            action: "focus",
        },
    ),
    (
        "Ctrl+Alt+W",
        HotkeyEntry {
            id: 2,
            vk: 0x57,
            action: "water",
        },
    ),
    (
        "Ctrl+Alt+E",
        HotkeyEntry {
            id: 3,
            vk: 0x45,
            action: "island",
        },
    ),
];

struct HotkeyEntry {
    id: i32,
    vk: u32,
    /// Action the island understands as the `global-hotkey` payload.
    action: &'static str,
}

static WINDOW: OnceLock<isize> = OnceLock::new();
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static PENDING: Mutex<Option<HotkeyConfig>> = Mutex::new(None);
static FAILURES: Mutex<Vec<&'static str>> = Mutex::new(Vec::new());
static SPAWN: Mutex<()> = Mutex::new(());

/// Custom message that applies a configuration on the hotkey thread.
const WM_APPLY_HOTKEYS: u32 = 0x8000; // WM_APP

#[derive(serde::Deserialize)]
pub struct HotkeyConfig {
    pub focus: bool,
    pub water: bool,
    pub island: bool,
}

#[tauri::command]
pub fn apply_hotkeys(app: tauri::AppHandle, config: HotkeyConfig) -> Result<Vec<String>, String> {
    let hwnd = ensure_thread(app)?;
    unsafe {
        *PENDING.lock().map_err(|_| "快捷键状态不可用".to_string())? = Some(config);
        // SendMessage blocks until the hotkey thread has applied the new
        // configuration, so the caller sees this registration's failures.
        windows_sys::Win32::UI::WindowsAndMessaging::SendMessageW(
            hwnd as _,
            WM_APPLY_HOTKEYS,
            0,
            0,
        );
        let failures = FAILURES
            .lock()
            .map_err(|_| "快捷键状态不可用".to_string())?;
        Ok(failures.iter().map(|combo| combo.to_string()).collect())
    }
}

fn ensure_thread(app: tauri::AppHandle) -> Result<isize, String> {
    if let Some(hwnd) = WINDOW.get() {
        return Ok(*hwnd);
    }
    let _guard = SPAWN.lock().map_err(|_| "快捷键线程不可用".to_string())?;
    if let Some(hwnd) = WINDOW.get() {
        return Ok(*hwnd);
    }
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || hotkey_thread(app, tx));
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|_| "快捷键线程启动超时".to_string())??;
    WINDOW
        .get()
        .copied()
        .ok_or_else(|| "快捷键窗口不可用".to_string())
}

fn hotkey_thread(app: tauri::AppHandle, ready: mpsc::Sender<Result<(), String>>) {
    unsafe {
        use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DispatchMessageW, GetMessageW, HWND_MESSAGE, MSG, RegisterClassW,
            TranslateMessage, WNDCLASSW,
        };
        if APP.set(app).is_err() {
            let _ = ready.send(Err("快捷键线程重复启动".into()));
            return;
        }
        let class_name: Vec<u16> = "DynamicIslandHotkeys\0".encode_utf16().collect();
        let hinstance = GetModuleHandleW(std::ptr::null());
        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        if RegisterClassW(&wc) == 0 {
            let _ = ready.send(Err("快捷键窗口类注册失败".into()));
            return;
        }
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            hinstance,
            std::ptr::null(),
        );
        if hwnd.is_null() {
            let _ = ready.send(Err("快捷键窗口创建失败".into()));
            return;
        }
        if WINDOW.set(hwnd as isize).is_err() {
            let _ = ready.send(Err("快捷键窗口重复创建".into()));
            return;
        }
        let _ = ready.send(Ok(()));
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: usize,
    _lparam: isize,
) -> isize {
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            MOD_ALT, MOD_CONTROL, RegisterHotKey, UnregisterHotKey,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{DefWindowProcW, WM_HOTKEY};
        if msg == WM_HOTKEY {
            if let (Some(app), Some((_, entry))) = (
                APP.get(),
                ENTRIES.iter().find(|(_, entry)| entry.id == wparam as i32),
            ) {
                let _ = tauri::Emitter::emit_to(app, "island", "global-hotkey", entry.action);
            }
            return 0;
        }
        if msg == WM_APPLY_HOTKEYS {
            let config = PENDING.lock().ok().and_then(|mut pending| pending.take());
            if let Some(config) = config {
                let enabled = [config.focus, config.water, config.island];
                let mut failures = Vec::new();
                for ((combo, entry), on) in ENTRIES.iter().zip(enabled) {
                    // A stale registration for a now-disabled combo must go.
                    let _ = UnregisterHotKey(hwnd, entry.id);
                    if !on {
                        continue;
                    }
                    if RegisterHotKey(hwnd, entry.id, MOD_CONTROL | MOD_ALT, entry.vk) == 0 {
                        failures.push(*combo);
                    }
                }
                if let Ok(mut slot) = FAILURES.lock() {
                    *slot = failures;
                }
            }
            return 0;
        }
        DefWindowProcW(hwnd, msg, wparam, _lparam)
    }
}
