use serde::Serialize;
#[cfg(not(target_os = "windows"))]
use tauri::LogicalSize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconEvent;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

mod ai_quota;
mod audio;
mod hotkeys;
mod lyrics;
mod mail;
#[cfg(target_os = "windows")]
mod netease_log;
#[cfg(target_os = "windows")]
mod netease_timeline;
mod notifications;
mod storage;
mod system_status;
mod wechat;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaState {
    title: String,
    artist: String,
    playing: bool,
    position_seconds: Option<f64>,
    duration_seconds: Option<f64>,
    can_seek: bool,
}

#[cfg(target_os = "windows")]
struct MediaApartment;

#[cfg(target_os = "windows")]
impl MediaApartment {
    fn initialize() -> Result<Self, String> {
        use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
            .ok()
            .map_err(|e| format!("媒体线程初始化失败: {e}"))?;
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for MediaApartment {
    fn drop(&mut self) {
        unsafe { windows::Win32::System::Com::CoUninitialize() }
    }
}

#[cfg(target_os = "windows")]
fn await_media_operation<T: windows::core::RuntimeType + 'static>(
    operation: windows_future::IAsyncOperation<T>,
) -> Result<T, String> {
    let started = std::time::Instant::now();
    while operation.Status().map_err(|e| e.to_string())? == windows_future::AsyncStatus::Started {
        if started.elapsed() >= std::time::Duration::from_secs(3) {
            let _ = operation.Cancel();
            return Err("媒体服务响应超时".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    operation.GetResults().map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn current_media_session()
-> Result<windows::Media::Control::GlobalSystemMediaTransportControlsSession, String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Manager;
    let manager = await_media_operation(Manager::RequestAsync().map_err(|e| e.to_string())?)?;
    manager.GetCurrentSession().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_media_state() -> Result<Option<MediaState>, String> {
    tauri::async_runtime::spawn_blocking(read_media_state)
        .await
        .map_err(|_| "读取媒体状态失败".to_string())?
}

fn read_media_state() -> Result<Option<MediaState>, String> {
    #[cfg(target_os = "windows")]
    {
        let _apartment = MediaApartment::initialize()?;
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus;
        let fallback = || {
            netease_log::current().map(|state| MediaState {
                title: state.title,
                artist: state.artist,
                playing: state.playing,
                position_seconds: Some(state.position),
                duration_seconds: Some(state.duration),
                can_seek: false,
            })
        };
        let session = match current_media_session() {
            Ok(session) => session,
            Err(_) => return Ok(fallback()),
        };
        let properties = match session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| e.to_string())
            .and_then(await_media_operation)
        {
            Ok(properties) => properties,
            Err(_) => return Ok(fallback()),
        };
        let status = session
            .GetPlaybackInfo()
            .and_then(|info| info.PlaybackStatus())
            .map_err(|e| e.to_string())?;
        let timeline = session.GetTimelineProperties().ok();
        let mut position = timeline
            .as_ref()
            .and_then(|t| t.Position().ok())
            .map(|t| t.Duration as f64 / 10_000_000.0);
        let mut duration = timeline
            .as_ref()
            .and_then(|t| t.EndTime().ok())
            .map(|t| t.Duration as f64 / 10_000_000.0)
            .filter(|t| *t > 0.0);
        if status == PlaybackStatus::Playing
            && duration.is_some()
            && let (Some(pos), Some(updated)) = (
                position.as_mut(),
                timeline.as_ref().and_then(|t| t.LastUpdatedTime().ok()),
            )
        {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|t| t.as_secs_f64() + 11_644_473_600.0);
            if let Some(lag) = now
                .map(|n| n - updated.UniversalTime as f64 / 10_000_000.0)
                .filter(|lag| (0.0..86_400.0).contains(lag))
            {
                *pos = (*pos + lag).min(duration.unwrap_or(*pos));
            }
        }
        let source = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let mut used_fallback = false;
        if source.eq_ignore_ascii_case("cloudmusic.exe") && duration.is_none() {
            let title = properties
                .Title()
                .map(|s| s.to_string())
                .unwrap_or_default();
            if let Some((current, total)) =
                netease_timeline::timeline().or_else(|| netease_log::timeline(&title))
            {
                position = Some(current);
                duration = Some(total);
                used_fallback = true;
            }
        }
        Ok(Some(MediaState {
            title: properties
                .Title()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            artist: properties
                .Artist()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            playing: status == PlaybackStatus::Playing,
            position_seconds: position,
            duration_seconds: duration,
            can_seek: !used_fallback
                && session
                    .GetPlaybackInfo()
                    .and_then(|info| info.Controls())
                    .and_then(|controls| controls.IsPlaybackPositionEnabled())
                    .unwrap_or(false),
        }))
    }
    #[cfg(not(target_os = "windows"))]
    Ok(None)
}

#[tauri::command]
async fn seek_media(position_seconds: f64) -> Result<bool, String> {
    if !position_seconds.is_finite()
        || !(0.0..=i64::MAX as f64 / 10_000_000.0).contains(&position_seconds)
    {
        return Err("invalid media position".into());
    }
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let _apartment = MediaApartment::initialize()?;
            let session = current_media_session()?;
            let timeline = session.GetTimelineProperties().map_err(|e| e.to_string())?;
            let end = timeline.EndTime().map_err(|e| e.to_string())?.Duration;
            let ticks = (position_seconds * 10_000_000.0).round() as i64;
            if end <= 0 || ticks > end {
                return Err("media position outside timeline".into());
            }
            let operation = session
                .TryChangePlaybackPositionAsync(ticks)
                .map_err(|e| e.to_string())?;
            await_media_operation(operation)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    Err("media controls are only available on Windows".into())
}

#[tauri::command]
async fn get_media_artwork(title: String, artist: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || read_media_artwork(&title, &artist))
        .await
        .ok()
        .flatten()
}

fn read_media_artwork(title: &str, artist: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        read_system_artwork(title, artist).or_else(|| read_netease_artwork(title, artist))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (title, artist);
        None
    }
}

#[cfg(target_os = "windows")]
fn read_system_artwork(title: &str, artist: &str) -> Option<String> {
    let _apartment = MediaApartment::initialize().ok()?;
    use base64::Engine;
    use windows::Storage::Streams::DataReader;
    let session = current_media_session().ok()?;
    let properties = await_media_operation(session.TryGetMediaPropertiesAsync().ok()?).ok()?;
    if properties.Title().ok()? != title || properties.Artist().ok()? != artist {
        return None;
    }
    let stream = await_media_operation(properties.Thumbnail().ok()?.OpenReadAsync().ok()?).ok()?;
    let size = stream.Size().ok()?;
    if size == 0 || size > 2_000_000 {
        return None;
    }
    let raw_content_type = stream.ContentType().ok()?.to_string();
    let content_type = image_content_type(&raw_content_type)?;
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    let loaded = await_media_operation(reader.LoadAsync(size as u32).ok()?).ok()?;
    let mut bytes = vec![0; loaded as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    Some(format!(
        "data:{};base64,{}",
        content_type,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(target_os = "windows")]
fn read_netease_artwork(title: &str, artist: &str) -> Option<String> {
    use base64::Engine;
    use std::io::Read;
    use std::net::ToSocketAddrs;
    let state = netease_log::current()?;
    if state.title != title || state.artist != artist {
        return None;
    }
    let url = state.artwork_url?;
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(6))
        .redirects(0)
        .resolver(|host: &str| {
            let mut addresses: Vec<_> = host.to_socket_addrs()?.collect();
            addresses.sort_by_key(|address| address.is_ipv6());
            Ok(addresses)
        })
        .tls_connector(std::sync::Arc::new(native_tls::TlsConnector::new().ok()?))
        .build();
    let response = agent.get(&url).call().ok()?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(2_000_001)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 2_000_000 {
        return None;
    }
    let mime = if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        return None;
    };
    let current = netease_log::current()?;
    if current.title != title
        || current.artist != artist
        || current.artwork_url.as_deref() != Some(url.as_str())
    {
        return None;
    }
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(target_os = "windows")]
fn image_content_type(raw: &str) -> Option<&str> {
    let mime = raw.split([',', ';']).next()?.trim();
    matches!(mime, "image/jpeg" | "image/png" | "image/webp").then_some(mime)
}

#[cfg(all(test, target_os = "windows"))]
mod media_tests {
    use super::image_content_type;

    #[test]
    fn accepts_image_types_with_aliases_and_rejects_other_types() {
        assert_eq!(
            image_content_type("image/jpeg,image/jpe,image/jpg"),
            Some("image/jpeg")
        );
        assert_eq!(
            image_content_type("image/png; charset=binary"),
            Some("image/png")
        );
        assert_eq!(image_content_type("text/html"), None);
    }
}

#[cfg(all(test, target_os = "windows"))]
mod live_media_tests {
    #[test]
    #[ignore = "requires a playing Windows media session"]
    fn media_is_readable_from_background_worker() {
        let state = tauri::async_runtime::block_on(super::get_media_state())
            .expect("media query failed")
            .expect("no media session");
        assert!(!state.title.is_empty());
    }
    #[test]
    #[ignore = "requires NetEase playing and network access"]
    fn current_netease_cover_is_readable() {
        let state = super::netease_log::current().expect("NetEase playback");
        let cover =
            super::read_netease_artwork(&state.title, &state.artist).expect("NetEase artwork");
        assert!(cover.starts_with("data:image/"));
    }
}

#[tauri::command]
async fn control_media(action: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || control_media_blocking(action))
        .await
        .map_err(|_| "媒体控制失败".to_string())?
}

fn control_media_blocking(action: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if !matches!(action.as_str(), "toggle" | "next" | "previous") {
            return Err("不支持的媒体操作".into());
        }
        // Preferred path: ask the current session directly.
        let direct = (|| -> Result<bool, String> {
            let _apartment = MediaApartment::initialize()?;
            let session = current_media_session()?;
            let operation = match action.as_str() {
                "toggle" => session.TryTogglePlayPauseAsync(),
                "next" => session.TrySkipNextAsync(),
                _ => session.TrySkipPreviousAsync(),
            }
            .map_err(|_| "播放器拒绝了此操作".to_string())?;
            await_media_operation(operation)
        })();
        if matches!(direct, Ok(true)) {
            return Ok(true);
        }
        // Some players expose a session but reject every request (NetEase is
        // one); the system media keys reach the same session.
        send_media_key(&action)?;
        Ok(true)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = action;
        Err("media controls are only available on Windows".into())
    }
}

