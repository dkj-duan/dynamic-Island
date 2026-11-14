//! Restore QQ using its verified Electron tray host, based on Daozai's QQ adapter.
//! See DAOZAI-LICENSE.txt. Never start a second QQ process.
use std::time::Duration;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WPARAM};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Shell::{NOTIFYICONIDENTIFIER, Shell_NotifyIconGetRect};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible, PostMessageW, SetForegroundWindow, WM_APP, WM_LBUTTONDBLCLK, WM_LBUTTONDOWN,
    WM_LBUTTONUP,
};
use windows::core::{BOOL, PWSTR};

fn verified_process(pid: u32) -> bool {
    unsafe {
        let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return false;
        };
        let mut path = [0u16; 1024];
        let mut len = path.len() as u32;
        let result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(process);
        result.is_ok()
            && String::from_utf16_lossy(&path[..len as usize])
                .rsplit(['\\', '/'])
                .next()
                .is_some_and(|name| name.eq_ignore_ascii_case("QQ.exe"))
    }
}

fn tray_host(pid: u32) -> Option<(HWND, u32)> {
    unsafe extern "system" fn visit(hwnd: HWND, context: LPARAM) -> BOOL {
        let (target, hosts) = unsafe { &mut *(context.0 as *mut (u32, Vec<HWND>)) };
        let mut owner = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut owner));
        }
        if owner == *target {
            let mut class = [0u16; 128];
            let len = unsafe { GetClassNameW(hwnd, &mut class) }.max(0) as usize;
            if String::from_utf16_lossy(&class[..len]) == "Electron_NotifyIconHostWindow" {
                hosts.push(hwnd);
            }
        }
        true.into()
    }
    let mut context = (pid, Vec::new());
    unsafe {
        let _ = EnumWindows(
            Some(visit),
            LPARAM((&mut context as *mut (u32, Vec<HWND>)) as isize),
        );
    }
    let mut icons = Vec::new();
    for host in context.1 {
        for id in 0..=256 {
            let icon = NOTIFYICONIDENTIFIER {
                cbSize: std::mem::size_of::<NOTIFYICONIDENTIFIER>() as u32,
                hWnd: host,
                uID: id,
                ..Default::default()
            };
            if unsafe { Shell_NotifyIconGetRect(&icon).is_ok() } {
                icons.push((host, id));
            }
        }
    }
    match icons.as_slice() {
        [one] => Some(*one),
        _ => None,
    }
}

pub fn open() -> Result<(), String> {
    unsafe {
        let hwnd = super::qq::qq_window().ok_or("请先登录QQ。")?;
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || !verified_process(pid) {
            return Err("无法确认QQ窗口。".into());
        }
        if IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() {
            return if SetForegroundWindow(hwnd).as_bool() {
                Ok(())
            } else {
                Err("无法切换到QQ窗口。".into())
            };
        }
        let (host, id) = tray_host(pid).ok_or("未能唯一确认QQ托盘图标，请从托盘打开。")?;
        for event in [WM_LBUTTONDOWN, WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_LBUTTONUP] {
            PostMessageW(
                Some(host),
                WM_APP + 1,
                WPARAM(id as usize),
                LPARAM(event as isize),
            )
            .map_err(|_| "QQ托盘暂时无法响应。")?;
        }
        for _ in 0..40 {
            let mut foreground_pid = 0;
            GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut foreground_pid));
            if foreground_pid == pid && IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool()
            {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err("未能确认已登录的QQ窗口，请从托盘打开。".into())
    }
}
