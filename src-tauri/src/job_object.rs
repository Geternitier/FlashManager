//! Windows Job Object wrapper to ensure any spawned service and ALL its child/grandchild
//! processes are cleanly terminated when stopped or when FlashManager exits.

#[cfg(windows)]
use std::ptr::null_mut;
#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
    },
};

pub struct ProcessJob {
    #[cfg(windows)]
    handle: HANDLE,
}

unsafe impl Send for ProcessJob {}
unsafe impl Sync for ProcessJob {}

impl ProcessJob {
    /// Creates a new Windows Job Object configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`
    /// and assigns the given process ID (`pid`) to it.
    pub fn create_and_assign(pid: u32) -> Result<Self, String> {
        #[cfg(windows)]
        unsafe {
            let job = CreateJobObjectW(null_mut(), null_mut());
            if job.is_null() {
                return Err("Failed to CreateJobObjectW".to_string());
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                CloseHandle(job);
                return Err("Failed to SetInformationJobObject".to_string());
            }

            let proc_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if proc_handle.is_null() {
                CloseHandle(job);
                return Err(format!("Failed to OpenProcess for PID {}", pid));
            }

            let assigned = AssignProcessToJobObject(job, proc_handle);
            CloseHandle(proc_handle);

            if assigned == 0 {
                // Note: In rare nested-job environments on older Windows, AssignProcessToJobObject
                // might fail if the parent is already in a restricted job. We still keep the job handle
                // or fallback to taskkill /F /T on stop.
                CloseHandle(job);
                return Err(format!("AssignProcessToJobObject returned 0 for PID {}", pid));
            }

            Ok(Self { handle: job })
        }

        #[cfg(not(windows))]
        {
            let _ = pid;
            Ok(Self {})
        }
    }

    /// Terminates all processes associated with this Job Object immediately.
    pub fn terminate(&self) {
        #[cfg(windows)]
        unsafe {
            if !self.handle.is_null() {
                let _ = TerminateJobObject(self.handle, 0);
            }
        }
    }
}

impl Drop for ProcessJob {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            if !self.handle.is_null() {
                let _ = TerminateJobObject(self.handle, 0);
                CloseHandle(self.handle);
                self.handle = null_mut();
            }
        }
    }
}

/// Fallback tree-kill via `taskkill /F /T /PID <pid>` in case a process was not attached to a Job.
pub fn kill_process_tree_fallback(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}