#[cfg(target_os = "windows")]
fn send_media_key(action: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE,
        VK_MEDIA_PREV_TRACK, keybd_event,
    };
    let key = match action {
        "toggle" => VK_MEDIA_PLAY_PAUSE,
        "next" => VK_MEDIA_NEXT_TRACK,
        _ => VK_MEDIA_PREV_TRACK,
    };
    unsafe {
        keybd_event(key as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(key as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn island_window_subclass(
    hwnd: windows_sys::Win32::Foundation::HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
    id: usize,
    _data: usize,
) -> isize {
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::{WM_NCACTIVATE, WM_NCDESTROY, WM_NCPAINT};
    match message {
        // The island has no native frame. Windows can otherwise paint one when
        // a region is present and activation changes.
        WM_NCPAINT => 0,
        // Preserve Tao's activation handling while suppressing native frame paint.
        WM_NCACTIVATE => unsafe { DefSubclassProc(hwnd, message, wparam, -1) },
        WM_NCDESTROY => {
            unsafe {
                RemoveWindowSubclass(hwnd, Some(island_window_subclass), id);
            }
            unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
        }
        _ => unsafe { DefSubclassProc(hwnd, message, wparam, lparam) },
    }
}

/// Opens the settings window and makes sure it is actually in front:
/// restored if it was minimised, focused, and briefly pinned on top so the
/// foreground window cannot bury it.
#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("settings window unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    set_settings_memory_target(&window, false);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.set_always_on_top(false);
        }
    });
    Ok(())
}

/// Whether this process was started by the login autostart entry.
#[tauri::command]
fn is_autostart_launch() -> bool {
    AUTOSTART_LAUNCH.load(std::sync::atomic::Ordering::SeqCst)
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        manager.enable()
    } else {
        manager.disable()
    }
    .map_err(|e| e.to_string())?;
    refresh_tray_menu(&app);
    let _ = app.emit_to("main", "autostart-changed", enabled);
    Ok(())
}

/// Called by the settings page once it has rendered its first real content.
/// The window is created hidden so startup resizes happen off screen; this
/// reveals it at its final size, so the user never sees it jump.
#[tauri::command]
fn show_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("settings window unavailable")?;
    SETTINGS_USER_HIDDEN.store(false, std::sync::atomic::Ordering::SeqCst);
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    set_settings_memory_target(&window, false);
    Ok(())
}

/// Boot-only reveal: if the user already closed the window while the page
/// was loading, respect that close and stay hidden until they ask for it.
#[tauri::command]
fn reveal_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if SETTINGS_USER_HIDDEN.load(std::sync::atomic::Ordering::SeqCst) {
        return Ok(());
    }
    show_settings_window(app)
}

