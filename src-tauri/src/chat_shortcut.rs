//! Open the user's start-menu shortcut, preserving the application's launch arguments.
use std::path::{Path, PathBuf};

fn find_shortcut(dir: &Path, names: &[&str], depth: usize) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let mut entries: Vec<_> = std::fs::read_dir(dir).ok()?.flatten().collect();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in &entries {
        if entry.file_type().is_ok_and(|kind| kind.is_file())
            && names.iter().any(|name| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(name)
            })
        {
            return Some(entry.path());
        }
    }
    for entry in entries {
        if entry.file_type().is_ok_and(|kind| kind.is_dir())
            && let Some(path) = find_shortcut(&entry.path(), names, depth - 1)
        {
            return Some(path);
        }
    }
    None
}

pub fn open(names: &[&str], label: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{PCWSTR, w};

    let roots = ["APPDATA", "ProgramData"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(|root| {
            PathBuf::from(root)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs")
        });
    let path = roots
        .filter_map(|root| find_shortcut(&root, names, 8))
        .next()
        .ok_or_else(|| format!("未找到{label}的开始菜单快捷方式。"))?;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            PCWSTR(wide.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize <= 32 {
        return Err(format!("无法打开{label}快捷方式。"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::find_shortcut;

    #[test]
    fn finds_only_matching_shortcuts_in_nested_directories() {
        let root = tempfile::tempdir().unwrap();
        let nested = root.path().join("Tencent");
        std::fs::create_dir(&nested).unwrap();
        std::fs::write(nested.join("QQ.lnk"), "").unwrap();
        std::fs::write(root.path().join("QQ.exe"), "").unwrap();
        assert_eq!(
            find_shortcut(root.path(), &["qq.lnk"], 3),
            Some(nested.join("QQ.lnk"))
        );
        assert_eq!(find_shortcut(root.path(), &["微信.lnk"], 3), None);
    }
}
