//! Publish file contents as a GitHub commit and pull request.
//!
//! The commit and pull request use the `gh` login on this machine. The
//! command does not clone a repository and it does not move the base branch.

use crate::error::CliError;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::Read;
use std::process::{Command, Stdio};

const MAX_FILES: usize = 64;
const MAX_CONTENT_BYTES: usize = 1_048_576;
const MAX_MESSAGE_CHARS: usize = 65_536;
const MAX_TITLE_CHARS: usize = 256;
const MAX_BODY_CHARS: usize = 65_536;
const MAX_ERROR_CHARS: usize = 400;

/// One file to add, replace, or delete on the new commit.
#[derive(Debug, Clone, PartialEq, Eq)]
struct FileChange {
    path: String,
    content: Option<String>,
    encoding: BlobEncoding,
    delete: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BlobEncoding {
    Utf8,
    Base64,
}

/// Validated publish request. The base branch is read, then a new branch is created.
#[derive(Debug, Clone, PartialEq, Eq)]
struct PublishSpec {
    repo: String,
    base: String,
    branch: String,
    message: String,
    title: String,
    body: String,
    files: Vec<FileChange>,
    dry_run: bool,
}

#[derive(Debug, Deserialize)]
struct FilesDocument {
    files: Vec<FileDocument>,
}

#[derive(Debug, Deserialize)]
struct FileDocument {
    path: String,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    encoding: Option<String>,
    #[serde(default)]
    delete: bool,
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

/// Arguments for [`cmd_publish`].
pub struct PublishArgs<'a> {
    /// GitHub repository as `owner/name`.
    pub repo: &'a str,
    /// Branch the new commit starts from.
    pub base: &'a str,
    /// New branch name. This branch is created and is never the base branch.
    pub branch: &'a str,
    /// Commit message.
    pub message: &'a str,
    /// Pull request title.
    pub title: &'a str,
    /// Pull request body. Empty is allowed.
    pub body: &'a str,
    /// JSON file of changes, or `-` to read stdin.
    pub files: &'a str,
    /// Read the base commit and print the plan. Create nothing.
    pub dry_run: bool,
}

/// Create a GitHub commit and pull request from a JSON file list.
///
/// The document is `{"files":[{"path":"rel/file.md","content":"..."},{"path":"old.txt","delete":true}]}`.
/// `encoding` may be `utf-8` (default) or `base64`.
pub fn cmd_publish(args: PublishArgs<'_>) -> Result<(), CliError> {
    let raw = read_files_json(args.files)?;
    let spec = parse_spec(&args, &raw)?;
    let mut api = GhCli;
    let result = publish_changes(&spec, &mut api)?;
    println!(
        "{}",
        serde_json::to_string(&result).map_err(|e| CliError::Other(format!("json: {e}")))?
    );
    Ok(())
}

fn read_files_json(files: &str) -> Result<String, CliError> {
    if files == "-" {
        let mut raw = String::new();
        std::io::stdin()
            .read_to_string(&mut raw)
            .map_err(|e| CliError::Usage(format!("failed to read stdin: {e}")))?;
        if raw.trim().is_empty() {
            return Err(CliError::Usage(
                "pass the file list as JSON on stdin".into(),
            ));
        }
        return Ok(raw);
    }
    std::fs::read_to_string(files)
        .map_err(|e| CliError::Usage(format!("failed to read {files}: {e}")))
}

fn parse_spec(args: &PublishArgs<'_>, raw: &str) -> Result<PublishSpec, CliError> {
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
    let message = bounded_text(args.message, "message", MAX_MESSAGE_CHARS, false)?;
    let title = bounded_text(args.title, "title", MAX_TITLE_CHARS, false)?;
    let body = bounded_text(args.body, "body", MAX_BODY_CHARS, true)?;
    let document: FilesDocument = serde_json::from_str(raw)
        .map_err(|e| CliError::Usage(format!("file list is not valid JSON: {e}")))?;
    if document.files.is_empty() {
        return Err(CliError::Usage("file list is empty".into()));
    }
    if document.files.len() > MAX_FILES {
        return Err(CliError::Usage(format!(
            "file list has {} entries; the limit is {MAX_FILES}",
            document.files.len()
        )));
    }
    let mut files = Vec::with_capacity(document.files.len());
    let mut seen = std::collections::BTreeSet::new();
    for file in document.files {
        let path = validate_repo_path(&file.path)?;
        if !seen.insert(path.clone()) {
            return Err(CliError::Usage(format!("duplicate path: {path}")));
        }
        let change = if file.delete {
            if file.content.is_some() {
                return Err(CliError::Usage(format!(
                    "{path}: delete and content are mutually exclusive"
                )));
            }
            FileChange {
                path,
                content: None,
                encoding: BlobEncoding::Utf8,
                delete: true,
            }
        } else {
            let content = file.content.ok_or_else(|| {
                CliError::Usage(format!("{path}: content is required unless delete is true"))
            })?;
            if content.len() > MAX_CONTENT_BYTES {
                return Err(CliError::Usage(format!(
                    "{path}: content exceeds {MAX_CONTENT_BYTES} bytes"
                )));
            }
            let encoding = match file.encoding.as_deref().unwrap_or("utf-8") {
                "utf-8" => BlobEncoding::Utf8,
                "base64" => {
                    validate_base64(&content, &path)?;
                    BlobEncoding::Base64
                }
                other => {
                    return Err(CliError::Usage(format!(
                        "{path}: encoding must be utf-8 or base64, got {other}"
                    )));
                }
            };
            FileChange {
                path,
                content: Some(content),
                encoding,
                delete: false,
            }
        };
        files.push(change);
    }
    Ok(PublishSpec {
        repo,
        base,
        branch,
        message,
        title,
        body,
        files,
        dry_run: args.dry_run,
    })
}

fn publish_changes(spec: &PublishSpec, api: &mut dyn GithubApi) -> Result<Value, CliError> {
    let repo = &spec.repo;
    let base_commit = api_get(api, &format!("repos/{repo}/git/ref/heads/{}", spec.base))?;
    let base_sha = base_commit
        .pointer("/object/sha")
        .and_then(Value::as_str)
        .ok_or_else(|| CliError::Other("base branch response did not include a commit SHA".into()))?
        .to_string();
    let commit = api_get(api, &format!("repos/{repo}/git/commits/{base_sha}"))?;
    let base_tree = commit
        .pointer("/tree/sha")
        .and_then(Value::as_str)
        .ok_or_else(|| CliError::Other("base commit response did not include a tree SHA".into()))?
        .to_string();

    if spec.dry_run {
        return Ok(json!({
            "dryRun": true,
            "repo": spec.repo,
            "base": spec.base,
            "baseSha": base_sha,
            "branch": spec.branch,
            "files": spec.files.iter().filter(|f| !f.delete).map(|f| &f.path).collect::<Vec<_>>(),
            "deletes": spec.files.iter().filter(|f| f.delete).map(|f| &f.path).collect::<Vec<_>>(),
        }));
    }

    let mut tree = Vec::with_capacity(spec.files.len());
    for file in &spec.files {
        if file.delete {
            tree.push(json!({
                "path": file.path,
                "mode": "100644",
                "type": "blob",
                "sha": null,
            }));
            continue;
        }
        let content = file
            .content
            .as_deref()
            .ok_or_else(|| CliError::Other(format!("{}: missing content", file.path)))?;
        let encoding = match file.encoding {
            BlobEncoding::Utf8 => "utf-8",
            BlobEncoding::Base64 => "base64",
        };
        let blob = api_post(
            api,
            &format!("repos/{repo}/git/blobs"),
            json!({ "content": content, "encoding": encoding }),
        )?;
        let sha = blob
            .get("sha")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                CliError::Other(format!(
                    "{}: blob response did not include a SHA",
                    file.path
                ))
            })?
            .to_string();
        tree.push(json!({
            "path": file.path,
            "mode": "100644",
            "type": "blob",
            "sha": sha,
        }));
    }

    let tree_value = api_post(
        api,
        &format!("repos/{repo}/git/trees"),
        json!({ "base_tree": base_tree, "tree": tree }),
    )?;
    let tree_sha = tree_value
        .get("sha")
        .and_then(Value::as_str)
        .ok_or_else(|| CliError::Other("tree response did not include a SHA".into()))?
        .to_string();

    let commit_value = api_post(
        api,
        &format!("repos/{repo}/git/commits"),
        json!({
            "message": spec.message,
            "tree": tree_sha,
            "parents": [base_sha],
        }),
    )?;
    let commit_sha = commit_value
        .get("sha")
        .and_then(Value::as_str)
        .ok_or_else(|| CliError::Other("commit response did not include a SHA".into()))?
        .to_string();

    let ref_result = api.call(
        "POST",
        &format!("repos/{repo}/git/refs"),
        Some(&json!({
            "ref": format!("refs/heads/{}", spec.branch),
            "sha": commit_sha,
        })),
    );
    if let Err(error) = ref_result {
        if error.status == Some(422) {
            return Err(CliError::Usage(format!(
                "branch {} already exists. It was not moved. No pull request was opened.",
                spec.branch
            )));
        }
        return Err(map_github_error(error));
    }

    let pull = match api.call(
        "POST",
        &format!("repos/{repo}/pulls"),
        Some(&json!({
            "title": spec.title,
            "head": spec.branch,
            "base": spec.base,
            "body": spec.body,
        })),
    ) {
        Ok(pull) => pull,
        Err(error) => {
            return Err(CliError::Other(format!(
                "branch {} is on GitHub at {commit_sha}. The pull request was not opened: {}",
                spec.branch,
                clip(&error.message)
            )));
        }
    };
    let number = pull.get("number").and_then(Value::as_u64);
    let url = pull.get("html_url").and_then(Value::as_str);
    Ok(json!({
        "dryRun": false,
        "repo": spec.repo,
        "base": spec.base,
        "branch": spec.branch,
        "commit": commit_sha,
        "pullRequest": {
            "number": number,
            "url": url,
        }
    }))
}