/// Moves the island to the top of the topmost band. Windows lets other
/// topmost windows (taskbar, another app's "always on top") sit above it, and
/// a window that lost the flag is not recovered by tauri's flag setter.
#[cfg(target_os = "windows")]
fn raise_island(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetWindowPos,
    };
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let raised = unsafe {
        SetWindowPos(
            hwnd.0,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    };
    if raised == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

fn autostart_enabled<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

fn refresh_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Ok(menu) = build_tray_menu(app) else {
        return;
    };
    if let Some(tray) = app.tray_by_id("app-tray") {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Tray menu with a live output-device submenu (checkmark = current default).
fn build_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show = MenuItem::with_id(app, "show", "显示设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "开机自启动",
        true,
        autostart_enabled(app),
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let devices = Submenu::with_id(app, "audio", "输出设备", true)?;
    match audio::list() {
        Ok(list)
            if list
                .iter()
                .any(|d| d.direction == audio::AudioDirection::Output) =>
        {
            for device in list
                .into_iter()
                .filter(|d| d.direction == audio::AudioDirection::Output)
            {
                let item = CheckMenuItem::with_id(
                    app,
                    format!("audio:{}", device.id),
                    device.name,
                    true,
                    device.is_default,
                    None::<&str>,
                )?;
                devices.append(&item)?;
            }
        }
        _ => {
            let empty =
                MenuItem::with_id(app, "audio:none", "未找到输出设备", false, None::<&str>)?;
            devices.append(&empty)?;
        }
    }
    Menu::with_items(app, &[&show, &devices, &separator, &autostart, &quit])
}

/// Rebuilds the tray menu when the device list or default device changes.
fn spawn_tray_audio_refresh<R: tauri::Runtime + 'static>(app: tauri::AppHandle<R>) {
    std::thread::spawn(move || {
        let mut signature: Vec<(String, String, bool)> = Vec::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            let Ok(devices) = audio::list() else {
                continue;
            };
            let next: Vec<(String, String, bool)> = devices
                .into_iter()
                .filter(|device| device.direction == audio::AudioDirection::Output)
                .map(|device| (device.id, device.name, device.is_default))
                .collect();
            if next == signature {
                continue;
            }
            signature = next;
            let Ok(menu) = build_tray_menu(&app) else {
                continue;
            };
            if let Some(tray) = app.tray_by_id("app-tray") {
                let _ = tray.set_menu(Some(menu));
            }
        }
    });
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn get_audio_devices() -> Result<Vec<audio::AudioDevice>, String> {
    tauri::async_runtime::spawn_blocking(audio::list)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn set_audio_device(window: tauri::WebviewWindow, device_id: String) -> Result<(), String> {
    if !matches!(window.label(), "main" | "island") {
        return Err("当前窗口不能切换音频设备".into());
    }
    tauri::async_runtime::spawn_blocking(move || audio::set_default(&device_id))
        .await
        .map_err(|error| error.to_string())?
}

/// Island zoom tier for a monitor's CSS-pixel width. The island window is
/// laid out for a fixed 440×320 CSS viewport, which renders too small on
/// high-resolution monitors; the same viewport is rendered through a native
/// webview zoom while the window grows proportionally. Kept in sync with the
/// tier tables in src/services/display.ts.
fn island_visual_scale(monitor_css_width: f64) -> f64 {
    if monitor_css_width >= 3000.0 {
        1.4
    } else if monitor_css_width >= 2400.0 {
        1.3
    } else if monitor_css_width >= 2000.0 {
        1.2
    } else if monitor_css_width >= 1500.0 {
        1.1
    } else {
        1.0
    }
}

/// Webview zoom currently applied to the island. The native collapsed
/// hit-region must cover the rendered capsule, which is scaled by this factor.
static ISLAND_SCALE: std::sync::Mutex<f64> = std::sync::Mutex::new(1.0);

/// Resolution tier of the monitor the island started on; the user's island
/// size setting applies on top of it.
static ISLAND_AUTO_SCALE: std::sync::Mutex<f64> = std::sync::Mutex::new(1.0);

/// Whether the island panel is currently expanded; the collapsed native
/// hit-region is only refreshed while it is not.
static ISLAND_EXPANDED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Whether the capsule should step aside while a fullscreen app owns the
/// screen. Flipped by the settings window; the watcher thread reads it.
static FULLSCREEN_AVOID: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);
/// Live detection result, kept so visibility only flips on real changes.
static FULLSCREEN_ACTIVE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// Whether this watcher — and not a user action — is holding the island
/// window hidden, so a disable always restores it.
static ISLAND_HIDDEN_BY_FS: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// True when Windows launched us from the login autostart entry.
static AUTOSTART_LAUNCH: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The user closed the settings window while the page was still loading; the
/// boot reveal must respect that instead of popping the window back open.
static SETTINGS_USER_HIDDEN: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Physical rectangle currently used as the island hit region. Nothing here
/// until the frontend reports the panel bounds for the first time.
#[cfg(target_os = "windows")]
static ISLAND_HIT_RECT: std::sync::Mutex<Option<(i32, i32, i32, i32)>> =
    std::sync::Mutex::new(None);

fn locked_scale(mutex: &std::sync::Mutex<f64>) -> f64 {
    *mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn island_scale() -> f64 {
    locked_scale(&ISLAND_SCALE)
}

fn island_auto_scale() -> f64 {
    locked_scale(&ISLAND_AUTO_SCALE)
}

/// Sizes the island window and its webview zoom for a combined scale factor
/// and records it for the native hit-region maths. The layout viewport stays
/// 440×320 CSS px regardless of the scale; the extra width over the 340px
/// panel is where the CSS drop shadow fades out instead of being clipped
/// into a hard rectangular frame by the window edge.
fn apply_island_window_scale(window: &tauri::WebviewWindow, scale: f64) -> Result<(), String> {
    let dpr = window.scale_factor().map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(
            (440.0 * dpr * scale).round() as u32,
            (320.0 * dpr * scale).round() as u32,
        ))
        .map_err(|e| e.to_string())?;
    window.set_zoom(scale).map_err(|e| e.to_string())?;
    *ISLAND_SCALE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = scale;
    Ok(())
}

/// The island is a chrome-less surface: the WebView2 menu (reload, save as,
/// inspect) has no place there.
#[cfg(target_os = "windows")]
fn disable_default_context_menu(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .with_webview(|webview| unsafe {
            let controller = webview.controller();
            let Ok(core) = controller.CoreWebView2() else {
                return;
            };
            let Ok(settings) = core.Settings() else {
                return;
            };
            let _ = settings.SetAreDefaultContextMenusEnabled(false);
        })
        .map_err(|error| error.to_string())
}

/// Hiding the settings window keeps its renderer alive; dropping WebView2 to
/// the low-memory target lets Chromium release the caches that a hidden page
/// no longer needs, and showing it again restores normal behaviour.
#[cfg(target_os = "windows")]
fn set_settings_memory_target(window: &tauri::WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        ICoreWebView2_19,
    };
    use windows_core::Interface;
    let level = if low {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
    } else {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
    };
    let _ = window.with_webview(move |webview| unsafe {
        let controller = webview.controller();
        let Ok(core) = controller.CoreWebView2() else {
            return;
        };
        if let Ok(core) = core.cast::<ICoreWebView2_19>() {
            let _ = core.SetMemoryUsageTargetLevel(level);
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn set_settings_memory_target(_window: &tauri::WebviewWindow, _low: bool) {}

#[cfg(target_os = "windows")]
fn remove_native_caption(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::SetWindowSubclass;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GWL_STYLE, GetWindowLongPtrW, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_NOZORDER, SetWindowLongPtrW, SetWindowPos, WS_CAPTION,
    };
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    // setup runs on the window thread, as required by SetWindowSubclass.
    let subclassed = unsafe { SetWindowSubclass(hwnd.0, Some(island_window_subclass), 1, 0) };
    if subclassed == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // Tao keeps caption style bits for its custom non-client handling. A window
    // region can make Windows draw that caption, so remove them before showing.
    let style = unsafe { GetWindowLongPtrW(hwnd.0, GWL_STYLE) };
    if style == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let previous = unsafe { SetWindowLongPtrW(hwnd.0, GWL_STYLE, style & !(WS_CAPTION as isize)) };
    if previous == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let updated = unsafe {
        SetWindowPos(
            hwnd.0,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
        )
    };
    if updated == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

/// True when the point still lands on one of the connected monitors.
fn is_visible_on_any_monitor(app: &tauri::AppHandle, x: i32, y: i32) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        return false;
    };
    monitors.iter().any(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        x >= origin.x
            && y >= origin.y
            && x < origin.x + size.width as i32
            && y < origin.y + size.height as i32
    })
}

/// The window moves in a burst while dragging; only the last position is saved.
static POSITION_SAVER_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

fn schedule_position_save(app: &tauri::AppHandle) {
    use std::sync::atomic::Ordering;
    if POSITION_SAVER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        POSITION_SAVER_RUNNING.store(false, Ordering::SeqCst);
        let Some(window) = handle.get_webview_window("island") else {
            return;
        };
        let Ok(position) = window.outer_position() else {
            return;
        };
        let storage = handle.state::<storage::Storage>();
        let _ = storage::save_island_position(storage.inner(), position.x, position.y);
    });
}

