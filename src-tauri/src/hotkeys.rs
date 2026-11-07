//! Global hotkeys.
//!
//! A dedicated thread owns a message-only window: the registrations live on
//! that thread, `WM_HOTKEY` arrives in its window procedure and is forwarded
//! to the island as an event, so the webview keeps owning the actions. The
//! island re-applies the recorded bindings whenever the settings change;
//! combos that another program already holds are reported back instead of
//! failing silently. A combo can require a second press within a short
//! window before it fires.
//!
//! Lone modifiers (a recorded double-tap of Ctrl, Alt or Shift) cannot be
//! registered with the OS, so while one is bound the thread also holds a
//! low-level keyboard hook that watches for the quick second press and posts
//! a custom message back to the same window. The hook only observes; keys
//! pass through untouched.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
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

/// What a parsed combo can do: register with the OS, or fire from the hook.
enum ParsedCombo {
    /// Modifiers plus a key, registrable through `RegisterHotKey`.
    Combo(u32, u32),
    /// A lone modifier, fired by the keyboard hook on a quick second press.
    /// The value is the normalized virtual-key code.
    Modifier(u32),
}

/// How an applied binding waits for its gesture.
#[derive(Clone, Copy)]
enum BindingKind {
    /// Registered with the OS; `double` waits for a second `WM_HOTKEY`.
    Registered { double: bool },
    /// Fired by the keyboard hook on the second tap of the modifier.
    ModifierTap(u32),
}

struct Binding {
    kind: BindingKind,
}

static WINDOW: OnceLock<isize> = OnceLock::new();
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static PENDING: Mutex<Option<HotkeyConfig>> = Mutex::new(None);
static FAILURES: Mutex<Vec<HotkeyFailure>> = Mutex::new(Vec::new());
static BINDINGS: Mutex<[Option<Binding>; 3]> = Mutex::new([None, None, None]);
static LAST_PRESS: Mutex<[Option<Instant>; 3]> = Mutex::new([None, None, None]);
static SPAWN: Mutex<()> = Mutex::new(());

/// Keyboard-hook handle, or 0 while no modifier tap is bound.
static HOOK: Mutex<isize> = Mutex::new(0);

/// Hook state, all touched from the hotkey thread only. Atomics keep the
/// hook procedure free of lock ordering concerns; it runs per key press.
static TAP_WATCHED: AtomicU32 = AtomicU32::new(0);
static TAP_DOWN: AtomicU32 = AtomicU32::new(0);
static TAP_LAST_VK: AtomicU32 = AtomicU32::new(0);
static TAP_LAST_MS: AtomicU64 = AtomicU64::new(0);
static TAP_EPOCH: OnceLock<Instant> = OnceLock::new();

/// Custom messages that apply a configuration / report a modifier tap on the
/// hotkey thread.
const WM_APPLY_HOTKEYS: u32 = 0x8000; // WM_APP
const WM_MODIFIER_TAP: u32 = 0x8001;

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

/// Parses a recorded combo such as `Ctrl+Alt+P`, `F9`, `Ctrl+Shift+Space` or
/// a lone `Alt` into what the platform can do with it.
fn parse_combo(combo: &str) -> Option<ParsedCombo> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN,
    };
    // The virtual-key constants are `u16` while key codes flow as `u32`.
    const VK_CONTROL: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL as u32;
    const VK_SHIFT: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_SHIFT as u32;
    const VK_MENU: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_MENU as u32;
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
    // A lone modifier cannot be registered with the OS; it is watched by the
    // keyboard hook for a quick second press. Win would fight the Start menu.
    let modifier_vk = match key.to_ascii_lowercase().as_str() {
        "ctrl" => Some(VK_CONTROL),
        "shift" => Some(VK_SHIFT),
        "alt" => Some(VK_MENU),
        _ => None,
    };
    if let Some(vk) = modifier_vk {
        // With extra modifiers there is no registrable key left, so only the
        // bare form is a modifier tap.
        return modifiers.is_empty().then_some(ParsedCombo::Modifier(vk));
    }
    if modifiers.is_empty() && !key.starts_with('F') {
        // A bare letter, digit or Space would swallow normal typing.
        return None;
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
    Some(ParsedCombo::Combo(mods, vk))
}

