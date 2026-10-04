//! Publish OpenClaw checkout changes as a GitHub commit and pull request.
//!
//! The commit is created in the OpenClaw Hula checkout. Author and committer
//! are the Mac `gh` login. The command pushes that commit and opens the pull
//! request. It does not mint a second commit through the GitHub commits API,
//! and it does not clone onto this Mac.

use crate::error::CliError;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

const MAX_MESSAGE_CHARS: usize = 65_536;
const MAX_TITLE_CHARS: usize = 256;
const MAX_BODY_CHARS: usize = 65_536;
const MAX_ERROR_CHARS: usize = 400;
const OPENCLAW_MCP_NAME: &str = "openclaw-workspace";

/// Validated publish request. `--branch` is committed and pushed. It is never main.
#[derive(Debug, Clone, PartialEq, Eq)]
struct PublishSpec {
    repo: String,
    base: String,
    branch: String,
    message: String,
    /// Empty means commit and push only. A title opens the pull request.
    title: String,
    body: String,
    /// Paths this step would `git add`. Empty means do not stage unrelated files.
    paths: Vec<String>,
    /// Open the pull request as a draft. `hula-impl-ship` is what marks it ready.
    draft: bool,
    /// Workspace-relative OpenClaw checkout, for example `Hula/products/hulabill`.
    cwd: String,
    dry_run: bool,
}

struct GithubCallError {
    status: Option<u16>,
    message: String,
}

trait GithubApi {
    fn call(
        &mut self,
        method: &str,
        path: &str,
        body: Option<&Value>,
    ) -> Result<Value, GithubCallError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GhIdentity {
    name: String,
    email: String,
    login: String,
}

/// Arguments for [`cmd_publish`].
pub struct PublishArgs<'a> {
    /// GitHub repository as `owner/name`.
    pub repo: &'a str,
    /// Branch the new commit starts from.
    pub base: &'a str,
    /// Skill branch. This is the branch that is committed and pushed. Never main.
    pub branch: &'a str,
    /// Commit message for this skill step.
    pub message: &'a str,
    /// Pull request title. Empty skips opening a pull request.
    pub title: &'a str,
    /// Pull request body. Empty is allowed.
    pub body: &'a str,
    /// Paths this step would `git add`. Empty does not stage the dirty tree.
    pub paths: &'a [String],
    /// Open the pull request as a draft.
    pub draft: bool,
    /// Workspace-relative OpenClaw checkout under `Hula/`.
    pub cwd: &'a str,
    /// Read the base and the OpenClaw grant. Create nothing.
    pub dry_run: bool,
}

/// Create a commit in the OpenClaw checkout, push it, and open a pull request.
pub fn cmd_publish(args: PublishArgs<'_>) -> Result<(), CliError> {
    let spec = parse_spec(&args)?;
    let identity = resolve_gh_identity()?;
    let grant = load_openclaw_grant()?;
    let remote_repo = remote_repo_from_openclaw(&grant, &spec.cwd)?;
    let mut api = GhCli;
    let mut git = GrantGit { grant: &grant };
    let result = publish_changes(&spec, &mut api, &identity, &remote_repo, &mut git)?;
    println!(
        "{}",
        serde_json::to_string(&result).map_err(|e| CliError::Other(format!("json: {e}")))?
    );
    Ok(())
}

fn parse_spec(args: &PublishArgs<'_>) -> Result<PublishSpec, CliError> {
    let repo = validate_repo(args.repo)?;
    let base = validate_branch_name(args.base, "base")?;
    let branch = validate_branch_name(args.branch, "branch")?;
    if branch.eq_ignore_ascii_case(&base)
        || branch.eq_ignore_ascii_case("main")
        || branch.eq_ignore_ascii_case("master")
    {
        return Err(CliError::Usage(
            "branch must be a new branch name, and it must not be main or master".into(),
        ));
    }
    if args.draft && args.title.trim().is_empty() {
        return Err(CliError::Usage(
            "--draft requires --title. No pull request was opened.".into(),
        ));
    }
    let message = bounded_text(args.message, "message", MAX_MESSAGE_CHARS, false)?;
    let title = bounded_text(args.title, "title", MAX_TITLE_CHARS, true)?;
    let body = bounded_text(args.body, "body", MAX_BODY_CHARS, true)?;
    let paths = validate_paths(args.paths)?;
    let cwd = validate_openclaw_cwd(args.cwd)?;
    Ok(PublishSpec {
        repo,
        base,
        branch,
        message,
        title,
        body,
        paths,
        draft: args.draft,
        cwd,
        dry_run: args.dry_run,
    })
}

trait OpenClawGit {
    fn exec(
        &mut self,
        cwd: &str,
        argv: &[String],
        identity: Option<&GhIdentity>,
    ) -> Result<Value, CliError>;
}

struct GrantGit<'a> {
    grant: &'a OpenClawGrant,
}

impl OpenClawGit for GrantGit<'_> {
    fn exec(
        &mut self,
        cwd: &str,
        argv: &[String],
        identity: Option<&GhIdentity>,
    ) -> Result<Value, CliError> {
        openclaw_exec(self.grant, cwd, json!(argv), identity)
    }
}

