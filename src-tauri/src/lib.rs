use serde::Serialize;
#[cfg(not(target_os = "windows"))]
use tauri::LogicalSize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, Submenu};
use tauri::tray::TrayIconEvent;
use tauri::{Manager, PhysicalPosition, WindowEvent};

mod ai_quota;
mod audio;
mod lyrics;
mod mail;
#[cfg(target_os = "windows")]
mod netease_log;
#[cfg(target_os = "windows")]
mod netease_timeline;
mod storage;
mod system_status;

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
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.set_always_on_top(false);
        }
    });
    Ok(())
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

/// Tray menu with a live output-device submenu (checkmark = current default).
fn build_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show = MenuItem::with_id(app, "show", "显示设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let devices = Submenu::with_id(app, "audio", "输出设备", true)?;
    match audio::list() {
        Ok(list) if !list.is_empty() => {
            for device in list {
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
    Menu::with_items(app, &[&show, &devices, &quit])
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
    if window.label() != "main" {
        return Err("当前窗口不能切换输出设备".into());
    }
    tauri::async_runtime::spawn_blocking(move || audio::set_default(&device_id))
        .await
        .map_err(|error| error.to_string())?
}

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

/// Drags the island window while the pointer is held down.
#[tauri::command]
fn start_island_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "island" {
        return Err("当前窗口不支持拖动".into());
    }
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_island_expanded(window: tauri::WebviewWindow, expanded: bool) -> Result<(), String> {
    if window.label() != "island" {
        return Err("invalid window".into());
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        let inset = (10.0 * scale).round() as i32;
        let height = (64.0 * scale).round() as i32;
        // Keep WebView dimensions fixed; the region also excludes the empty
        // transparent area from hit testing when the island is collapsed.
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
        // Reopening the panel must also put it back above every other window.
        raise_island(&window)?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let old_position = window.outer_position().map_err(|e| e.to_string())?;
        let old_size = window.outer_size().map_err(|e| e.to_string())?;
        let (width, height) = if expanded {
            (360.0, 320.0)
        } else {
            (300.0, 64.0)
        };
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let x = old_position.x + (old_size.width as i32 - (width * scale).round() as i32) / 2;
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(x, old_position.y))
            .map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_settings,
            quit_app,
            set_island_expanded,
            start_island_drag,
            reset_island_position,
            set_window_theme,
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
            app.manage(storage::initialize(app.handle()).map_err(std::io::Error::other)?);
            app.manage(mail::MailMonitor::default());
            // Scale the settings window with the monitor so every page fits
            // without a scrollbar on common desktop resolutions.
            if let Some(window) = app.get_webview_window("main")
                && let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?)
            {
                let scale = monitor.scale_factor();
                let size = monitor.size();
                // Large displays also get larger type (large-display.css), so
                // the caps must leave room for the taller content.
                let width = (size.width as f64 / scale * 0.72).clamp(900.0, 1680.0);
                let height = (size.height as f64 / scale * 0.88).clamp(640.0, 1120.0);
                window.set_size(tauri::LogicalSize::new(width, height))?;
                window.center()?;
            }
            if let Some(window) = app.get_webview_window("island") {
                let storage = app.state::<storage::Storage>();
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
                set_island_expanded(window.clone(), false).map_err(std::io::Error::other)?;
            }
            // A tray icon is the safety rope: both windows can be hidden
            // (close / minimize) and this is the only way back.
            let tray_menu = build_tray_menu(app.handle())?;
            let tray_handle = app.handle().clone();
            tauri::tray::TrayIconBuilder::with_id("app-tray")
                .icon(app.default_window_icon().unwrap().clone())
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
                        } else {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            spawn_tray_audio_refresh(tray_handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // Minimising parks the settings window in the tray.
                if matches!(event, WindowEvent::Resized(_))
                    && window.is_minimized().unwrap_or(false)
                {
                    let _ = window.hide();
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
