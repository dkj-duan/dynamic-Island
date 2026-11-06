//! Forwarding desktop toast notifications to the island.
//!
//! Uses the Windows notification access API (`UserNotificationListener`),
//! which the user must grant once in system settings. Only toast payloads are
//! read, only locally, and only the app name plus the first text line are
//! forwarded; nothing is written to disk or log. New notifications are
//! deduplicated by id, and a listener started after the app never replays the
//! notifications that already exist.

use std::collections::HashSet;
use std::sync::Mutex;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};

#[derive(Clone, serde::Serialize)]
pub struct AppNotification {
    pub app: String,
    pub text: String,
}

static FORWARDING: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);

#[tauri::command]
pub async fn get_notification_access() -> Result<&'static str, String> {
    tauri::async_runtime::spawn_blocking(access_state)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn set_notification_forwarding(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_forwarding(app, enabled))
        .await
        .map_err(|error| error.to_string())?
}

/// Opens the system page that owns the notification access switch.
#[tauri::command]
pub fn open_notification_settings() -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg("ms-settings:notifications")
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
use windows::UI::Notifications::Management::UserNotificationListener;
#[cfg(target_os = "windows")]
use windows::UI::Notifications::UserNotification;

/// Checks whether the user granted notification access; does not prompt.
pub fn access_state() -> Result<&'static str, String> {
    #[cfg(target_os = "windows")]
    {
        let _com = ComGuard::new()?;
        let listener = current_listener()?;
        use windows::UI::Notifications::Management::UserNotificationListenerAccessStatus;
        let access = listener
            .GetAccessStatus()
            .map_err(|_| "无法读取通知访问状态".to_string())?;
        Ok(match access {
            UserNotificationListenerAccessStatus::Allowed => "allowed",
            UserNotificationListenerAccessStatus::Denied => "denied",
            _ => "unspecified",
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("通知转发目前仅支持 Windows".into())
    }
}

/// Starts or stops the listener. Starting returns once the worker thread is
/// spawned; it reports access problems on its own thread and simply stops.
pub fn set_forwarding(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let mut state = FORWARDING
        .lock()
        .map_err(|_| "通知转发状态不可用".to_string())?;
    if enabled {
        if state.is_some() {
            return Ok(());
        }
        let (tx, rx) = mpsc::channel::<()>();
        spawn_worker(app, rx);
        *state = Some(tx);
        Ok(())
    } else {
        // Dropping the sender is the stop signal; the worker's last in-flight
        // query may still time out on its own thread.
        *state = None;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn spawn_worker(app: tauri::AppHandle, stop: mpsc::Receiver<()>) {
    std::thread::spawn(move || {
        if let Err(error) = worker(app, stop) {
            eprintln!("notification forwarding stopped: {error}");
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn spawn_worker(_app: tauri::AppHandle, _stop: mpsc::Receiver<()>) {
    // Notifications are only supported on Windows; nothing to start.
}

#[cfg(target_os = "windows")]
fn worker(app: tauri::AppHandle, stop: mpsc::Receiver<()>) -> Result<(), String> {
    use tauri::Emitter;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::Management::UserNotificationListenerAccessStatus;
    let _com = ComGuard::new()?;
    let listener = current_listener()?;
    let access = wait_bounded(
        listener
            .RequestAccessAsync()
            .map_err(|error| error.to_string())?,
        Duration::from_secs(8),
    )?;
    if access != UserNotificationListenerAccessStatus::Allowed {
        return Err("系统未授予通知访问权限".into());
    }
    // Everything that exists right now is history: mark it seen silently so
    // enabling forwarding never replays the Action Center.
    let mut seen: HashSet<u32> = HashSet::new();
    for notification in collect_toasts(&listener, Duration::from_secs(5))? {
        seen.insert(notification.Id().unwrap_or(0));
    }
    let (event_tx, event_rx) = mpsc::channel::<u32>();
    let token = listener
        .NotificationChanged(&TypedEventHandler::new(
            move |_,
                  args: windows::core::Ref<
                '_,
                windows::UI::Notifications::UserNotificationChangedEventArgs,
            >| {
                if let Ok(args) = args.ok() {
                    let _ = event_tx.send(args.UserNotificationId().unwrap_or(0));
                }
                Ok(())
            },
        ))
        .map_err(|error| error.to_string())?;
    let result = loop {
        match stop.recv_timeout(Duration::from_millis(500)) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => break Ok(()),
            Err(RecvTimeoutError::Timeout) => {}
        }
        // The event only carries an id; enumerate toasts once per burst and
        // forward what has not been seen yet. Ids accumulate for the whole
        // session, but a session's worth of u32 keys is negligible.
        let mut fresh = false;
        while let Ok(id) = event_rx.try_recv() {
            if id != 0 && seen.insert(id) {
                fresh = true;
            }
        }
        if !fresh {
            continue;
        }
        let Ok(toasts) = collect_toasts(&listener, Duration::from_secs(3)) else {
            continue;
        };
        for notification in toasts {
            if !seen.insert(notification.Id().unwrap_or(0)) {
                continue;
            }
            if let Some(payload) = describe(&notification) {
                let _ = app.emit_to("island", "app-notification", payload);
            }
        }
    };
    let _ = listener.RemoveNotificationChanged(token);
    result
}

#[cfg(target_os = "windows")]
fn collect_toasts(
    listener: &UserNotificationListener,
    timeout: Duration,
) -> Result<Vec<UserNotification>, String> {
    use windows::UI::Notifications::NotificationKinds;
    let view = wait_bounded(
        listener
            .GetNotificationsAsync(NotificationKinds::Toast)
            .map_err(|error| error.to_string())?,
        timeout,
    )?;
    let mut items = Vec::new();
    for index in 0..view.Size().map_err(|error| error.to_string())? {
        if let Ok(notification) = view.GetAt(index) {
            items.push(notification);
        }
    }
    Ok(items)
}

/// The app name plus the first non-empty text line; toasts without a readable
/// text binding are skipped (the Action Center still holds the originals).
#[cfg(target_os = "windows")]
fn describe(notification: &UserNotification) -> Option<AppNotification> {
    let app = notification
        .AppInfo()
        .ok()
        .and_then(|info| info.DisplayInfo().ok())
        .and_then(|display| display.DisplayName().ok())
        .map(|name| name.to_string())
        .unwrap_or_default();
    let text = notification
        .Notification()
        .ok()
        .and_then(|payload| payload.Visual().ok())
        .and_then(|visual| visual.Bindings().ok())
        .and_then(|bindings| {
            (0..bindings.Size().ok()?)
                .filter_map(|index| bindings.GetAt(index).ok())
                .filter_map(|binding| binding.GetTextElements().ok())
                .filter_map(|elements| {
                    (0..elements.Size().ok()?)
                        .filter_map(|index| elements.GetAt(index).ok())
                        .filter_map(|item| item.Text().ok())
                        .map(|value| value.to_string())
                        .find(|value| !value.trim().is_empty())
                })
                .next()
        })?;
    // The capsule shows a single line; keep a hard ceiling on the length.
    let text: String = text.chars().take(80).collect();
    if text.trim().is_empty() {
        return None;
    }
    Some(AppNotification { app, text })
}

#[cfg(target_os = "windows")]
fn current_listener() -> Result<UserNotificationListener, String> {
    UserNotificationListener::Current().map_err(|_| "无法访问系统通知".to_string())
}

/// RAII for COM initialization on a worker thread.
#[cfg(target_os = "windows")]
struct ComGuard {
    initialized: bool,
}

#[cfg(target_os = "windows")]
impl ComGuard {
    fn new() -> Result<Self, String> {
        use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
        Ok(Self { initialized })
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        use windows::Win32::System::Com::CoUninitialize;
        if self.initialized {
            unsafe { CoUninitialize() };
        }
    }
}

/// Waits for a WinRT async operation with a hard bound, on a plain thread.
#[cfg(target_os = "windows")]
fn wait_bounded<F, T>(operation: F, timeout: Duration) -> Result<T, String>
where
    F: std::future::IntoFuture<Output = windows::core::Result<T>>,
{
    use std::future::Future;
    let started = Instant::now();
    let mut future = Box::pin(operation.into_future());
    // The waker is never woken externally: this thread sleeps and re-polls.
    let waker = Waker::noop();
    loop {
        match future.as_mut().poll(&mut Context::from_waker(waker)) {
            Poll::Ready(value) => return value.map_err(|error| error.to_string()),
            Poll::Pending => {
                if started.elapsed() >= timeout {
                    return Err("等待系统通知响应超时".into());
                }
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }
}