fn publish_changes(
    spec: &PublishSpec,
    api: &mut dyn GithubApi,
    identity: &GhIdentity,
    remote_repo: &str,
    git: &mut dyn OpenClawGit,
) -> Result<Value, CliError> {
    if !repo_names_match(remote_repo, &spec.repo) {
        return Err(CliError::Usage(format!(
            "OpenClaw checkout {} is {}, not {}",
            spec.cwd, remote_repo, spec.repo
        )));
    }

    let base_commit = api_get(
        api,
        &format!("repos/{}/git/ref/heads/{}", spec.repo, spec.base),
    )?;
    let base_sha = base_commit
        .pointer("/object/sha")
        .and_then(Value::as_str)
        .ok_or_else(|| CliError::Other("base branch response did not include a commit SHA".into()))?
        .to_string();

    if spec.dry_run {
        return Ok(json!({
            "dryRun": true,
            "repo": spec.repo,
            "base": spec.base,
            "baseSha": base_sha,
            "branch": spec.branch,
            "cwd": spec.cwd,
            "author": {
                "name": identity.name,
                "email": identity.email,
                "login": identity.login,
            },
        }));
    }

    let status = git_step(git, &spec.cwd, &["git", "status", "-sb"], None)?;
    let status_text = status.get("stdout").and_then(Value::as_str).unwrap_or("");
    let head = parse_status_sb(status_text)?;
    let will_commit = !spec.paths.is_empty() && paths_are_dirty(status_text, &spec.paths);
    let (branch, created_branch) = publish_branch(spec, api, git, &head, will_commit)?;
    let committed = if will_commit {
        git_step_owned(git, &spec.cwd, &add_paths_argv(&spec.paths), None)?;
        git_step(
            git,
            &spec.cwd,
            &["git", "commit", "-m", &spec.message],
            Some(identity),
        )?;
        true
    } else {
        false
    };
    let logged = git_step(
        git,
        &spec.cwd,
        &["git", "log", "-n", "1", "--pretty=oneline", "HEAD"],
        None,
    )?;
    let commit_sha =
        commit_sha_from_log(logged.get("stdout").and_then(Value::as_str).unwrap_or(""))?;
    let on_target = head.branch.as_deref() == Some(branch.as_str());
    let pushed =
        if created_branch || committed || (on_target && (head.ahead > 0 || !head.has_upstream)) {
            git_step(
                git,
                &spec.cwd,
                &["git", "push", "origin", branch.as_str()],
                None,
            )?;
            true
        } else {
            false
        };
    if spec.title.is_empty() && !committed && !created_branch && !pushed {
        return Err(CliError::Usage(
            "nothing to commit. Pass --paths for the files this step adds. No pull request was opened."
                .into(),
        ));
    }
    let (pull, notice, already_published) = if spec.title.is_empty() {
        (Value::Null, None, false)
    } else {
        open_pull(api, spec, &branch, &commit_sha, committed, pushed)?
    };
    let number = pull.get("number").and_then(Value::as_u64);
    let url = pull.get("html_url").and_then(Value::as_str);
    let mut result = json!({
        "dryRun": false,
        "repo": spec.repo,
        "base": spec.base,
        "branch": branch,
        "createdBranch": created_branch,
        "committed": committed,
        "pushed": pushed,
        "alreadyPublished": already_published,
        "cwd": spec.cwd,
        "commit": commit_sha,
        "author": {
            "name": identity.name,
            "email": identity.email,
            "login": identity.login,
        },
        "pullRequest": {
            "number": number,
            "url": url,
        }
    });
    if let Some(notice) = notice {
        result["message"] = json!(notice);
    }
    Ok(result)
}

/// `--branch` is the branch that is committed and pushed. Stay off main.
///
/// A checkout already on that branch is used as-is. A checkout on main, master,
/// or detached gets `git checkout -b` only when this step has paths to commit
/// and that branch does not already exist. Any other branch is left alone.
fn publish_branch(
    spec: &PublishSpec,
    api: &mut dyn GithubApi,
    git: &mut dyn OpenClawGit,
    head: &CheckoutHead,
    will_commit: bool,
) -> Result<(String, bool), CliError> {
    if head.branch.as_deref() == Some(spec.branch.as_str()) {
        return Ok((spec.branch.clone(), false));
    }
    match head.branch.as_deref() {
        Some(name) if !is_protected_branch(name) => {
            return Err(CliError::Usage(format!(
                "checkout is on {name}, not {}. It was not moved. No pull request was opened.",
                spec.branch
            )));
        }
        _ => {}
    }
    if !will_commit {
        let where_ = head.branch.as_deref().unwrap_or("a detached HEAD");
        return Err(CliError::Usage(format!(
            "nothing to commit on {where_}. Pass --paths for the files this step adds. No branch was created and no pull request was opened."
        )));
    }
    match api.call(
        "GET",
        &format!("repos/{}/git/ref/heads/{}", spec.repo, spec.branch),
        None,
    ) {
        Ok(_) => {
            return Err(CliError::Usage(format!(
                "branch {} already exists. It was not moved. No pull request was opened.",
                spec.branch
            )));
        }
        Err(error) if error.status == Some(404) => {}
        Err(error) => return Err(map_github_error(error)),
    }
    git_step(
        git,
        &spec.cwd,
        &["git", "checkout", "-b", &spec.branch],
        None,
    )?;
    Ok((spec.branch.clone(), true))
}

fn open_pull(
    api: &mut dyn GithubApi,
    spec: &PublishSpec,
    branch: &str,
    commit_sha: &str,
    committed: bool,
    pushed: bool,
) -> Result<(Value, Option<String>, bool), CliError> {
    match api.call(
        "POST",
        &format!("repos/{}/pulls", spec.repo),
        Some(&json!({
            "title": spec.title,
            "head": branch,
            "base": spec.base,
            "body": spec.body,
            "draft": spec.draft,
        })),
    ) {
        Ok(pull) => Ok((pull, None, false)),
        Err(error)
            if error.status == Some(422)
                && error
                    .message
                    .to_ascii_lowercase()
                    .contains("already exists") =>
        {
            let Some(pull) = find_open_pull(api, spec, branch)? else {
                return Err(CliError::Other(format!(
                    "branch {branch} is on GitHub at {commit_sha}. The pull request was not opened: {}",
                    clip(&error.message)
                )));
            };
            let number = pull.get("number").and_then(Value::as_u64).unwrap_or(0);
            let message = if committed || pushed {
                format!("{branch} was updated. Pull request #{number} is already open.")
            } else {
                format!("{branch} is already pushed and pull request #{number} is open.")
            };
            Ok((pull, Some(message), !committed && !pushed))
        }
        Err(error) => Err(CliError::Other(format!(
            "branch {branch} is on GitHub at {commit_sha}. The pull request was not opened: {}",
            clip(&error.message)
        ))),
    }
}

fn find_open_pull(
    api: &mut dyn GithubApi,
    spec: &PublishSpec,
    branch: &str,
) -> Result<Option<Value>, CliError> {
    let owner = spec.repo.split('/').next().unwrap_or("");
    let listed = api_get(
        api,
        &format!("repos/{}/pulls?head={owner}:{branch}&state=open", spec.repo),
    )?;
    let pulls = listed.as_array().cloned().unwrap_or_default();
    Ok(pulls.into_iter().find(|pull| {
        pull.pointer("/base/ref")
            .and_then(Value::as_str)
            .is_some_and(|base| base.eq_ignore_ascii_case(&spec.base))
            && pull
                .pointer("/head/ref")
                .and_then(Value::as_str)
                .is_some_and(|head| head == branch)
    }))
}

