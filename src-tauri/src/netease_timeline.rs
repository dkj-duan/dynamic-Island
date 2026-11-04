//! 网易云、酷狗未上报系统时间轴时，读取已验证版本的只读播放时间。
//! Adapted from Daozai (MIT); see ../DAOZAI-LICENSE.txt.
use std::ffi::c_void;
type Handle = *mut c_void;
#[link(name = "kernel32")]
unsafe extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    fn CloseHandle(handle: Handle) -> i32;
    fn ReadProcessMemory(
        handle: Handle,
        address: usize,
        buffer: *mut c_void,
        size: usize,
        read: *mut usize,
    ) -> i32;
    fn K32EnumProcesses(ids: *mut u32, size: u32, needed: *mut u32) -> i32;
    fn K32EnumProcessModules(
        handle: Handle,
        modules: *mut usize,
        size: u32,
        needed: *mut u32,
    ) -> i32;
    fn K32GetModuleBaseNameW(handle: Handle, module: usize, name: *mut u16, size: u32) -> u32;
}
struct Process(Handle);
impl Drop for Process {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
fn read<const N: usize>(p: Handle, address: usize) -> Option<[u8; N]> {
    let mut bytes = [0; N];
    let mut count = 0;
    (unsafe { ReadProcessMemory(p, address, bytes.as_mut_ptr().cast(), N, &mut count) } != 0
        && count == N)
        .then_some(bytes)
}
fn valid(position: f64, duration: f64) -> bool {
    position.is_finite()
        && duration.is_finite()
        && duration > 0.0
        && duration < 86400.0
        && position >= 0.0
        && position <= duration
}
#[test]
fn rejects_invalid_timeline() {
    assert!(!valid(f64::NAN, 240.0));
    assert!(!valid(0.0, 0.0));
    assert!(!valid(241.0, 240.0));
    assert!(!valid(-1.0, 240.0));
    assert!(valid(12.01, 275.5));
}
fn name(p: Handle, module: usize) -> String {
    let mut s = [0u16; 260];
    let n = unsafe { K32GetModuleBaseNameW(p, module, s.as_mut_ptr(), 260) } as usize;
    String::from_utf16_lossy(&s[..n])
}
pub fn timeline() -> Option<(f64, f64)> {
    query()
}
#[test]
#[ignore = "requires a supported running NetEase Cloud Music version"]
fn live_netease_timeline() {
    let value = timeline().expect("supported player timeline unavailable");
    println!("position {:.1}, duration {:.1}", value.0, value.1);
    assert!(valid(value.0, value.1));
}
fn query() -> Option<(f64, f64)> {
    let (process, module, stamp, image_size, position_offset) = (
        "cloudmusic.exe",
        "cloudmusic.dll",
        0x6ad712e1,
        41054208,
        0x21a74d8,
    );
    let mut ids = [0u32; 4096];
    let mut needed = 0;
    if unsafe {
        K32EnumProcesses(
            ids.as_mut_ptr(),
            std::mem::size_of_val(&ids) as u32,
            &mut needed,
        )
    } == 0
    {
        return None;
    }
    for &id in ids.iter().take(needed as usize / 4) {
        let p = Process(unsafe { OpenProcess(0x410, 0, id) });
        if p.0.is_null() {
            continue;
        }
        if !name(p.0, 0).eq_ignore_ascii_case(process) {
            continue;
        }
        let mut modules = [0usize; 1024];
        let mut size = 0;
        if unsafe {
            K32EnumProcessModules(
                p.0,
                modules.as_mut_ptr(),
                std::mem::size_of_val(&modules) as u32,
                &mut size,
            )
        } == 0
        {
            continue;
        }
        for &base in modules
            .iter()
            .take(size as usize / std::mem::size_of::<usize>())
        {
            if !name(p.0, base).eq_ignore_ascii_case(module) {
                continue;
            }
            let pe = u32::from_le_bytes(read::<4>(p.0, base + 60)?) as usize;
            if pe > 4096 {
                return None;
            }
            // 仅使用本机验证过的 PE 时间戳与映像大小，其他版本安全回退。
            if u32::from_le_bytes(read::<4>(p.0, base + pe + 8)?) != stamp
                || u32::from_le_bytes(read::<4>(p.0, base + pe + 80)?) != image_size
            {
                return None;
            }
            let position = f64::from_le_bytes(read::<8>(p.0, base + position_offset)?);
            let duration = f64::from_le_bytes(read::<8>(p.0, base + 0x2214778)?);
            return valid(position, duration).then_some((position, duration));
        }
    }
    None
}