/// Paints the native caption to the same colour as the settings surface.
#[cfg(target_os = "windows")]
fn apply_caption_colors(window: &tauri::WebviewWindow, dark: bool) {
    use windows_sys::Win32::{
        Foundation::HWND,
        Graphics::Dwm::{DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR, DwmSetWindowAttribute},
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let handle = hwnd.0 as HWND;
    // COLORREF is 0x00BBGGRR.
    let (background, text) = if dark {
        (0x0014_1414u32, 0x00F0_ECECu32)
    } else {
        (0x00FF_FFFFu32, 0x0022_1C1Bu32)
    };
    let size = std::mem::size_of::<u32>() as u32;
    unsafe {
        DwmSetWindowAttribute(
            handle,
            DWMWA_CAPTION_COLOR as u32,
            &background as *const u32 as *const _,
            size,
        );
        DwmSetWindowAttribute(
            handle,
            DWMWA_TEXT_COLOR as u32,
            &text as *const u32 as *const _,
            size,
        );
    }
}

/// Windows' own light/dark preference for apps, so "follow system" is real
/// instead of trusting WebView2's media query.
#[cfg(windows)]
fn apps_use_light_theme() -> Option<bool> {
    use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
    let separator = char::from(92u8).to_string();
    let mut subkey: Vec<u16> = [
        "Software",
        "Microsoft",
        "Windows",
        "CurrentVersion",
        "Themes",
        "Personalize",
    ]
    .join(&separator)
    .encode_utf16()
    .collect();
    subkey.push(0);
    let mut value: Vec<u16> = "AppsUseLightTheme".encode_utf16().collect();
    value.push(0);
    let value: Vec<u16> = "AppsUseLightTheme\0".encode_utf16().collect();
    let mut data: u32 = 1;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            &mut data as *mut u32 as *mut core::ffi::c_void,
            &mut size,
        )
    };
    if status != 0 {
        return None;
    }
    Some(data != 0)
}

#[cfg(not(windows))]
fn apps_use_light_theme() -> Option<bool> {
    None
}

#[cfg(all(test, windows))]
mod theme_tests {
    use super::apps_use_light_theme;

    #[test]
    fn reads_the_windows_app_theme() {
        // Windows creates this value for every user profile.
        assert!(apps_use_light_theme().is_some());
    }
}

/// Resolved system theme: "light" unless Windows reports dark.
#[tauri::command]
fn get_system_theme() -> String {
    match apps_use_light_theme() {
        Some(false) => "dark",
        _ => "light",
    }
    .to_string()
}

/// Follows the settings window chrome to the chosen light/dark theme.
#[tauri::command]
fn set_window_theme(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    if window.label() != "main" {
        return Err("当前窗口不支持该操作".into());
    }
    let requested = theme.as_str();
    let tauri_theme = match requested {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    window.set_theme(tauri_theme).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let dark = match requested {
            "dark" => true,
            "light" => false,
            _ => matches!(window.theme(), Ok(tauri::Theme::Dark)),
        };
        apply_caption_colors(&window, dark);
    }
    Ok(())
}

/// Puts the island back above the primary monitor's centre (settings window only).
#[tauri::command]
fn reset_island_position(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    storage: tauri::State<'_, storage::Storage>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("当前窗口不支持该操作".into());
    }
    storage::clear_island_position(storage.inner())?;
    let island = app
        .get_webview_window("island")
        .ok_or_else(|| "灵动岛未就绪".to_string())?;
    if let Some(monitor) = island.primary_monitor().map_err(|e| e.to_string())? {
        let size = island.outer_size().map_err(|e| e.to_string())?;
        let screen = monitor.size();
        let origin = monitor.position();
        let x = origin.x + (screen.width as i32 - size.width as i32) / 2;
        let y = origin.y + (8.0 * monitor.scale_factor()).round() as i32;
        island
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Runtime layout mode; the saved preference is owned by appearance settings.
static TASKBAR_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "windows")]
fn taskbar_bounds(window: &tauri::WebviewWindow) -> Result<(i32, i32, i32, i32), String> {
    use windows_sys::Win32::UI::Shell::{
        ABE_BOTTOM, ABM_GETSTATE, ABM_GETTASKBARPOS, ABS_AUTOHIDE, APPBARDATA, SHAppBarMessage,
    };
    let mut bar = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        ..Default::default()
    };
    if unsafe { SHAppBarMessage(ABM_GETTASKBARPOS, &mut bar) } == 0 || bar.uEdge != ABE_BOTTOM {
        return Err("仅支持主屏幕底部任务栏".into());
    }
    if unsafe { SHAppBarMessage(ABM_GETSTATE, &mut bar) } & ABS_AUTOHIDE as usize != 0 {
        return Err("任务栏自动隐藏时无法使用此模式".into());
    }
    let rect = bar.rc;
    let _ = window;
    if rect.bottom <= rect.top {
        return Err("无法读取任务栏区域".into());
    }
    Ok((rect.left, rect.top, rect.right, rect.bottom))
}