struct CheckoutHead {
    branch: Option<String>,
    ahead: u64,
    has_upstream: bool,
    dirty: bool,
}

fn is_protected_branch(name: &str) -> bool {
    name.eq_ignore_ascii_case("main") || name.eq_ignore_ascii_case("master")
}

fn parse_status_sb(stdout: &str) -> Result<CheckoutHead, CliError> {
    let mut lines = stdout.lines();
    let header = lines.next().unwrap_or("").trim();
    let Some(rest) = header.strip_prefix("## ") else {
        return Err(CliError::Other(format!(
            "could not read the checkout branch: {}",
            clip(stdout)
        )));
    };
    let rest = rest.trim();
    let detached = rest.starts_with("HEAD (no branch)");
    let (branch, tracking) = if detached {
        (None, "")
    } else {
        let (name, tracking) = rest.split_once("...").unwrap_or((rest, ""));
        let name = name.split_whitespace().next().unwrap_or("").trim();
        if name.is_empty() {
            return Err(CliError::Other(format!(
                "could not read the checkout branch: {}",
                clip(stdout)
            )));
        }
        (Some(name.to_string()), tracking)
    };
    let ahead = tracking
        .split("ahead ")
        .nth(1)
        .map(|tail| {
            tail.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
        })
        .filter(|digits| !digits.is_empty())
        .and_then(|digits| digits.parse().ok())
        .unwrap_or(0);
    Ok(CheckoutHead {
        branch,
        ahead,
        has_upstream: !detached && rest.contains("..."),
        dirty: lines.any(|line| !line.trim().is_empty()),
    })
}

fn git_step(
    git: &mut dyn OpenClawGit,
    cwd: &str,
    argv: &[&str],
    identity: Option<&GhIdentity>,
) -> Result<Value, CliError> {
    let argv: Vec<String> = argv.iter().map(|part| (*part).to_string()).collect();
    git_step_owned(git, cwd, &argv, identity)
}

fn git_step_owned(
    git: &mut dyn OpenClawGit,
    cwd: &str,
    argv: &[String],
    identity: Option<&GhIdentity>,
) -> Result<Value, CliError> {
    git.exec(cwd, argv, identity)
}

fn add_paths_argv(paths: &[String]) -> Vec<String> {
    let mut argv = vec!["git".to_string(), "add".to_string(), "--".to_string()];
    argv.extend(paths.iter().cloned());
    argv
}

/// True when a short status lists one of the paths this step is allowed to stage.
fn paths_are_dirty(stdout: &str, paths: &[String]) -> bool {
    stdout.lines().skip(1).any(|line| {
        // Keep the leading status column. ` M README.md` is XY plus a space.
        let line = line.trim_end();
        if line.len() < 4 {
            return false;
        }
        let path = line[3..].trim();
        let path = path.rsplit(" -> ").next().unwrap_or(path);
        paths
            .iter()
            .any(|wanted| path == wanted || path.starts_with(&format!("{wanted}/")))
    })
}

fn validate_paths(paths: &[String]) -> Result<Vec<String>, CliError> {
    if paths.len() > 32 {
        return Err(CliError::Usage(
            "--paths accepts at most 32 files for one skill commit".into(),
        ));
    }
    let mut out = Vec::with_capacity(paths.len());
    for path in paths {
        let path = path.trim().replace('\\', "/");
        let bad = path.is_empty()
            || path.starts_with('-')
            || path.starts_with('/')
            || path.starts_with('~')
            || path.contains('\0')
            || path.contains('\n')
            || path
                .split('/')
                .any(|segment| segment.is_empty() || segment == "." || segment == "..");
        if bad {
            return Err(CliError::Usage(format!(
                "--paths must be relative files inside the checkout, not {path}"
            )));
        }
        out.push(path);
    }
    Ok(out)
}

fn commit_sha_from_log(stdout: &str) -> Result<String, CliError> {
    let hash = stdout.split_whitespace().next().unwrap_or("");
    if hash.len() < 7 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(CliError::Other(format!(
            "could not read the OpenClaw commit SHA: {stdout}"
        )));
    }
    Ok(hash.to_string())
}

fn api_get(api: &mut dyn GithubApi, path: &str) -> Result<Value, CliError> {
    api.call("GET", path, None).map_err(map_github_error)
}

fn map_github_error(error: GithubCallError) -> CliError {
    let message = clip(&error.message);
    match error.status {
        Some(401 | 403) => CliError::Auth(message),
        Some(404) => CliError::NotFound(message),
        Some(422) => CliError::Usage(message),
        _ => CliError::Other(message),
    }
}

fn clip(message: &str) -> String {
    let trimmed = message.trim();
    if trimmed.chars().count() <= MAX_ERROR_CHARS {
        return trimmed.to_string();
    }
    let mut out = trimmed.chars().take(MAX_ERROR_CHARS).collect::<String>();
    out.push_str("...");
    out
}

fn validate_repo(repo: &str) -> Result<String, CliError> {
    let repo = repo.trim();
    let mut parts = repo.split('/');
    let owner = parts.next().unwrap_or("");
    let name = parts.next().unwrap_or("");
    if parts.next().is_some() || !is_github_name(owner) || !is_github_name(name) {
        return Err(CliError::Usage(
            "repo must be owner/name, for example huladesk/hulabill".into(),
        ));
    }
    Ok(format!("{owner}/{name}"))
}

