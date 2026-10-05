//! Local `gh` helpers for Projects checkout PR listing.
//!
//! OpenClaw's gateway allowlist does not include `gh pr list`, so the desktop
//! shell runs a narrow read-only list against the Mac `gh` binary.

use std::path::PathBuf;
use std::process::{Command, Stdio};

fn is_valid_gh_repo(repo: &str) -> bool {
    let Some((owner, name)) = repo.split_once('/') else {
        return false;
    };
    if owner.is_empty() || name.is_empty() || name.contains('/') {
        return false;
    }
    [owner, name].into_iter().all(|part| {
        part.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
    })
}

fn resolve_gh_bin() -> Result<PathBuf, String> {
    if let Some(path_os) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_os) {
            let candidate = dir.join("gh");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    for candidate in ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("gh not found on PATH or in /opt/homebrew/bin or /usr/local/bin".into())
}

fn gh_pr_list_blocking(repo: &str) -> Result<String, String> {
    let gh = resolve_gh_bin()?;
    let mut command = Command::new(&gh);
    command.args([
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "all",
        "--limit",
        "100",
        "--json",
        "number,title,state,isDraft,url,mergedAt,headRefName,baseRefName",
    ]);
    command.stdin(Stdio::null());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    crate::util::configure_no_window(&mut command);

    let output = command
        .output()
        .map_err(|error| format!("failed to run gh: {error}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("gh pr list failed with status {}", output.status)
        } else {
            stderr
        })
    }
}

/// Read-only `gh pr list` for one `owner/name` repository.
#[tauri::command]
pub async fn gh_pr_list(repo: String) -> Result<String, String> {
    let repo = repo.trim().to_string();
    if !is_valid_gh_repo(&repo) {
        return Err("Invalid repository. Expected owner/name.".into());
    }
    tauri::async_runtime::spawn_blocking(move || gh_pr_list_blocking(&repo))
        .await
        .map_err(|error| format!("gh pr list task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::is_valid_gh_repo;

    #[test]
    fn accepts_owner_name_repos() {
        assert!(is_valid_gh_repo("huladesk/hulabill"));
        assert!(is_valid_gh_repo("org_name/repo.name"));
        assert!(is_valid_gh_repo("a/b-c"));
    }

    #[test]
    fn rejects_invalid_repos() {
        assert!(!is_valid_gh_repo(""));
        assert!(!is_valid_gh_repo("noid"));
        assert!(!is_valid_gh_repo("/name"));
        assert!(!is_valid_gh_repo("owner/"));
        assert!(!is_valid_gh_repo("owner/name/extra"));
        assert!(!is_valid_gh_repo("owner/name space"));
        assert!(!is_valid_gh_repo("../evil/repo"));
    }
}