#[tauri::command]
fn check_taskbar_mode(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let island = app.get_webview_window("island").ok_or("灵动岛未就绪")?;
        taskbar_bounds(&island).map(|_| ())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("仅支持 Windows 底部任务栏".into())
    }
}

/// Places the bottom-anchored 38px capsule at the taskbar's centre.
#[cfg(any(target_os = "windows", test))]
fn taskbar_window_y(top: i32, bottom: i32, window_height: u32, scale: f64) -> i32 {
    let capsule_bottom = ((top as f64 + bottom as f64) / 2.0 + 19.0 * scale).min(bottom as f64);
    (capsule_bottom + 13.0 * scale - window_height as f64).round() as i32
}

#[tauri::command]
fn set_taskbar_mode(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if window.label() != "island" {
        return Err("当前窗口不支持该操作".into());
    }
    #[cfg(target_os = "windows")]
    if enabled {
        let (left, top, _right, bottom) = taskbar_bounds(&window)?;
        let scale = window.scale_factor().map_err(|e| e.to_string())? * island_scale();
        let size = window.outer_size().map_err(|e| e.to_string())?;
        // The bottom-aligned capsule has 13 CSS px margin and is 38px tall.
        let y = taskbar_window_y(top, bottom, size.height, scale);
        let current = window.outer_position().map_err(|e| e.to_string())?;
        // A saved taskbar position already on this row keeps its horizontal drag offset.
        let x = if (current.y - y).abs() <= 3 {
            current.x
        } else {
            left
        };
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        raise_island(&window)?;
        TASKBAR_MODE.store(true, Ordering::SeqCst);
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    if enabled {
        return Err("仅支持 Windows 底部任务栏".into());
    }
    if TASKBAR_MODE.swap(false, Ordering::SeqCst)
        && let Some(monitor) = window.primary_monitor().map_err(|e| e.to_string())?
    {
        let size = window.outer_size().map_err(|e| e.to_string())?;
        let x = monitor.position().x + (monitor.size().width as i32 - size.width as i32) / 2;
        let y = monitor.position().y + (8.0 * monitor.scale_factor()).round() as i32;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Drags the island window while the pointer is held down.
#[tauri::command]
fn start_island_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "island" {
        return Err("当前窗口不支持拖动".into());
    }
    window.start_dragging().map_err(|e| e.to_string())
}

/// Keeps the native hit region on the rendered panel. The transparent parts
/// of the island window are much larger than the panel, and without a region
/// they swallow clicks meant for the apps below (especially while expanded).
/// While a layout transition is running the region only grows, so the moving
/// panel is never clipped; the settled bounds then tighten it again.
#[tauri::command]
fn set_island_panel_bounds(
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    settled: bool,
) -> Result<(), String> {
    if window.label() != "island"
        || !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
    {
        return Err("invalid panel bounds".into());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())? * island_scale();
        // The arrival pop scales the panel up by 6%; keep a margin so it is
        // not clipped by the region during that beat. The margin also carries
        // the CSS drop shadow (~16–30px of fade); clipping it would paint a
        // hard rectangular frame around the rounded panel.
        let pad = 24.0 * scale;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        let left = (x * scale - pad).floor().clamp(0.0, size.width as f64) as i32;
        let top = (y * scale - pad).floor().clamp(0.0, size.height as f64) as i32;
        let right = ((x + width) * scale + pad)
            .ceil()
            .clamp(0.0, size.width as f64) as i32;
        let bottom = ((y + height) * scale + pad)
            .ceil()
            .clamp(0.0, size.height as f64) as i32;
        if right <= left || bottom <= top {
            return Ok(());
        }
        let mut current = ISLAND_HIT_RECT
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let next = if settled {
            (left, top, right, bottom)
        } else if let Some((old_left, old_top, old_right, old_bottom)) = *current {
            // A shrinking panel still fits the old region; leave it alone so
            // the transition never clips the content.
            if left >= old_left && top >= old_top && right <= old_right && bottom <= old_bottom {
                return Ok(());
            }
            (
                old_left.min(left),
                old_top.min(top),
                old_right.max(right),
                old_bottom.max(bottom),
            )
        } else {
            (left, top, right, bottom)
        };
        let region = unsafe { CreateRectRgn(next.0, next.1, next.2, next.3) };
        if region.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let result = unsafe { SetWindowRgn(hwnd.0, region, 1) };
        if result == 0 {
            unsafe {
                DeleteObject(region);
            }
            return Err(std::io::Error::last_os_error().to_string());
        }
        *current = Some(next);
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (x, y, width, height, settled);
        Ok(())
    }
}

/// While a reminder panel is expanded pass-through, the webview receives no
/// mouse messages at all, so "the user moved onto the panel" has to be
/// observed natively: poll the cursor and restore interactivity once it
/// dwells on the panel, which makes reminder actions (log water, copy a
/// code) clickable again. A quick sweep across the panel keeps passing
/// through so the app underneath never loses a click.
#[cfg(target_os = "windows")]
fn spawn_passive_hover_watch(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut dwell = 0u32;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(100));
            if !ISLAND_EXPANDED.load(std::sync::atomic::Ordering::SeqCst) {
                // Collapsed, or re-expanded interactively: the command paths
                // own the pass-through flag again.
                return;
            }
            let rect = *ISLAND_HIT_RECT
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let Some((left, top, right, bottom)) = rect else {
                dwell = 0;
                continue;
            };
            let mut point = POINT::default();
            if unsafe { GetCursorPos(&mut point) } == 0 {
                continue;
            }
            let Ok(origin) = window.outer_position() else {
                continue;
            };
            let x = point.x - origin.x;
            let y = point.y - origin.y;
            if x >= left && x <= right && y >= top && y <= bottom {
                dwell += 1;
            } else {
                dwell = 0;
                continue;
            }
            // Roughly 400ms of deliberate hovering; sweeps never reach this.
            if dwell >= 4 {
                let _ = window.set_ignore_cursor_events(false);
                return;
            }
        }
    });
}

/// Whether the foreground window covers the monitor the island lives on —
/// the classic fullscreen-app signature. Desktop shells are excluded: they
/// cover the screen at all times but are never something to hide from.
#[cfg(target_os = "windows")]
fn foreground_covers_island_monitor(window: &tauri::WebviewWindow) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowRect,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }
        let mut name = [0u16; 64];
        let len = GetClassNameW(hwnd, name.as_mut_ptr(), name.len() as i32);
        if matches!(
            String::from_utf16_lossy(&name[..len as usize]).as_str(),
            "Progman" | "WorkerW"
        ) {
            return false;
        }
        let mut rect = windows_sys::Win32::Foundation::RECT::default();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return false;
        }
        let Ok(Some(monitor)) = window.current_monitor() else {
            return false;
        };
        let (mx, my) = (monitor.position().x, monitor.position().y);
        let (mw, mh) = (monitor.size().width as i32, monitor.size().height as i32);
        rect.left <= mx && rect.top <= my && rect.right >= mx + mw && rect.bottom >= my + mh
    }
}