fn is_github_name(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    value.len() <= 100
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

fn validate_branch_name(branch: &str, label: &str) -> Result<String, CliError> {
    let branch = branch.trim();
    if branch.is_empty()
        || branch.len() > 200
        || branch.starts_with('-')
        || branch.starts_with('/')
        || branch.ends_with('/')
        || branch.ends_with(".lock")
        || branch.contains("//")
        || branch.contains("..")
        || branch.contains('@')
        || branch.chars().any(|c| {
            c.is_whitespace()
                || c.is_control()
                || matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
        })
    {
        return Err(CliError::Usage(format!(
            "{label} must be a plain branch name without spaces or '..'"
        )));
    }
    Ok(branch.to_string())
}

fn validate_openclaw_cwd(cwd: &str) -> Result<String, CliError> {
    let cwd = cwd.trim().replace('\\', "/");
    if cwd.is_empty() || cwd.contains('\0') {
        return Err(CliError::Usage(
            "cwd must be the OpenClaw checkout under Hula/, for example Hula/products/hulabill"
                .into(),
        ));
    }
    let mut segments = Vec::new();
    for segment in cwd.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err(CliError::Usage("cwd must stay under Hula/".into()));
        }
        segments.push(segment);
    }
    if segments.first().copied() != Some("Hula") || segments.len() < 2 {
        return Err(CliError::Usage(
            "cwd must be the OpenClaw checkout under Hula/, for example Hula/products/hulabill"
                .into(),
        ));
    }
    Ok(segments.join("/"))
}

fn bounded_text(
    value: &str,
    label: &str,
    max_chars: usize,
    allow_empty: bool,
) -> Result<String, CliError> {
    let value = value.trim();
    if value.is_empty() && !allow_empty {
        return Err(CliError::Usage(format!("{label} is required")));
    }
    if value.chars().count() > max_chars {
        return Err(CliError::Usage(format!(
            "{label} exceeds {max_chars} characters"
        )));
    }
    Ok(value.to_string())
}

/// Mac `gh` login used for author and committer.
///
/// `gh api user` is the account the GitHub CLI is logged in as. The profile
/// name is the author name, or the login when GitHub has no name. The profile
/// email is used when it is public. A private email becomes
/// `{id}+{login}@users.noreply.github.com`. This is not the agent display name.
fn resolve_gh_identity() -> Result<GhIdentity, CliError> {
    let user = gh_api_get("user")?;
    identity_from_user(&user)
}

fn identity_from_user(user: &Value) -> Result<GhIdentity, CliError> {
    let login = user
        .get("login")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            CliError::Auth("gh is logged in, but the GitHub user login was empty".into())
        })?
        .to_string();
    let id = user
        .get("id")
        .and_then(Value::as_u64)
        .ok_or_else(|| CliError::Auth("gh user response did not include an id".into()))?;
    let name = user
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| login.clone());
    let email = user
        .get("email")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{id}+{login}@users.noreply.github.com"));
    Ok(GhIdentity { name, email, login })
}

fn gh_api_get(path: &str) -> Result<Value, CliError> {
    GhCli
        .call("GET", path, None)
        .map_err(|error| match error.status {
            Some(401 | 403) => CliError::Auth(clip(&error.message)),
            _ => CliError::Other(format!(
                "could not read the gh login ({path}): {}",
                clip(&error.message)
            )),
        })
}

#[derive(Debug, Deserialize)]
struct OpenClawGrant {
    url: String,
    authorization: String,
    #[serde(default)]
    headers: Option<std::collections::HashMap<String, String>>,
}

fn load_openclaw_grant() -> Result<OpenClawGrant, CliError> {
    let path = claude_json_path();
    let raw = std::fs::read_to_string(&path).map_err(|error| {
        CliError::Other(format!(
            "OpenClaw workspace is not configured (failed to read {}): {error}",
            path.display()
        ))
    })?;
    let value: Value = serde_json::from_str(&raw).map_err(|error| {
        CliError::Other(format!(
            "OpenClaw workspace config is not valid JSON ({}): {error}",
            path.display()
        ))
    })?;
    let server = value
        .pointer(&format!("/mcpServers/{OPENCLAW_MCP_NAME}"))
        .ok_or_else(|| {
            CliError::Other(
                "OpenClaw workspace is not connected. Connect it in Buzz, then retry.".into(),
            )
        })?;
    let url = server
        .get("url")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| CliError::Other("openclaw-workspace MCP url is missing".into()))?
        .to_string();
    let headers = server.get("headers").and_then(Value::as_object).map(|map| {
        map.iter()
            .filter_map(|(key, value)| value.as_str().map(|text| (key.clone(), text.to_string())))
            .collect::<std::collections::HashMap<_, _>>()
    });
    let authorization = headers
        .as_ref()
        .and_then(|map| {
            map.iter()
                .find(|(key, _)| key.eq_ignore_ascii_case("authorization"))
                .map(|(_, value)| value.clone())
        })
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            CliError::Other("openclaw-workspace MCP Authorization header is missing".into())
        })?;
    Ok(OpenClawGrant {
        url,
        authorization,
        headers,
    })
}

fn claude_json_path() -> PathBuf {
    if let Ok(dir) = std::env::var("CLAUDE_CONFIG_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return Path::new(trimmed).join(".claude.json");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude.json")
}

fn remote_repo_from_openclaw(grant: &OpenClawGrant, cwd: &str) -> Result<String, CliError> {
    let result = openclaw_exec(
        grant,
        cwd,
        json!(["git", "remote", "get-url", "origin"]),
        None,
    )?;
    let stdout = result
        .get("stdout")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    parse_github_remote(stdout).ok_or_else(|| {
        CliError::Other(format!(
            "OpenClaw checkout {cwd} origin is not a GitHub remote: {stdout}"
        ))
    })
}

fn parse_github_remote(remote: &str) -> Option<String> {
    let remote = remote.trim();
    if remote.is_empty() {
        return None;
    }
    let rest = if let Some(rest) = remote.strip_prefix("git@github.com:") {
        rest
    } else if let Some(rest) = remote.strip_prefix("ssh://git@github.com/") {
        rest
    } else if let Some(rest) = remote
        .strip_prefix("https://github.com/")
        .or_else(|| remote.strip_prefix("http://github.com/"))
    {
        rest
    } else {
        return None;
    };
    let rest = rest.trim_end_matches('/').trim_end_matches(".git");
    let mut parts = rest.split('/');
    let owner = parts.next()?;
    let name = parts.next()?;
    if parts.next().is_some() || !is_github_name(owner) || !is_github_name(name) {
        return None;
    }
    Some(format!("{owner}/{name}"))
}

fn repo_names_match(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
}