/// Normalizes the hook's left/right virtual keys to the recorded form.
fn tap_normalized_vk(vk: u32) -> Option<u32> {
    const CONTROL: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL as u32;
    const SHIFT: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_SHIFT as u32;
    const MENU: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_MENU as u32;
    const LCONTROL: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_LCONTROL as u32;
    const RCONTROL: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_RCONTROL as u32;
    const LSHIFT: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_LSHIFT as u32;
    const RSHIFT: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_RSHIFT as u32;
    const LMENU: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_LMENU as u32;
    const RMENU: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_RMENU as u32;
    Some(match vk {
        LCONTROL | RCONTROL | CONTROL => CONTROL,
        LSHIFT | RSHIFT | SHIFT => SHIFT,
        LMENU | RMENU | MENU => MENU,
        _ => return None,
    })
}

/// The watched bit for a normalized modifier key.
fn tap_bit(vk: u32) -> Option<u32> {
    const CONTROL: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL as u32;
    const SHIFT: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_SHIFT as u32;
    const MENU: u32 = windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_MENU as u32;
    Some(match vk {
        CONTROL => 1,
        SHIFT => 2,
        MENU => 4,
        _ => return None,
    })
}

fn tap_now_ms() -> u64 {
    TAP_EPOCH.get_or_init(Instant::now).elapsed().as_millis() as u64
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
        if msg == WM_MODIFIER_TAP {
            // The hook decided this is the second tap of a watched modifier;
            // every slot bound to that gesture fires.
            if let Ok(bindings) = BINDINGS.lock()
                && let Some(app) = APP.get()
            {
                for (index, binding) in bindings.iter().enumerate() {
                    if let Some(binding) = binding
                        && let BindingKind::ModifierTap(vk) = binding.kind
                        && vk == wparam as u32
                    {
                        let _ =
                            tauri::Emitter::emit_to(app, "island", "global-hotkey", SLOTS[index]);
                    }
                }
            }
            return 0;
        }
        if msg == WM_APPLY_HOTKEYS {
            let config = PENDING.lock().ok().and_then(|mut pending| pending.take());
            if let Some(config) = config {
                let slots = [config.focus, config.water, config.island];
                let mut failures = Vec::new();
                let mut next: [Option<Binding>; 3] = [None, None, None];
                let mut watched = 0u32;
                let mut modifier_slots: Vec<(usize, String)> = Vec::new();
                for (index, binding) in slots.into_iter().enumerate() {
                    // A stale registration for a now-disabled slot must go.
                    let _ = UnregisterHotKey(hwnd, (index + 1) as i32);
                    let Some(binding) = binding else {
                        continue;
                    };
                    match parse_combo(&binding.combo) {
                        Some(ParsedCombo::Combo(mods, vk)) => {
                            if RegisterHotKey(hwnd, (index + 1) as i32, mods, vk) == 0 {
                                failures.push(HotkeyFailure {
                                    action: SLOTS[index],
                                    combo: binding.combo,
                                });
                            } else {
                                next[index] = Some(Binding {
                                    kind: BindingKind::Registered {
                                        double: binding.double,
                                    },
                                });
                            }
                        }
                        Some(ParsedCombo::Modifier(vk)) if binding.double => {
                            next[index] = Some(Binding {
                                kind: BindingKind::ModifierTap(vk),
                            });
                            watched |= tap_bit(vk).unwrap_or(0);
                            modifier_slots.push((index, binding.combo));
                        }
                        // A lone modifier without the double gesture would
                        // have to steal the key system-wide; refuse it.
                        _ => failures.push(HotkeyFailure {
                            action: SLOTS[index],
                            combo: binding.combo,
                        }),
                    }
                }
                // The hook follows the bindings: installed only while a
                // modifier tap is bound, so plain key presses stay unhooked.
                let taps_ready = if watched != 0 {
                    TAP_WATCHED.store(watched, Ordering::Relaxed);
                    install_hook()
                } else {
                    TAP_WATCHED.store(0, Ordering::Relaxed);
                    TAP_LAST_VK.store(0, Ordering::Relaxed);
                    TAP_DOWN.store(0, Ordering::Relaxed);
                    remove_hook();
                    true
                };
                if !taps_ready {
                    TAP_WATCHED.store(0, Ordering::Relaxed);
                    for (index, combo) in modifier_slots {
                        next[index] = None;
                        failures.push(HotkeyFailure {
                            action: SLOTS[index],
                            combo,
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

/// Installs the low-level keyboard hook; returns whether taps can fire.
fn install_hook() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowsHookExW, WH_KEYBOARD_LL};
    let Ok(mut hook) = HOOK.lock() else {
        return false;
    };
    if *hook != 0 {
        return true;
    }
    let installed = unsafe {
        use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
        SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(hook_proc),
            GetModuleHandleW(std::ptr::null()),
            0,
        )
    };
    if installed.is_null() {
        return false;
    }
    *hook = installed as isize;
    true
}

fn remove_hook() {
    use windows_sys::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx;
    let Ok(mut hook) = HOOK.lock() else {
        return;
    };
    if *hook != 0 {
        unsafe { UnhookWindowsHookEx(*hook as _) };
        *hook = 0;
    }
}

/// Watches watched modifiers for the quick second press of a double-tap
/// gesture. The hook only observes; every key continues through the chain.
unsafe extern "system" fn hook_proc(code: i32, wparam: usize, lparam: isize) -> isize {
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            CallNextHookEx, KBDLLHOOKSTRUCT, PostMessageW, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
            WM_SYSKEYUP,
        };
        if code >= 0 && TAP_WATCHED.load(Ordering::Relaxed) != 0 {
            let info = &*(lparam as *const KBDLLHOOKSTRUCT);
            let down = matches!(wparam as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
            let up = matches!(wparam as u32, WM_KEYUP | WM_SYSKEYUP);
            if let Some(vk) = tap_normalized_vk(info.vkCode)
                && let Some(bit) = tap_bit(vk)
            {
                if down {
                    // Held keys auto-repeat; only a fresh press counts.
                    if TAP_DOWN.fetch_or(bit, Ordering::Relaxed) & bit == 0 {
                        let now = tap_now_ms();
                        let last_vk = TAP_LAST_VK.swap(0, Ordering::Relaxed);
                        let last_ms = TAP_LAST_MS.swap(0, Ordering::Relaxed);
                        if last_vk == vk
                            && now.saturating_sub(last_ms) <= DOUBLE_PRESS_WINDOW.as_millis() as u64
                        {
                            if let Some(hwnd) = WINDOW.get() {
                                PostMessageW(*hwnd as _, WM_MODIFIER_TAP, vk as usize, 0);
                            }
                        } else {
                            TAP_LAST_VK.store(vk, Ordering::Relaxed);
                            TAP_LAST_MS.store(now, Ordering::Relaxed);
                        }
                    }
                } else if up {
                    TAP_DOWN.fetch_and(!bit, Ordering::Relaxed);
                } else {
                    TAP_LAST_VK.store(0, Ordering::Relaxed);
                }
            } else if down {
                // Anything pressed between the two taps breaks the gesture.
                TAP_LAST_VK.store(0, Ordering::Relaxed);
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }
}

/// Double-press combos fire on the second press inside the window.
fn should_fire(slot: usize) -> bool {
    let Ok(bindings) = BINDINGS.lock() else {
        return false;
    };
    let Some(binding) = bindings[slot].as_ref() else {
        return false;
    };
    let BindingKind::Registered { double } = binding.kind else {
        return false;
    };
    if !double {
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

#[cfg(test)]
mod tests {
    use super::ParsedCombo::{Combo, Modifier};
    use super::parse_combo;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        MOD_ALT, MOD_CONTROL, MOD_SHIFT, VK_CONTROL, VK_MENU, VK_SHIFT,
    };

    #[test]
    fn parses_combos() {
        let Combo(mods, vk) = parse_combo("Ctrl+Alt+P").unwrap() else {
            panic!("expected a registrable combo");
        };
        assert_eq!(mods, MOD_CONTROL | MOD_ALT);
        assert_eq!(vk, u32::from(b'P'));
        let Combo(mods, vk) = parse_combo("F9").unwrap() else {
            panic!("expected a registrable combo");
        };
        assert_eq!(mods, 0);
        assert_eq!(vk, 0x70 + 8);
        let Combo(mods, vk) = parse_combo("Ctrl+Shift+Space").unwrap() else {
            panic!("expected a registrable combo");
        };
        assert_eq!(mods, MOD_CONTROL | MOD_SHIFT);
        assert_eq!(vk, 0x20);
    }

    #[test]
    fn parses_lone_modifiers_for_the_tap_gesture() {
        let Modifier(vk) = parse_combo("Alt").unwrap() else {
            panic!("expected a modifier tap");
        };
        assert_eq!(vk, u32::from(VK_MENU));
        let Modifier(vk) = parse_combo("ctrl").unwrap() else {
            panic!("expected a modifier tap");
        };
        assert_eq!(vk, u32::from(VK_CONTROL));
        let Modifier(vk) = parse_combo("Shift").unwrap() else {
            panic!("expected a modifier tap");
        };
        assert_eq!(vk, u32::from(VK_SHIFT));
    }

    #[test]
    fn rejects_unregistrable_combos() {
        // Win alone would fight the Start menu; two modifiers without a key,
        // bare letters and unknown names cannot fire either.
        assert!(parse_combo("Win").is_none());
        assert!(parse_combo("Ctrl+Alt").is_none());
        assert!(parse_combo("Shift+Shift").is_none());
        assert!(parse_combo("J").is_none());
        assert!(parse_combo("Ctrl+F25").is_none());
        assert!(parse_combo("").is_none());
    }

    #[test]
    fn modifier_taps_only_cover_the_three_modifiers() {
        // The bit mapping is stable: Ctrl, Shift, Alt in that order.
        for (combo, bit) in [("Ctrl", 1), ("Shift", 2), ("Alt", 4)] {
            let Modifier(vk) = parse_combo(combo).unwrap() else {
                panic!("expected a modifier tap");
            };
            assert_eq!(super::tap_bit(vk), Some(bit));
            assert_eq!(super::tap_normalized_vk(vk), Some(vk));
        }
    }

    #[test]
    fn left_and_right_variants_normalize_together() {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT,
        };
        assert_eq!(
            super::tap_normalized_vk(u32::from(VK_LCONTROL)),
            Some(u32::from(VK_CONTROL))
        );
        assert_eq!(
            super::tap_normalized_vk(u32::from(VK_RCONTROL)),
            Some(u32::from(VK_CONTROL))
        );
        assert_eq!(
            super::tap_normalized_vk(u32::from(VK_LSHIFT)),
            Some(u32::from(VK_SHIFT))
        );
        assert_eq!(
            super::tap_normalized_vk(u32::from(VK_RSHIFT)),
            Some(u32::from(VK_SHIFT))
        );
        assert_eq!(
            super::tap_normalized_vk(u32::from(VK_LMENU)),
            Some(u32::from(VK_MENU))
        );
        assert_eq!(
            super::tap_normalized_vk(u32::from(VK_RMENU)),
            Some(u32::from(VK_MENU))
        );
    }
}