/// Applies the wanted visibility for the current fullscreen state and tells
/// the island webview, so reminder auto-expansions can hold off.
#[cfg(target_os = "windows")]
fn apply_fullscreen_visibility(
    window: &tauri::WebviewWindow,
    hidden_by_fs: bool,
    fullscreen: bool,
) {
    ISLAND_HIDDEN_BY_FS.store(hidden_by_fs, std::sync::atomic::Ordering::SeqCst);
    // Hide through the layered alpha instead of ShowWindow: tearing the
    // window down with hide()/show() makes WebView2 rebuild its transparent
    // composition, which after fullscreen round-trips froze the window into
    // its raw decorated form. An alpha-0 layered window keeps the same
    // composition; the emptied hit region keeps it from swallowing clicks.
    let target = window.clone();
    let _ = window.run_on_main_thread(move || {
        set_island_alpha_hidden(&target, hidden_by_fs);
    });
    let _ = tauri::Emitter::emit_to(
        window.app_handle(),
        "island",
        "fullscreen-changed",
        fullscreen,
    );
}

/// Fades the island in or out of sight without ShowWindow. While hidden the
/// hit region is emptied so the invisible surface cannot intercept clicks
/// meant for the fullscreen app; unhide restores the last reported panel
/// region (an empty region matches the startup state until the next report).
#[cfg(target_os = "windows")]
fn set_island_alpha_hidden(window: &tauri::WebviewWindow, hidden: bool) {
    use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, LWA_ALPHA, SetLayeredWindowAttributes, SetWindowLongPtrW,
        WS_EX_LAYERED,
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd.0, GWL_EXSTYLE) as u32;
        if ex_style & WS_EX_LAYERED == 0 {
            SetWindowLongPtrW(hwnd.0, GWL_EXSTYLE, (ex_style | WS_EX_LAYERED) as isize);
        }
        // A layered window without alpha stops rendering entirely; set the
        // alpha together with the style, every time.
        if SetLayeredWindowAttributes(hwnd.0, 0, if hidden { 0 } else { 255 }, LWA_ALPHA) == 0 {
            return;
        }
        let region = if hidden {
            CreateRectRgn(0, 0, 0, 0)
        } else {
            match *ISLAND_HIT_RECT
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
            {
                Some((left, top, right, bottom)) => CreateRectRgn(left, top, right, bottom),
                None => std::ptr::null_mut(),
            }
        };
        if region.is_null() && !hidden {
            // No stored region: clearing the region matches the startup
            // state, and the next bounds report tightens it again.
            SetWindowRgn(hwnd.0, std::ptr::null_mut(), 1);
        } else if SetWindowRgn(hwnd.0, region, 1) == 0 && !region.is_null() {
            // SetWindowRgn failed; the region still belongs to us.
            DeleteObject(region);
        }
    }
}

/// Explorer can promote the taskbar above other topmost windows when another
/// application activates. Only repair ordering when the primary taskbar has
/// actually moved above the island; never activate or focus either window.
#[cfg(target_os = "windows")]
fn taskbar_covers_island(window: &tauri::WebviewWindow) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, GW_HWNDPREV, GetWindow, IsWindowVisible,
    };
    let Ok(island) = window.hwnd() else {
        return false;
    };
    let class: Vec<u16> = "Shell_TrayWnd\0".encode_utf16().collect();
    unsafe {
        let taskbar = FindWindowW(class.as_ptr(), std::ptr::null());
        if taskbar.is_null() || IsWindowVisible(taskbar) == 0 {
            return false;
        }
        let mut candidate = GetWindow(island.0, GW_HWNDPREV);
        for _ in 0..4096 {
            if candidate.is_null() {
                return false;
            }
            if candidate == taskbar {
                return true;
            }
            candidate = GetWindow(candidate, GW_HWNDPREV);
        }
    }
    false
}

/// Watches the foreground window and hides the island while a fullscreen app
/// owns the screen. Polls cheaply; visibility only flips on real changes so
/// the user's own show/hide actions are never fought over.
#[cfg(target_os = "windows")]
fn spawn_fullscreen_watch(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let Some(window) = app.get_webview_window("island") else {
                continue;
            };
            let fullscreen = foreground_covers_island_monitor(&window);
            let avoid = FULLSCREEN_AVOID.load(std::sync::atomic::Ordering::SeqCst);
            if TASKBAR_MODE.load(std::sync::atomic::Ordering::SeqCst)
                && !(fullscreen && avoid)
                && !ISLAND_HIDDEN_BY_FS.load(std::sync::atomic::Ordering::SeqCst)
                && taskbar_covers_island(&window)
            {
                let _ = raise_island(&window);
            }
            if fullscreen == FULLSCREEN_ACTIVE.load(std::sync::atomic::Ordering::SeqCst) {
                continue;
            }
            FULLSCREEN_ACTIVE.store(fullscreen, std::sync::atomic::Ordering::SeqCst);
            if avoid {
                apply_fullscreen_visibility(&window, fullscreen, fullscreen);
            } else if ISLAND_HIDDEN_BY_FS.load(std::sync::atomic::Ordering::SeqCst) {
                // The switch was turned off mid-fullscreen: bring the island back.
                apply_fullscreen_visibility(&window, false, false);
            }
        }
    });
}

/// Mirrors the fullscreen-avoidance switch so the watcher honors it at once.
#[tauri::command]
fn set_fullscreen_avoid(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    if window.label() != "island" {
        return Err("invalid window".into());
    }
    FULLSCREEN_AVOID.store(enabled, std::sync::atomic::Ordering::SeqCst);
    let hidden = ISLAND_HIDDEN_BY_FS.load(std::sync::atomic::Ordering::SeqCst);
    if !enabled && hidden {
        apply_fullscreen_visibility(&window, false, false);
    }
    Ok(())
}

