//! Raise this process's open-file soft limit at startup so every child inherits it: Buzz Term shells (local and remote),
//! Herdr, managed agents. macOS GUI apps start at a soft limit of 256–2560, which tools like `claude` warn about ("low max
//! file descriptors"). Process-only (setrlimit); never touches launchctl or system-wide limits.

/// Target soft limit: min(65536, hard limit, kern.maxfilesperproc on macOS).
pub fn target_soft_limit(hard: u64, max_per_proc: Option<u64>) -> u64 {
    let mut t = 65_536u64.min(hard);
    if let Some(m) = max_per_proc {
        if m > 0 {
            t = t.min(m);
        }
    }
    t
}

#[cfg(unix)]
pub fn raise_nofile_soft_limit() {
    // SAFETY: getrlimit/setrlimit on a stack struct; no pointers retained.
    unsafe {
        let mut rl = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
        if libc::getrlimit(libc::RLIMIT_NOFILE, &mut rl) != 0 {
            return;
        }
        let hard = if rl.rlim_max == libc::RLIM_INFINITY { u64::MAX } else { rl.rlim_max as u64 };
        let target = target_soft_limit(hard, max_files_per_proc());
        if (rl.rlim_cur as u64) >= target {
            return;
        }
        let new = libc::rlimit { rlim_cur: target as libc::rlim_t, rlim_max: rl.rlim_max };
        if libc::setrlimit(libc::RLIMIT_NOFILE, &new) != 0 {
            eprintln!("buzz: couldn't raise open-file limit to {target}");
        }
    }
}

#[cfg(not(unix))]
pub fn raise_nofile_soft_limit() {}

#[cfg(target_os = "macos")]
fn max_files_per_proc() -> Option<u64> {
    let name = std::ffi::CString::new("kern.maxfilesperproc").ok()?;
    let mut v: libc::c_int = 0;
    let mut len = std::mem::size_of::<libc::c_int>();
    // SAFETY: sysctlbyname writes at most `len` bytes into `v`.
    let r = unsafe { libc::sysctlbyname(name.as_ptr(), (&mut v as *mut libc::c_int).cast(), &mut len, std::ptr::null_mut(), 0) };
    (r == 0 && v > 0).then_some(v as u64)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn max_files_per_proc() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::target_soft_limit;

    #[test]
    fn caps_by_hard_and_per_proc() {
        assert_eq!(target_soft_limit(u64::MAX, None), 65_536);
        assert_eq!(target_soft_limit(10_240, None), 10_240);
        assert_eq!(target_soft_limit(u64::MAX, Some(24_576)), 24_576);
        assert_eq!(target_soft_limit(u64::MAX, Some(0)), 65_536);
    }

    #[cfg(unix)]
    #[test]
    fn raising_never_lowers() {
        super::raise_nofile_soft_limit();
        let mut rl = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
        unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut rl) };
        assert!(rl.rlim_cur as u64 >= 256);
    }
}