fn openclaw_exec(
    grant: &OpenClawGrant,
    cwd: &str,
    argv: Value,
    identity: Option<&GhIdentity>,
) -> Result<Value, CliError> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| CliError::Other(format!("failed to build HTTP client: {error}")))?;
    let session = openclaw_initialize(&client, grant)?;
    let mut arguments = json!({ "argv": argv, "cwd": cwd });
    if let Some(identity) = identity {
        arguments["gitIdentity"] = json!({
            "name": identity.name,
            "email": identity.email,
        });
    }
    let body = openclaw_post(
        &client,
        grant,
        session.as_deref(),
        json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": { "name": "exec", "arguments": arguments }
        }),
    )?;
    let payload = parse_mcp_payload(&body)?;
    if let Some(message) = payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        return Err(CliError::Other(format!("OpenClaw exec failed: {message}")));
    }
    let result = payload.get("result").cloned().unwrap_or(Value::Null);
    if result
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        let text = mcp_text(&result);
        return Err(CliError::Other(format!(
            "OpenClaw exec failed: {}",
            clip(&text)
        )));
    }
    let parsed = mcp_json(&result).ok_or_else(|| {
        CliError::Other(format!(
            "OpenClaw exec returned no JSON payload: {}",
            clip(&mcp_text(&result))
        ))
    })?;
    let exit_code = parsed.get("exitCode").and_then(Value::as_i64);
    if exit_code.is_some_and(|code| code != 0) {
        let stderr = parsed
            .get("stderr")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let stdout = parsed
            .get("stdout")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "command failed"
        };
        return Err(CliError::Other(format!("OpenClaw {cwd}: {}", clip(detail))));
    }
    Ok(parsed)
}

fn openclaw_initialize(
    client: &reqwest::blocking::Client,
    grant: &OpenClawGrant,
) -> Result<Option<String>, CliError> {
    let (session, body) = openclaw_post_with_session(
        client,
        grant,
        None,
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "buzz-cli", "version": "0" }
            }
        }),
    )?;
    let payload = parse_mcp_payload(&body)?;
    if let Some(message) = payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        return Err(CliError::Other(format!(
            "OpenClaw initialize failed: {message}"
        )));
    }
    let _ = openclaw_post_with_session(
        client,
        grant,
        session.as_deref(),
        json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }),
    );
    Ok(session)
}

fn openclaw_post(
    client: &reqwest::blocking::Client,
    grant: &OpenClawGrant,
    session_id: Option<&str>,
    body: Value,
) -> Result<String, CliError> {
    let (_session, text) = openclaw_post_with_session(client, grant, session_id, body)?;
    Ok(text)
}

fn openclaw_post_with_session(
    client: &reqwest::blocking::Client,
    grant: &OpenClawGrant,
    session_id: Option<&str>,
    body: Value,
) -> Result<(Option<String>, String), CliError> {
    let mut request = client
        .post(&grant.url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(
            reqwest::header::ACCEPT,
            "application/json, text/event-stream",
        )
        .header(reqwest::header::AUTHORIZATION, grant.authorization.as_str())
        .header("mcp-protocol-version", "2024-11-05");
    if let Some(session_id) = session_id {
        request = request.header("mcp-session-id", session_id);
    }
    if let Some(headers) = &grant.headers {
        for (key, value) in headers {
            if key.eq_ignore_ascii_case("authorization") {
                continue;
            }
            request = request.header(key.as_str(), value.as_str());
        }
    }
    let response = request
        .json(&body)
        .send()
        .map_err(|error| CliError::Other(format!("OpenClaw MCP request failed: {error}")))?;
    let status = response.status();
    let session = response
        .headers()
        .get("mcp-session-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(CliError::Auth(
            "OpenClaw MCP rejected credentials. Refresh the connection and try again.".into(),
        ));
    }
    let text = response.text().unwrap_or_default();
    if !status.is_success() {
        return Err(CliError::Other(format!(
            "OpenClaw MCP returned HTTP {}: {}",
            status.as_u16(),
            clip(&text)
        )));
    }
    Ok((session, text))
}

fn parse_mcp_payload(body: &str) -> Result<Value, CliError> {
    let trimmed = body.trim();
    if trimmed.starts_with('{') {
        return serde_json::from_str(trimmed)
            .map_err(|error| CliError::Other(format!("OpenClaw returned invalid JSON: {error}")));
    }
    let mut last = None;
    for line in trimmed.lines() {
        let Some(data) = line.trim().strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(data) {
            last = Some(value);
        }
    }
    last.ok_or_else(|| CliError::Other("OpenClaw returned an empty response.".into()))
}

fn mcp_text(result: &Value) -> String {
    if let Some(content) = result.get("content").and_then(Value::as_array) {
        let mut parts = Vec::new();
        for item in content {
            if item.get("type").and_then(Value::as_str) == Some("text") {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    parts.push(text);
                }
            }
        }
        if !parts.is_empty() {
            return parts.join("\n");
        }
    }
    result.to_string()
}

fn mcp_json(result: &Value) -> Option<Value> {
    let text = mcp_text(result);
    let trimmed = text.trim();
    if trimmed.starts_with('{') {
        serde_json::from_str(trimmed).ok()
    } else {
        None
    }
}

struct GhCli;

