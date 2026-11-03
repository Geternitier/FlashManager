//! Serialized callers commit validated JSON using a same-directory atomic replacement.
use serde::{de::DeserializeOwned, Serialize};
use std::io::Write;
use std::path::Path;

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|e| {
            format!(
                "配置格式无效 {}: {}。原文件已保留，请修复或从 .bak 恢复。",
                path.display(),
                e
            )
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读取配置失败 {}: {}", path.display(), e)),
    }
}

pub fn write_json<T: Serialize + DeserializeOwned>(path: &Path, value: &T) -> Result<(), String> {
    // Never overwrite an unreadable/corrupt original with an empty in-memory state.
    let previous = read_json::<T>(path)?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let parent = path.parent().ok_or("配置路径缺少父目录")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    if let Some(previous) = previous {
        let backup = path.with_extension("json.bak");
        let old = serde_json::to_vec_pretty(&previous).map_err(|e| e.to_string())?;
        atomic_write(&backup, &old)?;
    }
    atomic_write(path, &bytes)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result.map_err(|e| format!("写入配置失败 {}: {}", path.display(), e))
}

#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_backup_and_refuses_corrupt_original() {
        let dir = std::env::temp_dir().join(format!("flash-storage-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("services.json");
        write_json(&path, &vec!["first".to_string()]).unwrap();
        write_json(&path, &vec!["second".to_string()]).unwrap();
        assert_eq!(
            read_json::<Vec<String>>(&path.with_extension("json.bak"))
                .unwrap()
                .unwrap(),
            vec!["first".to_string()]
        );
        std::fs::write(&path, "broken").unwrap();
        assert!(write_json(&path, &vec!["replacement".to_string()]).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "broken");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
