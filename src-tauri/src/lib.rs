use serde::Serialize;
#[cfg(not(target_os = "windows"))]
use tauri::LogicalSize;
use tauri::{Manager, PhysicalPosition, WindowEvent};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaState {
    title: String,
    artist: String,
    playing: bool,
    position_seconds: Option<f64>,
    duration_seconds: Option<f64>,
}

#[cfg(target_os = "windows")]
fn current_media_session()
-> Result<windows::Media::Control::GlobalSystemMediaTransportControlsSession, String> {
    use std::future::IntoFuture;
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Manager;
    let manager = futures::executor::block_on(
        Manager::RequestAsync()
            .map_err(|e| e.to_string())?
            .into_future(),
    )
    .map_err(|e| e.to_string())?;
    manager.GetCurrentSession().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_media_state() -> Result<Option<MediaState>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::future::IntoFuture;
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus;
        let session = match current_media_session() {
            Ok(session) => session,
            Err(_) => return Ok(None),
        };
        let properties = futures::executor::block_on(
            session
                .TryGetMediaPropertiesAsync()
                .map_err(|e| e.to_string())?
                .into_future(),
        )
        .map_err(|e| e.to_string())?;
        let status = session
            .GetPlaybackInfo()
            .and_then(|info| info.PlaybackStatus())
            .map_err(|e| e.to_string())?;
        let timeline = session.GetTimelineProperties().ok();
        let position = timeline
            .as_ref()
            .and_then(|t| t.Position().ok())
            .map(|t| t.Duration as f64 / 10_000_000.0);
        let duration = timeline
            .as_ref()
            .and_then(|t| t.EndTime().ok())
            .map(|t| t.Duration as f64 / 10_000_000.0)
            .filter(|t| *t > 0.0);
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
        }))
    }
    #[cfg(not(target_os = "windows"))]
    Ok(None)
}

#[tauri::command]
async fn get_media_artwork() -> Option<String> {
    tauri::async_runtime::spawn_blocking(read_media_artwork)
        .await
        .ok()
        .flatten()
}

fn read_media_artwork() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use base64::Engine;
        use std::future::IntoFuture;
        use windows::Storage::Streams::DataReader;
        let session = current_media_session().ok()?;
        let properties =
            futures::executor::block_on(session.TryGetMediaPropertiesAsync().ok()?.into_future())
                .ok()?;
        let stream = futures::executor::block_on(
            properties
                .Thumbnail()
                .ok()?
                .OpenReadAsync()
                .ok()?
                .into_future(),
        )
        .ok()?;
        let size = stream.Size().ok()?;
        if size == 0 || size > 2_000_000 {
            return None;
        }
        let content_type = stream.ContentType().ok()?.to_string();
        if !matches!(
            content_type.as_str(),
            "image/jpeg" | "image/png" | "image/webp"
        ) {
            return None;
        }
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        let loaded =
            futures::executor::block_on(reader.LoadAsync(size as u32).ok()?.into_future()).ok()?;
        let mut bytes = vec![0; loaded as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        Some(format!(
            "data:{};base64,{}",
            content_type,
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    }
    #[cfg(not(target_os = "windows"))]
    None
}

#[tauri::command]
fn control_media(action: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::future::IntoFuture;
        let session = current_media_session()?;
        let operation = match action.as_str() {
            "toggle" => session.TryTogglePlayPauseAsync(),
            "next" => session.TrySkipNextAsync(),
            "previous" => session.TrySkipPreviousAsync(),
            _ => return Err("unsupported media action".into()),
        }
        .map_err(|e| e.to_string())?;
        futures::executor::block_on(operation.into_future()).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = action;
        Err("media controls are only available on Windows".into())
    }
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

#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("settings window unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
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
        let inset = (30.0 * scale).round() as i32;
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
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let old_position = window.outer_position().map_err(|e| e.to_string())?;
        let old_size = window.outer_size().map_err(|e| e.to_string())?;
        let (width, height) = if expanded {
            (360.0, 280.0)
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
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_settings,
            quit_app,
            set_island_expanded,
            get_media_state,
            get_media_artwork,
            control_media
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("island") {
                if let Some(monitor) = window.primary_monitor()? {
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
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && let WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Dynamic Island");
}