#[tauri::command]
fn set_island_expanded(
    window: tauri::WebviewWindow,
    expanded: bool,
    passive: bool,
) -> Result<(), String> {
    if window.label() != "island" {
        return Err("invalid window".into());
    }
    ISLAND_EXPANDED.store(expanded, std::sync::atomic::Ordering::SeqCst);
    // A reminder-triggered expansion is only a hint: the panel stays visible
    // but clicks pass through, so the pointer keeps working in whatever is
    // underneath and no focus or activation ever moves. Any collapse or
    // user-initiated expansion restores normal hit testing.
    window
        .set_ignore_cursor_events(passive && expanded)
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    if passive && expanded {
        // The pass-through style includes WS_EX_LAYERED, and a layered window
        // stops rendering until its alpha attributes are set; keep the hint
        // visible at full opacity.
        use windows_sys::Win32::UI::WindowsAndMessaging::{LWA_ALPHA, SetLayeredWindowAttributes};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            if SetLayeredWindowAttributes(hwnd.0, 0, 255, LWA_ALPHA) == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
        }
        spawn_passive_hover_watch(window.clone());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        // Once the page has reported the panel bounds it owns the region;
        // changing it here would briefly clip the panel mid-transition.
        let reported = ISLAND_HIT_RECT
            .lock()
            .map(|bounds| bounds.is_some())
            .unwrap_or(false);
        if !reported {
            // The rendered capsule is scaled by the monitor DPI and the
            // island webview zoom, so the region must use the same factor.
            let scale = window.scale_factor().map_err(|e| e.to_string())? * island_scale();
            let size = window.outer_size().map_err(|e| e.to_string())?;
            let inset = (10.0 * scale).round() as i32;
            let height = (64.0 * scale).round() as i32;
            // Keep WebView dimensions fixed; the region also excludes the
            // empty transparent area from hit testing before the first
            // bounds report arrives.
            let region = if expanded {
                std::ptr::null_mut()
            } else {
                let region = unsafe { CreateRectRgn(inset, 0, size.width as i32 - inset, height) };
                if region.is_null() {
                    return Err(std::io::Error::last_os_error().to_string());
                }
                region
            };
            let result = unsafe { SetWindowRgn(hwnd.0, region, 1) };
            if result == 0 {
                if !region.is_null() {
                    unsafe {
                        DeleteObject(region);
                    }
                }
                return Err(std::io::Error::last_os_error().to_string());
            }
        }
        // Reopening the panel must also put it back above every other window.
        raise_island(&window)?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let old_position = window.outer_position().map_err(|e| e.to_string())?;
        let old_size = window.outer_size().map_err(|e| e.to_string())?;
        let zoom = island_scale();
        let (width, height) = if expanded {
            (440.0, 320.0)
        } else {
            (380.0, 64.0)
        };
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let x =
            old_position.x + (old_size.width as i32 - (width * zoom * scale).round() as i32) / 2;
        window
            .set_size(LogicalSize::new(width * zoom, height * zoom))
            .map_err(|e| e.to_string())?;
        window.set_zoom(zoom).map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(x, old_position.y))
            .map_err(|e| e.to_string())
    }
}