fn api_get(api: &mut dyn GithubApi, path: &str) -> Result<Value, CliError> {
    api.call("GET", path, None).map_err(map_github_error)
}

fn api_post(api: &mut dyn GithubApi, path: &str, body: Value) -> Result<Value, CliError> {
    api.call("POST", path, Some(&body))
        .map_err(map_github_error)
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

fn validate_repo_path(path: &str) -> Result<String, CliError> {
    let path = path.trim();
    if path.is_empty() || path.len() > 512 || path.starts_with('/') || path.contains('\\') {
        return Err(CliError::Usage(format!(
            "path must be a relative repository path: {path}"
        )));
    }
    if path
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(CliError::Usage(format!(
            "path must stay inside the repository: {path}"
        )));
    }
    Ok(path.to_string())
}

fn validate_base64(content: &str, path: &str) -> Result<(), CliError> {
    if content.is_empty() || !content.len().is_multiple_of(4) {
        return Err(CliError::Usage(format!(
            "{path}: base64 content is incomplete"
        )));
    }
    if !content
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '='))
    {
        return Err(CliError::Usage(format!(
            "{path}: base64 content has a character outside the alphabet"
        )));
    }
    Ok(())
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
            body: "Opened from OpenClaw file contents.",
            files: "-",
            dry_run,
        }
    }

    fn spec(raw: &str, branch: &str, dry_run: bool) -> PublishSpec {
        parse_spec(&args(branch, dry_run), raw).expect("spec")
    }

    #[test]
    fn rejects_a_branch_that_would_move_main() {
        let error = parse_spec(
            &args("main", false),
            r#"{"files":[{"path":"research/a.md","content":"hi"}]}"#,
        )
        .expect_err("main is not a new branch");
        assert!(matches!(error, CliError::Usage(_)));
    }

    #[test]
    fn rejects_a_path_that_escapes_the_repository() {
        let error = parse_spec(
            &args("docs/note", false),
            r#"{"files":[{"path":"research/../../.ssh/id_rsa","content":"x"}]}"#,
        )
        .expect_err("escape");
        assert!(matches!(error, CliError::Usage(message) if message.contains("inside")));
    }

    #[test]
    fn dry_run_reads_the_base_and_creates_nothing() {
        let spec = spec(
            r#"{"files":[{"path":"research/a.md","content":"hello"}]}"#,
            "docs/note",
            true,
        );
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "abc123"}})),
                Ok(json!({"tree": {"sha": "tree123"}})),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&spec, &mut api).expect("dry run");
        assert_eq!(result["dryRun"], true);
        assert_eq!(result["baseSha"], "abc123");
        assert_eq!(api.calls.len(), 2);
        assert!(api.calls.iter().all(|(method, _, _)| method == "GET"));
    }

    #[test]
    fn publish_builds_a_new_branch_without_moving_the_base() {
        let spec = spec(
            r#"{"files":[
                {"path":"research/a.md","content":"hello"},
                {"path":"old.txt","delete":true}
            ]}"#,
            "docs/note",
            false,
        );
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Ok(json!({"tree": {"sha": "basetree"}})),
                Ok(json!({"sha": "blob1"})),
                Ok(json!({"sha": "treesha"})),
                Ok(json!({"sha": "commitsha"})),
                Ok(json!({"ref": "refs/heads/docs/note"})),
                Ok(json!({"number": 9, "html_url": "https://github.com/huladesk/hulabill/pull/9"})),
            ]),
            calls: Vec::new(),
        };
        let result = publish_changes(&spec, &mut api).expect("publish");
        assert_eq!(result["commit"], "commitsha");
        assert_eq!(result["pullRequest"]["number"], 9);
        assert_eq!(api.calls[2].0, "POST");
        assert!(api.calls[2].1.ends_with("/git/blobs"));
        let blob = api.calls[2].2.as_ref().expect("blob body");
        assert_eq!(blob["content"], "hello");
        assert_eq!(blob["encoding"], "utf-8");
        let tree = api.calls[3].2.as_ref().expect("tree body");
        assert_eq!(tree["base_tree"], "basetree");
        assert_eq!(tree["tree"][1]["path"], "old.txt");
        assert!(tree["tree"][1]["sha"].is_null());
        let commit = api.calls[4].2.as_ref().expect("commit body");
        assert_eq!(commit["parents"][0], "basecommit");
        assert!(commit.get("author").is_none());
        let reference = api.calls[5].2.as_ref().expect("ref body");
        assert_eq!(reference["ref"], "refs/heads/docs/note");
        assert_eq!(reference["sha"], "commitsha");
        let pull = api.calls[6].2.as_ref().expect("pull body");
        assert_eq!(pull["head"], "docs/note");
        assert_eq!(pull["base"], "main");
    }

    #[test]
    fn an_existing_branch_is_left_in_place() {
        let spec = spec(
            r#"{"files":[{"path":"research/a.md","content":"hello"}]}"#,
            "docs/note",
            false,
        );
        let mut api = Scripted {
            steps: VecDeque::from([
                Ok(json!({"object": {"sha": "basecommit"}})),
                Ok(json!({"tree": {"sha": "basetree"}})),
                Ok(json!({"sha": "blob1"})),
                Ok(json!({"sha": "treesha"})),
                Ok(json!({"sha": "commitsha"})),
                Err(GithubCallError {
                    status: Some(422),
                    message: "Reference already exists (HTTP 422)".into(),
                }),
            ]),
            calls: Vec::new(),
        };
        let error = publish_changes(&spec, &mut api).expect_err("existing branch");
        assert!(matches!(error, CliError::Usage(message) if message.contains("not moved")));
        assert!(api
            .calls
            .iter()
            .all(|(_, path, _)| !path.ends_with("/pulls")));
    }
}