impl GithubApi for GhCli {
    fn call(
        &mut self,
        method: &str,
        path: &str,
        body: Option<&Value>,
    ) -> Result<Value, GithubCallError> {
        let mut cmd = Command::new("gh");
        cmd.arg("api")
            .arg("--method")
            .arg(method)
            .arg("-H")
            .arg("Accept: application/vnd.github+json")
            .arg(path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if body.is_some() {
            cmd.arg("--input").arg("-").stdin(Stdio::piped());
        } else {
            cmd.stdin(Stdio::null());
        }
        let mut child = cmd.spawn().map_err(|error| GithubCallError {
            status: None,
            message: if error.kind() == std::io::ErrorKind::NotFound {
                "gh is not installed. The Mac GitHub CLI login is required.".into()
            } else {
                format!("failed to start gh: {error}")
            },
        })?;
        if let Some(body) = body {
            let mut stdin = child.stdin.take().ok_or_else(|| GithubCallError {
                status: None,
                message: "failed to write the gh request body".into(),
            })?;
            serde_json::to_writer(&mut stdin, body).map_err(|error| GithubCallError {
                status: None,
                message: format!("failed to write the gh request body: {error}"),
            })?;
            drop(stdin);
        }
        let output = child.wait_with_output().map_err(|error| GithubCallError {
            status: None,
            message: format!("gh did not finish: {error}"),
        })?;
        if output.status.success() {
            return serde_json::from_slice(&output.stdout).map_err(|error| GithubCallError {
                status: None,
                message: format!("gh returned a response that is not JSON: {error}"),
            });
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        let status = http_status(&stderr).or_else(|| http_status(&stdout));
        Err(GithubCallError { status, message })
    }
}

fn http_status(text: &str) -> Option<u16> {
    let marker = "(HTTP ";
    let start = text.rfind(marker)?;
    let digits: String = text[start + marker.len()..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    struct Scripted {
        steps: VecDeque<Result<Value, GithubCallError>>,
        calls: Vec<(String, String, Option<Value>)>,
    }

    impl GithubApi for Scripted {
        fn call(
            &mut self,
            method: &str,
            path: &str,
            body: Option<&Value>,
        ) -> Result<Value, GithubCallError> {
            self.calls
                .push((method.to_string(), path.to_string(), body.cloned()));
            self.steps.pop_front().unwrap_or_else(|| {
                Err(GithubCallError {
                    status: None,
                    message: format!("unexpected {method} {path}"),
                })
            })
        }
    }

    fn args<'a>(branch: &'a str, dry_run: bool) -> PublishArgs<'a> {
        PublishArgs {
            repo: "huladesk/hulabill",
            base: "main",
            branch,
            message: "docs: add a research note",
            title: "Add a research note",
            body: "Opened from OpenClaw checkout.",
            paths: &[],
            draft: false,
            cwd: "Hula/products/hulabill",
            dry_run,
        }
    }

    fn spec(branch: &str, dry_run: bool) -> PublishSpec {
        parse_spec(&args(branch, dry_run)).expect("spec")
    }

    #[test]
    fn rejects_a_branch_that_would_move_main() {
        let error = parse_spec(&args("main", false)).expect_err("main is not a new branch");
        assert!(matches!(error, CliError::Usage(_)));
    }

    #[test]
    fn rejects_a_cwd_outside_hula() {
        let error = parse_spec(&PublishArgs {
            cwd: "/Users/jm/Documents/Hula/products/hulabill",
            ..args("docs/note", false)
        })
        .expect_err("mac path");
        assert!(matches!(error, CliError::Usage(message) if message.contains("Hula/")));
    }

    #[test]
    fn gh_identity_uses_the_logged_in_user_not_an_agent_name() {
        let named = identity_from_user(&json!({
            "login": "ghuser",
            "id": 42,
            "name": "GH User",
            "email": "gh@example.com"
        }))
        .unwrap();
        assert_eq!(named.name, "GH User");
        assert_eq!(named.email, "gh@example.com");
        let private_email = identity_from_user(&json!({
            "login": "ghuser",
            "id": 42,
            "name": null,
            "email": null
        }))
        .unwrap();
        assert_eq!(private_email.name, "ghuser");
        assert_eq!(private_email.email, "42+ghuser@users.noreply.github.com");
    }

    #[test]
    fn parses_github_remotes() {
        assert_eq!(
            parse_github_remote("git@github.com:huladesk/hulabill.git").as_deref(),
            Some("huladesk/hulabill")
        );
        assert_eq!(
            parse_github_remote("https://github.com/huladesk/hulabill").as_deref(),
            Some("huladesk/hulabill")
        );
        assert_eq!(parse_github_remote("/tmp/not-github"), None);
    }

    #[test]
    fn dry_run_reads_the_base_and_creates_nothing() {
        // Dry-run still needs gh identity and OpenClaw grant in the real
        // path. This unit covers the GitHub GET half with a scripted API by
        // calling only the validation that does not touch the network.
        let parsed = spec("docs/note", true);
        assert_eq!(parsed.cwd, "Hula/products/hulabill");
        assert!(parsed.dry_run);
        let mut api = Scripted {
            steps: VecDeque::from([Ok(json!({"object": {"sha": "abc123"}}))]),
            calls: Vec::new(),
        };
        let base = api_get(&mut api, "repos/huladesk/hulabill/git/ref/heads/main").expect("base");
        assert_eq!(base["object"]["sha"], "abc123");
        assert_eq!(api.calls.len(), 1);
        assert!(api.calls.iter().all(|(method, _, _)| method == "GET"));
    }

    fn gh_user() -> GhIdentity {
        GhIdentity {
            name: "GH User".into(),
            email: "42+gh@users.noreply.github.com".into(),
            login: "gh".into(),
        }
    }

    struct ScriptedGit {
        steps: VecDeque<Result<Value, CliError>>,
        calls: Vec<(String, Vec<String>, Option<GhIdentity>)>,
    }

    impl OpenClawGit for ScriptedGit {
        fn exec(
            &mut self,
            cwd: &str,
            argv: &[String],
            identity: Option<&GhIdentity>,
        ) -> Result<Value, CliError> {
            self.calls
                .push((cwd.to_string(), argv.to_vec(), identity.cloned()));
            self.steps
                .pop_front()
                .unwrap_or_else(|| Err(CliError::Other(format!("unexpected git {argv:?}"))))
        }
    }

    fn status_step(stdout: &str) -> Result<Value, CliError> {
        Ok(json!({"stdout": stdout, "exitCode": 0}))
    }

    fn ok_step() -> Result<Value, CliError> {
        Ok(json!({"stdout": "", "exitCode": 0}))
    }

    #[test]
    fn status_sb_reads_branch_ahead_and_dirty() {
        let clean = parse_status_sb("## feature...origin/feature\n").unwrap();
        assert_eq!(clean.branch.as_deref(), Some("feature"));
        assert!(!clean.dirty);
        assert_eq!(clean.ahead, 0);
        assert!(clean.has_upstream);
        let ahead = parse_status_sb("## feature...origin/feature [ahead 2]\n").unwrap();
        assert_eq!(ahead.ahead, 2);
        let dirty = parse_status_sb("## main...origin/main\n M README.md\n?? new.txt\n").unwrap();
        assert!(dirty.dirty);
        assert!(is_protected_branch(dirty.branch.as_deref().unwrap()));
        let detached = parse_status_sb("## HEAD (no branch)\n").unwrap();
        assert!(detached.branch.is_none());
    }

    #[test]
    fn publish_from_main_creates_a_branch_and_commits_as_the_gh_user() {
        let paths = vec!["README.md".to_string()];
        let parsed = parse_spec(&PublishArgs {
            paths: &paths,
            ..args("docs/note", false)
        })
        .expect("spec");
        let identity = gh_user();
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Err(GithubCallError {
                    status: Some(404),
                    message: "missing (HTTP 404)".into(),
                }),
                Ok(json!({"number": 9, "html_url": "https://github.com/huladesk/hulabill/pull/9"})),
            ]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([
                status_step("## main\n M README.md\n"),
                ok_step(),
                ok_step(),
                ok_step(),
                Ok(json!({"stdout": "abcdef1 note\n", "exitCode": 0})),
                ok_step(),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&parsed, &mut api, &identity, "huladesk/hulabill", &mut git)
            .expect("publish");
        assert_eq!(result["commit"], "abcdef1");
        assert_eq!(result["createdBranch"], true);
        assert_eq!(result["committed"], true);
        assert_eq!(result["author"]["email"], identity.email);
        assert_eq!(result["pullRequest"]["number"], 9);
        assert!(api.calls.iter().all(|(_, path, _)| {
            !path.contains("/git/commits")
                && !path.contains("/git/blobs")
                && !path.contains("/git/trees")
                && !path.contains("/git/refs")
        }));
        assert_eq!(api.calls.last().map(|call| call.0.as_str()), Some("POST"));
        let commit = git
            .calls
            .iter()
            .find(|(_, argv, _)| argv.get(1).map(String::as_str) == Some("commit"))
            .expect("commit");
        assert_eq!(
            commit
                .2
                .as_ref()
                .map(|who| (who.name.as_str(), who.email.as_str())),
            Some(("GH User", "42+gh@users.noreply.github.com"))
        );
        assert!(git
            .calls
            .iter()
            .any(|(_, argv, _)| *argv == ["git", "push", "origin", "docs/note"]));
        assert!(git
            .calls
            .iter()
            .any(|(_, argv, _)| *argv == ["git", "checkout", "-b", "docs/note"]));
        assert!(git.calls.iter().any(|(_, argv, _)| argv
            == &[
                "git".to_string(),
                "add".to_string(),
                "--".to_string(),
                "README.md".to_string()
            ]));
        assert!(git
            .calls
            .iter()
            .all(
                |(_, argv, _)| argv.get(1).map(String::as_str) != Some("add")
                    || argv.get(2).map(String::as_str) == Some("--")
            ));
        let pull = api
            .calls
            .iter()
            .find(|call| call.0 == "POST")
            .expect("pull");
        assert_eq!(pull.2.as_ref().unwrap()["draft"], false);
    }

    #[test]
    fn the_skill_branch_is_committed_without_switching() {
        let paths = vec!["README.md".to_string()];
        let parsed = parse_spec(&PublishArgs {
            paths: &paths,
            ..args("docs/note", false)
        })
        .expect("spec");
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Ok(json!({"number": 4, "html_url": "https://github.com/huladesk/hulabill/pull/4"})),
            ]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([
                status_step("## docs/note...origin/docs/note\n M README.md\n?? new.txt\n"),
                ok_step(),
                ok_step(),
                Ok(json!({"stdout": "bbbbbbb note\n", "exitCode": 0})),
                ok_step(),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect("publish");
        assert_eq!(result["branch"], "docs/note");
        assert_eq!(result["createdBranch"], false);
        assert_eq!(result["committed"], true);
        assert_eq!(result["pushed"], true);
        assert!(git
            .calls
            .iter()
            .all(|(_, argv, _)| argv.get(1).map(String::as_str) != Some("checkout")));
        assert!(git.calls.iter().any(|(_, argv, _)| argv
            == &[
                "git".to_string(),
                "add".to_string(),
                "--".to_string(),
                "README.md".to_string()
            ]));
        assert!(git
            .calls
            .iter()
            .all(|(_, argv, _)| *argv != ["git", "add", "-A"]));
        assert!(git
            .calls
            .iter()
            .any(|(_, argv, _)| *argv == ["git", "push", "origin", "docs/note"]));
        assert!(api
            .calls
            .iter()
            .all(|(_, path, _)| !path.contains("/git/ref/heads/docs/note")));
    }

    #[test]
    fn a_clean_ahead_branch_is_pushed_without_an_empty_commit() {
        let parsed = spec("docs/note", false);
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Ok(json!({"number": 5, "html_url": "https://github.com/huladesk/hulabill/pull/5"})),
            ]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([
                status_step("## docs/note...origin/docs/note [ahead 2]\n"),
                Ok(json!({"stdout": "ccccccc note\n", "exitCode": 0})),
                ok_step(),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect("publish");
        assert_eq!(result["committed"], false);
        assert_eq!(result["pushed"], true);
        assert_eq!(result["commit"], "ccccccc");
        assert!(git
            .calls
            .iter()
            .all(|(_, argv, _)| argv.get(1).map(String::as_str) != Some("commit")));
        assert!(git
            .calls
            .iter()
            .any(|(_, argv, _)| *argv == ["git", "push", "origin", "docs/note"]));
        assert_eq!(result["branch"], "docs/note");
    }

    #[test]
    fn an_already_pushed_branch_reports_the_open_pull_request() {
        let parsed = spec("docs/note", false);
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Err(GithubCallError {
                    status: Some(422),
                    message: "A pull request already exists for huladesk:docs/note (HTTP 422)"
                        .into(),
                }),
                Ok(json!([{
                    "number": 9,
                    "html_url": "https://github.com/huladesk/hulabill/pull/9",
                    "head": {"ref": "docs/note"},
                    "base": {"ref": "main"}
                }])),
            ]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([
                status_step("## docs/note...origin/docs/note\n"),
                Ok(json!({"stdout": "ddddddd note\n", "exitCode": 0})),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect("publish");
        assert_eq!(result["alreadyPublished"], true);
        assert_eq!(result["committed"], false);
        assert_eq!(result["pushed"], false);
        assert_eq!(result["pullRequest"]["number"], 9);
        assert!(result["message"]
            .as_str()
            .unwrap()
            .contains("already pushed"));
        assert!(result["message"].as_str().unwrap().contains("#9"));
        assert!(git
            .calls
            .iter()
            .all(|(_, argv, _)| argv.get(1).map(String::as_str) != Some("push")));
    }

    #[test]
    fn a_new_branch_name_that_already_exists_is_not_moved() {
        let paths = vec!["README.md".to_string()];
        let parsed = parse_spec(&PublishArgs {
            paths: &paths,
            ..args("docs/note", false)
        })
        .expect("spec");
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Ok(json!({"object": {"sha": "already"}})),
            ]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([status_step("## main\n M README.md\n")]),
            calls: Vec::new(),
        };
        let error = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect_err("existing branch");
        assert!(matches!(error, CliError::Usage(message) if message.contains("not moved")));
        assert!(git
            .calls
            .iter()
            .all(|(_, argv, _)| argv.get(1).map(String::as_str) != Some("checkout")));
        assert!(api
            .calls
            .iter()
            .all(|(_, path, _)| !path.ends_with("/pulls")));
    }

    #[test]
    fn a_clean_main_checkout_does_not_create_an_empty_commit() {
        let parsed = spec("docs/note", false);
        let mut api = Scripted {
            steps: VecDeque::from([Ok(json!({"object": {"sha": "basecommit"}}))]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([status_step("## main\n")]),
            calls: Vec::new(),
        };
        let error = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect_err("clean main");
        assert!(matches!(error, CliError::Usage(message) if message.contains("nothing to commit")));
        assert_eq!(git.calls.len(), 1);
    }

    #[test]
    fn openclaw_cwd_keeps_nested_products() {
        assert_eq!(
            validate_openclaw_cwd("Hula/products/claimminer/desktop").unwrap(),
            "Hula/products/claimminer/desktop"
        );
        assert!(validate_openclaw_cwd("Hula").is_err());
        assert!(validate_openclaw_cwd("Hula/../elsewhere").is_err());
        assert_eq!(
            validate_openclaw_cwd("Hula/products/hulabill/.worktrees/bill-456").unwrap(),
            "Hula/products/hulabill/.worktrees/bill-456"
        );
    }

    #[test]
    fn a_different_branch_is_not_published() {
        let paths = vec!["README.md".to_string()];
        let parsed = parse_spec(&PublishArgs {
            paths: &paths,
            ..args("docs/note", false)
        })
        .expect("spec");
        let mut api = Scripted {
            steps: VecDeque::from([Ok(json!({"object": {"sha": "basecommit"}}))]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([status_step("## feature\n M README.md\n")]),
            calls: Vec::new(),
        };
        let error = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect_err("wrong branch");
        assert!(
            matches!(error, CliError::Usage(message) if message.contains("not docs/note") && message.contains("not moved"))
        );
        assert!(git
            .calls
            .iter()
            .all(|(_, argv, _)| argv.get(1).map(String::as_str) != Some("add")));
        assert!(api
            .calls
            .iter()
            .all(|(_, path, _)| !path.ends_with("/pulls")));
    }

    #[test]
    fn skill_paths_do_not_stage_unrelated_files_and_draft_is_sent() {
        let paths = vec!["plans/slug/impl/BILL-456.md".to_string()];
        let parsed = parse_spec(&PublishArgs {
            paths: &paths,
            title: "BILL-456: Operator sees retry count",
            body: "Fixes BILL-456",
            draft: true,
            ..args("jm/BILL-456-operator-sees-retry-count", false)
        })
        .expect("spec");
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Ok(
                    json!({"number": 12, "html_url": "https://github.com/huladesk/hulabill/pull/12"}),
                ),
            ]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([
                status_step("## jm/BILL-456-operator-sees-retry-count\n M plans/slug/impl/BILL-456.md\n M unrelated.rs\n"),
                ok_step(),
                ok_step(),
                Ok(json!({"stdout": "eeeeeee note\n", "exitCode": 0})),
                ok_step(),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect("publish");
        assert_eq!(result["committed"], true);
        assert_eq!(result["branch"], "jm/BILL-456-operator-sees-retry-count");
        let add = git
            .calls
            .iter()
            .find(|(_, argv, _)| argv.get(1).map(String::as_str) == Some("add"))
            .expect("add");
        assert_eq!(
            add.1,
            vec!["git", "add", "--", "plans/slug/impl/BILL-456.md"]
        );
        let pull = api
            .calls
            .iter()
            .find(|call| call.0 == "POST")
            .expect("pull");
        assert_eq!(pull.2.as_ref().unwrap()["draft"], true);
        assert_eq!(pull.2.as_ref().unwrap()["body"], "Fixes BILL-456");
        assert_eq!(
            pull.2.as_ref().unwrap()["head"],
            "jm/BILL-456-operator-sees-retry-count"
        );
    }

    #[test]
    fn a_commit_step_without_a_title_does_not_open_a_pull_request() {
        let paths = vec!["plans/slug/impl/BILL-456.md".to_string()];
        let parsed = parse_spec(&PublishArgs {
            paths: &paths,
            title: "",
            body: "",
            ..args("docs/note", false)
        })
        .expect("spec");
        let mut api = Scripted {
            steps: VecDeque::from([Ok(json!({"object": {"sha": "basecommit"}}))]),
            calls: Vec::new(),
        };
        let mut git = ScriptedGit {
            steps: VecDeque::from([
                status_step("## docs/note\n M plans/slug/impl/BILL-456.md\n M unrelated.rs\n"),
                ok_step(),
                ok_step(),
                Ok(json!({"stdout": "fffffff note\n", "exitCode": 0})),
                ok_step(),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&parsed, &mut api, &gh_user(), "huladesk/hulabill", &mut git)
            .expect("publish");
        assert_eq!(result["committed"], true);
        assert_eq!(result["pushed"], true);
        assert!(api.calls.iter().all(|(method, _, _)| method == "GET"));
        assert!(git
            .calls
            .iter()
            .all(|(_, argv, _)| *argv != ["git", "add", "-A"]));
    }

    #[test]
    fn rejects_a_path_that_leaves_the_checkout() {
        let paths = vec!["../secret".to_string()];
        let error = parse_spec(&PublishArgs {
            paths: &paths,
            ..args("docs/note", false)
        })
        .expect_err("path");
        assert!(matches!(error, CliError::Usage(message) if message.contains("--paths")));
    }
}