/// Applies the island size multiplier chosen in the appearance settings on
/// top of the startup monitor's resolution tier. The window keeps its
/// top-centre anchor so the capsule stays visually in place, and the
/// collapsed hit-region is recomputed for the new size.
#[tauri::command]
fn apply_island_scale(window: tauri::WebviewWindow, scale: f64) -> Result<(), String> {
    if window.label() != "island" {
        return Err("当前窗口不支持该操作".into());
    }
    // Mirrors the 0.8–1.2 range validated by both appearance parsers.
    let user = scale.clamp(0.8, 1.2);
    let combined = island_auto_scale() * user;
    let old_position = window.outer_position().map_err(|e| e.to_string())?;
    let old_size = window.outer_size().map_err(|e| e.to_string())?;
    let old_scale = island_scale();
    let dpi = window.scale_factor().map_err(|e| e.to_string())?;
    apply_island_window_scale(&window, combined)?;
    let new_size = window.outer_size().map_err(|e| e.to_string())?;
    let x = old_position.x + (old_size.width as i32 - new_size.width as i32) / 2;
    let y = if TASKBAR_MODE.load(std::sync::atomic::Ordering::SeqCst) {
        old_position.y + old_size.height as i32 - new_size.height as i32
            + (32.0 * dpi * (combined - old_scale)).round() as i32
    } else {
        old_position.y
    };
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    if !ISLAND_EXPANDED.load(std::sync::atomic::Ordering::SeqCst) {
        set_island_expanded(window, false, false)?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let autostart_launch = std::env::args().any(|arg| arg == "--autostart");
    AUTOSTART_LAUNCH.store(autostart_launch, std::sync::atomic::Ordering::SeqCst);
    let builder = tauri::Builder::default().plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--autostart"]),
    ));
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            set_settings_memory_target(&window, false);
        }
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_settings,
            show_settings_window,
            reveal_settings_window,
            quit_app,
            set_island_expanded,
            set_island_panel_bounds,
            set_fullscreen_avoid,
            hotkeys::apply_hotkeys,
            notifications::get_notification_access,
            notifications::set_notification_forwarding,
            wechat::set_wechat_notifications,
            notifications::open_notification_settings,
            is_autostart_launch,
            get_autostart,
            set_autostart,
            apply_island_scale,
            start_island_drag,
            check_taskbar_mode,
            set_taskbar_mode,
            reset_island_position,
            set_window_theme,
            get_system_theme,
            get_audio_devices,
            set_audio_device,
            get_media_state,
            get_media_artwork,
            control_media,
            seek_media,
            lyrics::get_lyrics,
            ai_quota::list_ai_accounts,
            ai_quota::add_ai_account,
            ai_quota::remove_ai_account,
            ai_quota::pin_ai_account,
            ai_quota::query_ai_quota,
            system_status::get_system_status,
            system_status::get_device_status,
            storage::load_appearance,
            storage::save_appearance,
            storage::load_pomodoro,
            storage::save_pomodoro,
            storage::load_pomodoro_progress,
            storage::save_pomodoro_progress,
            storage::get_daily_stats,
            storage::add_water,
            storage::reset_water,
            storage::record_pomodoro,
            storage::load_water,
            storage::save_water,
            storage::load_sedentary,
            storage::save_sedentary,
            storage::load_sedentary_progress,
            storage::save_sedentary_progress,
            storage::record_sedentary,
            storage::reset_sedentary,
            storage::load_countdowns,
            storage::save_countdowns,
            storage::load_timer,
            storage::save_timer,
            storage::get_data_directory,
            storage::set_data_directory,
            storage::use_existing_data_directory,
            mail::list_mail_accounts,
            mail::get_mail_monitor_status,
            mail::add_mail_account,
            mail::remove_mail_account,
            mail::poll_mail,
            mail::copy_mail_code
        ])
        .setup(|app| {
            let app_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(app_icon.clone())?;
            }
            app.manage(storage::initialize(app.handle()).map_err(std::io::Error::other)?);
            app.manage(mail::MailMonitor::default());
            // Fullscreen avoidance: hide the capsule while a fullscreen app
            // owns the screen (guarded by the settings switch).
            #[cfg(target_os = "windows")]
            if app.get_webview_window("island").is_some() {
                spawn_fullscreen_watch(app.handle().clone());
            }
            // Scale the settings window with the monitor so every page fits
            // without a scrollbar on common desktop resolutions.
            if let Some(window) = app.get_webview_window("main")
                && let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?)
            {
                let scale = monitor.scale_factor();
                let size = monitor.size();
                // Compact defaults: content tops out at 1280px plus sidebar,
                // so anything past ~1360 logical px just centers it anyway.
                // Large displays also get larger type (large-display.css),
                // which the height factor leaves room for.
                let width = (size.width as f64 / scale * 0.62).clamp(960.0, 1360.0);
                let height = (size.height as f64 / scale * 0.75).clamp(640.0, 960.0);
                window.set_size(tauri::LogicalSize::new(width, height))?;
                window.center()?;
            }
            // The settings window is created hidden and revealed by the page
            // A login launch stays in the island: the settings window must
            // not pop up, and the hidden renderer is dropped to low memory.
            if AUTOSTART_LAUNCH.load(std::sync::atomic::Ordering::SeqCst) {
                if app.get_webview_window("main").is_some() {
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(1200));
                        if let Some(window) = handle.get_webview_window("main")
                            && !window.is_visible().unwrap_or(false)
                        {
                            set_settings_memory_target(&window, true);
                        }
                    });
                }
            } else if let Some(window) = app.get_webview_window("main") {
                // If the frontend never comes up (broken dev server, failed
                // bundle), fall back to showing it so the app is not
                // invisible on a normal launch.
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                });
            }
            if let Some(window) = app.get_webview_window("island") {
                let storage = app.state::<storage::Storage>();
                // Scale the island for the monitor it will sit on before the
                // position is restored, so saved coordinates match the final
                // window size. The layout viewport stays 440×320 CSS px.
                let monitor = window.current_monitor()?.or(window.primary_monitor()?);
                let auto = monitor
                    .as_ref()
                    .map(|m| island_visual_scale(m.size().width as f64 / m.scale_factor()))
                    .unwrap_or(1.0);
                *ISLAND_AUTO_SCALE
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner()) = auto;
                let user = storage::load_island_user_scale(storage.inner());
                apply_island_window_scale(&window, auto * user)?;
                let saved = storage::load_island_position(storage.inner());
                let restored = match saved {
                    Some((x, y)) if is_visible_on_any_monitor(app.handle(), x, y) => {
                        window.set_position(PhysicalPosition::new(x, y))?;
                        true
                    }
                    _ => false,
                };
                if !restored && let Some(monitor) = window.primary_monitor()? {
                    let size = window.outer_size()?;
                    let screen = monitor.size();
                    let origin = monitor.position();
                    let x = origin.x + (screen.width as i32 - size.width as i32) / 2;
                    let y = origin.y + (8.0 * monitor.scale_factor()).round() as i32;
                    window.set_position(PhysicalPosition::new(x, y))?;
                }
                window.show()?;
                #[cfg(target_os = "windows")]
                remove_native_caption(&window).map_err(std::io::Error::other)?;
                disable_default_context_menu(&window).map_err(std::io::Error::other)?;
                set_island_expanded(window.clone(), false, false).map_err(std::io::Error::other)?;
            }
            // A tray icon is the safety rope: the settings window can be
            // hidden (close) and this is the only way back.
            let tray_menu = build_tray_menu(app.handle())?;
            let tray_handle = app.handle().clone();
            tauri::tray::TrayIconBuilder::with_id("app-tray")
                .icon(app_icon)
                .tooltip("Dynamic Island")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    match id {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                set_settings_memory_target(&window, false);
                            }
                        }
                        "autostart" => {
                            use tauri_plugin_autostart::ManagerExt;
                            let manager = app.autolaunch();
                            let enabled = manager.is_enabled().unwrap_or(false);
                            let result = if enabled {
                                manager.disable()
                            } else {
                                manager.enable()
                            };
                            if result.is_ok() {
                                refresh_tray_menu(app);
                                let _ = app.emit_to("main", "autostart-changed", !enabled);
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {
                            if let Some(device_id) = id.strip_prefix("audio:")
                                && device_id != "none"
                            {
                                let handle = app.clone();
                                let device_id = device_id.to_string();
                                std::thread::spawn(move || {
                                    if audio::set_default(&device_id).is_err() {
                                        return;
                                    }
                                    if let Ok(menu) = build_tray_menu(&handle)
                                        && let Some(tray) = handle.tray_by_id("app-tray")
                                    {
                                        let _ = tray.set_menu(Some(menu));
                                    }
                                });
                            }
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                        && let Some(window) = tray.app_handle().get_webview_window("main")
                    {
                        let visible = window.is_visible().unwrap_or(false);
                        if visible {
                            let _ = window.hide();
                            set_settings_memory_target(&window, true);
                        } else {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                            set_settings_memory_target(&window, false);
                        }
                    }
                })
                .build(app)?;
            spawn_tray_audio_refresh(tray_handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && let WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                let _ = window.hide();
                SETTINGS_USER_HIDDEN.store(true, std::sync::atomic::Ordering::SeqCst);
                if let Some(main) = window.app_handle().get_webview_window("main") {
                    set_settings_memory_target(&main, true);
                }
            }
            if window.label() == "island" && matches!(event, WindowEvent::Focused(true)) {
                #[cfg(target_os = "windows")]
                if let Some(island) = window.app_handle().get_webview_window("island") {
                    let _ = raise_island(&island);
                }
            }
            if window.label() == "island" && matches!(event, WindowEvent::Moved(_)) {
                schedule_position_save(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Dynamic Island");
}

#[cfg(test)]
mod tests {
    use super::{island_visual_scale, taskbar_window_y};

    #[test]
    fn taskbar_window_centres_bottom_capsule_at_multiple_dpi_scales() {
        assert_eq!(taskbar_window_y(1032, 1080, 320, 1.0), 768);
        assert_eq!(taskbar_window_y(1044, 1080, 384, 1.2), 712);
        // An oversized capsule protrudes above the bar rather than below the screen.
        assert_eq!(taskbar_window_y(1032, 1080, 512, 1.6), 589);
    }

    #[test]
    fn island_scale_tiers_match_monitor_widths() {
        // Widths are CSS pixels: physical width divided by Windows scaling.
        assert_eq!(island_visual_scale(1366.0), 1.0);
        assert_eq!(island_visual_scale(1920.0), 1.1);
        // 2560×1440 at 125% scaling reports 2048 CSS pixels.
        assert_eq!(island_visual_scale(2048.0), 1.2);
        // 2560×1440 at 100% scaling.
        assert_eq!(island_visual_scale(2560.0), 1.3);
        // 3840×2160 at 125% scaling.
        assert_eq!(island_visual_scale(3072.0), 1.4);
    }

    #[test]
    fn island_scale_tiers_switch_exactly_at_thresholds() {
        assert_eq!(island_visual_scale(1499.0), 1.0);
        assert_eq!(island_visual_scale(1500.0), 1.1);
        assert_eq!(island_visual_scale(1999.0), 1.1);
        assert_eq!(island_visual_scale(2000.0), 1.2);
        assert_eq!(island_visual_scale(2399.0), 1.2);
        assert_eq!(island_visual_scale(2400.0), 1.3);
        assert_eq!(island_visual_scale(2999.0), 1.3);
        assert_eq!(island_visual_scale(3000.0), 1.4);
    }
}
