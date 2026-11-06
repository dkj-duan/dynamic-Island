//! Global hotkeys.
//!
//! A dedicated thread owns a message-only window: the registrations live on
//! that thread, `WM_HOTKEY` arrives in its window procedure and is forwarded
//! to the island as an event, so the webview keeps owning the actions. The
//! island re-applies the recorded bindings whenever the settings change;
//! combos that another program already holds are reported back instead of
//! failing silently. A binding can require a second press within a short
//! window before it fires.

use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(serde::Deserialize)]
pub struct HotkeyBinding {
    pub combo: String,
    pub double: bool,
}

#[derive(serde::Deserialize)]
pub struct HotkeyConfig {
    pub focus: Option<HotkeyBinding>,
    pub water: Option<HotkeyBinding>,
    pub island: Option<HotkeyBinding>,
}

/// Registration slots, in `HotkeyConfig` field order; the strings double as
/// the `global-hotkey` event payload.
const SLOTS: [&str; 3] = ["focus", "water", "island"];

/// What is left after registration: only whether the slot waits for a second
/// press; the OS owns the combo from there.
struct Binding {
    double: bool,
}

static WINDOW: OnceLock<isize> = OnceLock::new();
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static PENDING: Mutex<Option<HotkeyConfig>> = Mutex::new(None);
static FAILURES: Mutex<Vec<HotkeyFailure>> = Mutex::new(Vec::new());
static BINDINGS: Mutex<[Option<Binding>; 3]> = Mutex::new([None, None, None]);
static LAST_PRESS: Mutex<[Option<Instant>; 3]> = Mutex::new([None, None, None]);
static SPAWN: Mutex<()> = Mutex::new(());

/// Custom message that applies a configuration on the hotkey thread.
const WM_APPLY_HOTKEYS: u32 = 0x8000; // WM_APP

/// Two presses inside this window count as a double press.
const DOUBLE_PRESS_WINDOW: Duration = Duration::from_millis(700);

/// A combo another program already holds, with the action it belongs to.
#[derive(Clone, serde::Serialize)]
pub struct HotkeyFailure {
    pub action: &'static str,
    pub combo: String,
}

#[tauri::command]
pub fn apply_hotkeys(
    app: tauri::AppHandle,
    config: HotkeyConfig,
) -> Result<Vec<HotkeyFailure>, String> {
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
        Ok(failures.clone())
    }
}

/// Parses a recorded combo such as `Ctrl+Alt+P`, `F9` or `Ctrl+Shift+Space`
/// into Win32 modifier flags and a virtual-key code.
fn parse_combo(combo: &str) -> Option<(u32, u32)> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN,
    };
    let parts: Vec<&str> = combo.split('+').map(str::trim).collect();
    let (key, modifiers) = parts.split_last()?;
    let mut mods = 0u32;
    for part in modifiers {
        mods |= match part.to_ascii_lowercase().as_str() {
            "ctrl" => MOD_CONTROL,
            "shift" => MOD_SHIFT,
            "alt" => MOD_ALT,
            "win" => MOD_WIN,
            _ => return None,
        };
    }
    let vk = if key.len() >= 2
        && key.starts_with('F')
        && key[1..]
            .parse::<u8>()
            .is_ok_and(|number| (1..=24).contains(&number))
    {
        0x70 + key[1..].parse::<u8>().ok()? as u32 - 1
    } else if *key == "Space" {
        0x20
    } else {
        let mut chars = key.chars();
        match (chars.next(), chars.next()) {
            (Some(c @ ('A'..='Z' | '0'..='9')), None) => c as u32,
            _ => return None,
        }
    };
    Some((mods, vk))
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
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey};
        use windows_sys::Win32::UI::WindowsAndMessaging::{DefWindowProcW, WM_HOTKEY};
        if msg == WM_HOTKEY {
            if let Some(app) = APP.get()
                && let Some(slot) = wparam.checked_sub(1).filter(|index| *index < 3)
                && should_fire(slot)
            {
                let _ = tauri::Emitter::emit_to(app, "island", "global-hotkey", SLOTS[slot]);
            }
            return 0;
        }
        if msg == WM_APPLY_HOTKEYS {
            let config = PENDING.lock().ok().and_then(|mut pending| pending.take());
            if let Some(config) = config {
                let slots = [config.focus, config.water, config.island];
                let mut failures = Vec::new();
                let mut next: [Option<Binding>; 3] = [None, None, None];
                for (index, binding) in slots.into_iter().enumerate() {
                    // A stale registration for a now-disabled slot must go.
                    let _ = UnregisterHotKey(hwnd, (index + 1) as i32);
                    let Some(binding) = binding else {
                        continue;
                    };
                    let Some((mods, vk)) = parse_combo(&binding.combo) else {
                        failures.push(HotkeyFailure {
                            action: SLOTS[index],
                            combo: binding.combo,
                        });
                        continue;
                    };
                    if RegisterHotKey(hwnd, (index + 1) as i32, mods, vk) == 0 {
                        failures.push(HotkeyFailure {
                            action: SLOTS[index],
                            combo: binding.combo,
                        });
                    } else {
                        next[index] = Some(Binding {
                            double: binding.double,
                        });
                    }
                }
                if let Ok(mut slots) = BINDINGS.lock() {
                    *slots = next;
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

/// Double-press bindings fire on the second press inside the window.
fn should_fire(slot: usize) -> bool {
    let Ok(bindings) = BINDINGS.lock() else {
        return false;
    };
    let Some(binding) = bindings[slot].as_ref() else {
        return false;
    };
    if !binding.double {
        return true;
    }
    let Ok(mut last) = LAST_PRESS.lock() else {
        return false;
    };
    let now = Instant::now();
    let second = last[slot].is_some_and(|previous| now - previous <= DOUBLE_PRESS_WINDOW);
    last[slot] = if second { None } else { Some(now) };
    second
}
