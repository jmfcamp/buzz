//! Last-mile publish of the agent's final ACP assistant text.
//!
//! VPS last-mile (`buzz-acp` stdio-ACP to OpenClaw) already has
//! `BUZZ_PRIVATE_KEY` / `BUZZ_RELAY_URL` on the harness process. The agent's
//! tool/exec session often does not. Ordinary mention replies must therefore
//! be signed and posted by this harness, not by `buzz messages send`.
//!
//! Some working OpenClaw sessions currently `export` an nsec from a hex file
//! on the Gateway host before `buzz messages send`. That is a session habit,
//! not the product design — it puts private keys in tool transcripts. This
//! module exists so agents do not need to do that.
//!
//! Desktop managed agents that still CLI-send during the turn are not
//! double-posted: if this identity already published a kind:9 in the *same
//! thread* after the mention, the harness skips. A kind:9 in another thread
//! of the same channel does not count — channel-wide dedup silenced a second
//! thread that was admitted alongside the first.

use std::time::Duration;

use nostr::{Alphabet, EventId, SingleLetterTag, Timestamp};
use uuid::Uuid;

use crate::queue::{parse_thread_tags, resolve_reply_anchor, FlushBatch};
use crate::relay::RestClient;

/// Timeout for the dedup query and the publish POST. Last-mile must never
/// stall the prompt-task return path; the caller spawns this work.
const LAST_MILE_TIMEOUT: Duration = Duration::from_secs(5);

/// Clock-skew cushion applied when the triggering event's `created_at` is
/// used as the `since` bound for the self-reply query.
const SINCE_SKEW_SECS: u64 = 2;

/// Destination for a harness-published ordinary reply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplyDestination {
    /// Channel UUID from the triggering `[Context]` batch.
    pub channel_id: Uuid,
    /// `--reply-to` anchor the harness already put in `[Context]`, when any.
    pub reply_to: Option<String>,
    /// Lower bound for "already posted this turn" queries (`created_at`).
    pub since: u64,
}

/// Normalize assistant / channel text for emptiness and equality checks.
pub fn normalize_reply(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Whether the collected ACP assistant text is worth publishing.
pub fn assistant_text_is_publishable(text: &str) -> bool {
    !normalize_reply(text).is_empty()
}

/// Skip harness publish when this identity already landed a reply in this
/// destination after the triggering mention (CLI send, prior last-mile
/// attempt, etc.).
///
/// `existing_self_replies` is already scoped to that destination: the same
/// thread when [`ReplyDestination::reply_to`] is set, otherwise the channel.
/// Any non-empty result set is a skip — not only an exact content match —
/// so Desktop agents that CLI-send a polished reply different from their
/// streamed ACP text do not get a second primary post in that destination.
pub fn should_publish_assistant_reply(text: &str, existing_self_replies: &[String]) -> bool {
    assistant_text_is_publishable(text) && existing_self_replies.is_empty()
}

/// True when `existing` already contains the same (normalized) reply.
#[cfg(test)]
fn existing_replies_include_same(text: &str, existing: &[String]) -> bool {
    let want = normalize_reply(text);
    !want.is_empty() && existing.iter().any(|got| normalize_reply(got) == want)
}

/// Resolve the last-mile destination from the same last-event / reply-anchor
/// rules [`crate::queue::format_prompt`] uses for `[Context]`.
///
/// Profile lookup is omitted: unknown identities fail open as human, matching
/// the prompt formatter's visibility default and the last-mile mention case.
pub fn reply_destination(batch: &FlushBatch) -> Option<ReplyDestination> {
    let last = batch.events.last()?;
    let thread_tags = parse_thread_tags(&last.event);
    let triggering_id = last.event.id.to_hex();
    let sender = last.event.pubkey.to_hex();
    let reply_to = resolve_reply_anchor(&sender, &thread_tags, &triggering_id, None);
    let created_at = last.event.created_at.as_secs();
    Some(ReplyDestination {
        channel_id: batch.channel_id,
        reply_to,
        since: created_at.saturating_sub(SINCE_SKEW_SECS),
    })
}

/// Spawn a best-effort last-mile publish. Never blocks the prompt task.
pub fn spawn_publish_assistant_reply(rest: RestClient, batch: &FlushBatch, text: String) {
    if !assistant_text_is_publishable(&text) {
        return;
    }
    let Some(dest) = reply_destination(batch) else {
        tracing::debug!("last-mile: empty batch — nothing to publish");
        return;
    };
    tokio::spawn(async move {
        if let Err(e) = publish_assistant_reply(&rest, &dest, &text).await {
            tracing::warn!(
                channel = %dest.channel_id,
                "last-mile: failed to publish assistant reply: {e}"
            );
        }
    });
}

/// Query recent kind:9s from this identity, then publish unless one exists.
pub async fn publish_assistant_reply(
    rest: &RestClient,
    dest: &ReplyDestination,
    text: &str,
) -> Result<(), anyhow::Error> {
    if !assistant_text_is_publishable(text) {
        return Ok(());
    }

    match query_self_replies(rest, dest).await {
        Ok(existing) if !should_publish_assistant_reply(text, &existing) => {
            tracing::info!(
                channel = %dest.channel_id,
                existing = existing.len(),
                "last-mile: skipping harness publish; a kind:9 from this identity already landed"
            );
            return Ok(());
        }
        Ok(_) => {}
        Err(e) => {
            // Fail open: last-mile silence is worse than a rare double post.
            tracing::warn!(
                channel = %dest.channel_id,
                "last-mile: dedup query failed ({e}); publishing assistant text"
            );
        }
    }

    post_assistant_reply(rest, dest, text).await
}

async fn query_self_replies(
    rest: &RestClient,
    dest: &ReplyDestination,
) -> Result<Vec<String>, anyhow::Error> {
    use nostr::Filter;

    let h_tag = SingleLetterTag::lowercase(Alphabet::H);
    let mut filter = Filter::new()
        .kind(nostr::Kind::Custom(
            buzz_core::kind::KIND_STREAM_MESSAGE as u16,
        ))
        .author(rest.keys.public_key())
        .custom_tags(h_tag, [dest.channel_id.to_string()])
        .since(Timestamp::from(dest.since))
        .limit(20);

    // Threaded destinations only look at kind:9s that tag this thread root.
    // `build_message` / `ThreadRef` stores a flat reply as
    // `["e", root, "", "reply"]` (root == parent) and a nested reply as
    // `["e", root, "", "root"]` plus a reply marker. `#e` matches either, so
    // another thread's kind:9 in the same channel cannot fill the limit or
    // look like "already landed".
    //
    // `reply_destination` always sets `reply_to`: it passes no profile
    // lookup, so `resolve_reply_anchor` treats the sender as human-facing and
    // anchors the thread root or the triggering event. `None` is only
    // reachable when a caller builds [`ReplyDestination`] directly. That
    // unthreaded destination keeps the channel-wide query so one
    // channel-level CLI-send still dedups.
    if let Some(root) = dest.reply_to.as_deref() {
        let e_tag = SingleLetterTag::lowercase(Alphabet::E);
        filter = filter.custom_tags(e_tag, [root.to_string()]);
    }

    let json = tokio::time::timeout(LAST_MILE_TIMEOUT, rest.query(std::slice::from_ref(&filter)))
        .await
        .map_err(|_| anyhow::anyhow!("dedup query timed out"))?
        .map_err(|e| anyhow::anyhow!("dedup query failed: {e}"))?;

    Ok(self_reply_contents(&json, dest))
}

/// Contents of kind:9s that should suppress a publish to `dest`.
///
/// When `reply_to` is set, only events whose NIP-10 thread root is that id
/// count. A channel-level kind:9 (no reply marker) and a kind:9 rooted in a
/// different thread do not. When `reply_to` is `None`, every returned event
/// counts — the historical channel-wide behavior for an unthreaded destination.
fn self_reply_contents(json: &serde_json::Value, dest: &ReplyDestination) -> Vec<String> {
    json.as_array()
        .map(|events| {
            events
                .iter()
                .filter(|ev| reply_matches_destination(ev, dest))
                .filter_map(|ev| ev.get("content")?.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn reply_matches_destination(event: &serde_json::Value, dest: &ReplyDestination) -> bool {
    let Some(root) = dest.reply_to.as_deref() else {
        return true;
    };
    event_thread_root(event).is_some_and(|got| got.eq_ignore_ascii_case(root))
}

/// Thread root the relay stored on a kind:9, via the shared NIP-10 resolver.
///
/// Flat replies (`root == parent`) carry only `["e", root, "", "reply"]`, and
/// that reply id *is* the root. Nested replies carry a `root` marker. A lone
/// `root` marker or no `e` tag is channel-level (`None`).
fn event_thread_root(event: &serde_json::Value) -> Option<String> {
    let tags = event.get("tags")?.as_array()?;
    let owned: Vec<Vec<String>> = tags
        .iter()
        .filter_map(|tag| {
            let parts = tag.as_array()?;
            Some(
                parts
                    .iter()
                    .filter_map(|part| part.as_str().map(str::to_string))
                    .collect(),
            )
        })
        .collect();
    buzz_core::nip10::parse_thread_markers_from_parts(owned.iter().map(Vec::as_slice))
        .resolve()
        .map(|(root, _parent)| root)
}

/// Extract `content` strings from a `POST /query` array response.
pub fn contents_from_query_response(json: &serde_json::Value) -> Vec<String> {
    json.as_array()
        .map(|events| {
            events
                .iter()
                .filter_map(|ev| ev.get("content")?.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

async fn post_assistant_reply(
    rest: &RestClient,
    dest: &ReplyDestination,
    text: &str,
) -> Result<(), anyhow::Error> {
    let thread_ref = dest.reply_to.as_deref().and_then(thread_ref_from_anchor);
    let builder = buzz_sdk::build_message(
        dest.channel_id,
        text,
        thread_ref.as_ref(),
        &[],
        false,
        &[],
        &[],
    )
    .map_err(|e| anyhow::anyhow!("build_message failed: {e}"))?;
    let event = builder
        .sign_with_keys(&rest.keys)
        .map_err(|e| anyhow::anyhow!("sign failed: {e}"))?;
    tokio::time::timeout(LAST_MILE_TIMEOUT, rest.submit_event(&event))
        .await
        .map_err(|_| anyhow::anyhow!("publish timed out"))?
        .map_err(|e| anyhow::anyhow!("publish failed: {e}"))?;
    tracing::info!(
        channel = %dest.channel_id,
        event_id = %event.id,
        chars = text.len(),
        "last-mile: published assistant reply"
    );
    Ok(())
}

fn thread_ref_from_anchor(anchor: &str) -> Option<buzz_sdk::ThreadRef> {
    let id = EventId::from_hex(anchor).ok()?;
    Some(buzz_sdk::ThreadRef {
        root_event_id: id,
        parent_event_id: id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue::{BatchEvent, FlushBatch};
    use nostr::{EventBuilder, Keys, Kind, Tag};
    use std::time::Instant;

    fn make_event(content: &str, tags: Vec<Tag>) -> nostr::Event {
        let keys = Keys::generate();
        EventBuilder::new(Kind::Custom(9), content)
            .tags(tags)
            .sign_with_keys(&keys)
            .expect("sign")
    }

    fn batch_with(event: nostr::Event) -> FlushBatch {
        let channel_id = Uuid::new_v4();
        FlushBatch {
            channel_id,
            scope: crate::scope::SessionScope::Conversation { channel_id },
            events: vec![BatchEvent {
                event,
                prompt_tag: "@mention".into(),
                received_at: Instant::now(),
            }],
            cancelled_events: vec![],
            cancel_reason: None,
        }
    }

    #[test]
    fn empty_and_whitespace_assistant_text_is_not_publishable() {
        assert!(!assistant_text_is_publishable(""));
        assert!(!assistant_text_is_publishable("   \n\t  "));
        assert!(!should_publish_assistant_reply("  ", &[]));
    }

    #[test]
    fn harness_publishes_when_no_self_reply_exists() {
        assert!(should_publish_assistant_reply("The deploy is green.", &[]));
    }

    #[test]
    fn no_double_post_when_agent_already_sent_same_reply() {
        let text = "The deploy is green.";
        assert!(existing_replies_include_same(
            text,
            &["The deploy is green.".into()]
        ));
        assert!(existing_replies_include_same(
            text,
            &["  The   deploy is green. \n".into()]
        ));
        assert!(!should_publish_assistant_reply(
            text,
            &["The deploy is green.".into()]
        ));
    }

    #[test]
    fn no_double_post_when_agent_already_sent_any_kind9() {
        // Desktop CLI send may polish the wording. Once a kind:9 landed,
        // last-mile must not add a second primary reply.
        assert!(!should_publish_assistant_reply(
            "I'll look that up and send the answer.",
            &["Deploy is green on main.".into()]
        ));
    }

    #[test]
    fn dm_batch_destination_is_that_channel_id() {
        let event = make_event("plain DM, no at-mention", vec![]);
        let mut batch = batch_with(event);
        let dm_id = Uuid::new_v4();
        batch.channel_id = dm_id;
        let dest = reply_destination(&batch).expect("destination");
        assert_eq!(
            dest.channel_id, dm_id,
            "last-mile publishes into the triggering DM channel"
        );
    }

    #[test]
    fn top_level_mention_anchors_reply_to_triggering_event() {
        let event = make_event("@bot hello", vec![]);
        let trigger = event.id.to_hex();
        let created = event.created_at.as_secs();
        let batch = batch_with(event);
        let dest = reply_destination(&batch).expect("destination");
        assert_eq!(dest.channel_id, batch.channel_id);
        assert_eq!(dest.reply_to.as_deref(), Some(trigger.as_str()));
        assert!(dest.since <= created);
        assert!(created - dest.since <= SINCE_SKEW_SECS);
    }

    #[test]
    fn threaded_mention_anchors_reply_to_thread_root() {
        let root = "ab".repeat(32);
        let parent = "cd".repeat(32);
        let event = make_event(
            "@bot follow up",
            vec![
                Tag::parse(["e", &root, "", "root"]).expect("root tag"),
                Tag::parse(["e", &parent, "", "reply"]).expect("reply tag"),
            ],
        );
        let trigger = event.id.to_hex();
        let batch = batch_with(event);
        let dest = reply_destination(&batch).expect("destination");
        assert_eq!(dest.reply_to.as_deref(), Some(root.as_str()));
        assert_ne!(dest.reply_to.as_deref(), Some(trigger.as_str()));
        assert_ne!(dest.reply_to.as_deref(), Some(parent.as_str()));
    }

    #[test]
    fn contents_from_query_response_reads_content_fields() {
        let json = serde_json::json!([
            {"id": "aa", "content": "first"},
            {"id": "bb"},
            {"content": "second"}
        ]);
        assert_eq!(
            contents_from_query_response(&json),
            vec!["first".to_string(), "second".to_string()]
        );
        assert!(contents_from_query_response(&serde_json::json!({})).is_empty());
    }

    #[test]
    fn thread_ref_from_valid_hex_is_flat_reply() {
        let hex = "11".repeat(32);
        let tr = thread_ref_from_anchor(&hex).expect("thread ref");
        assert_eq!(tr.root_event_id.to_hex(), hex);
        assert_eq!(tr.parent_event_id.to_hex(), hex);
    }

    #[test]
    fn thread_ref_from_invalid_hex_is_none() {
        assert!(thread_ref_from_anchor("not-hex").is_none());
    }

    struct MockRelay {
        base_url: String,
        submitted: std::sync::Arc<std::sync::Mutex<Vec<serde_json::Value>>>,
        server: tokio::task::JoinHandle<()>,
    }

    impl Drop for MockRelay {
        fn drop(&mut self) {
            self.server.abort();
        }
    }

    async fn read_http_request(socket: &mut tokio::net::TcpStream) -> Option<String> {
        use tokio::io::AsyncReadExt;

        let mut buf = Vec::new();
        let mut tmp = [0u8; 2048];
        loop {
            let n = socket.read(&mut tmp).await.ok()?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&tmp[..n]);
            if let Some(header_end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = std::str::from_utf8(&buf[..header_end]).ok()?;
                let content_len = headers.lines().find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|v| v.trim().parse::<usize>().ok())
                })?;
                let body_start = header_end + 4;
                while buf.len() < body_start + content_len {
                    let n = socket.read(&mut tmp).await.ok()?;
                    if n == 0 {
                        break;
                    }
                    buf.extend_from_slice(&tmp[..n]);
                }
                break;
            }
            if buf.len() > 64 * 1024 {
                break;
            }
        }
        String::from_utf8(buf).ok()
    }

    async fn spawn_mock_relay(query_body: String) -> MockRelay {
        use tokio::io::AsyncWriteExt;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock relay");
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let submitted = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let submitted_clone = submitted.clone();
        let server = tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let Some(req) = read_http_request(&mut socket).await else {
                    continue;
                };
                let (status, body) = if req.starts_with("POST /query") {
                    ("200 OK", query_body.to_string())
                } else if req.starts_with("POST /events") {
                    if let Some(idx) = req.find("\r\n\r\n") {
                        let payload = req[idx + 4..].trim();
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(payload) {
                            submitted_clone.lock().expect("lock").push(event);
                        }
                    }
                    ("200 OK", "{}".to_string())
                } else {
                    ("404 Not Found", "{\"error\":\"not found\"}".to_string())
                };
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(response.as_bytes()).await;
            }
        });
        MockRelay {
            base_url,
            submitted,
            server,
        }
    }

    fn test_rest(base_url: String) -> RestClient {
        RestClient {
            http: reqwest::Client::new(),
            base_url,
            keys: Keys::generate(),
            auth_tag_json: None,
        }
    }

    #[tokio::test]
    async fn harness_publishes_assistant_text_when_query_is_empty() {
        let mock = spawn_mock_relay("[]".to_string()).await;
        let rest = test_rest(mock.base_url.clone());
        let event = make_event("@bot status?", vec![]);
        let trigger = event.id.to_hex();
        let batch = batch_with(event);
        let dest = reply_destination(&batch).expect("destination");

        publish_assistant_reply(&rest, &dest, "All green.")
            .await
            .expect("publish");

        let submitted = mock.submitted.lock().expect("lock").clone();
        assert_eq!(submitted.len(), 1, "harness must POST one kind:9");
        let posted = &submitted[0];
        assert_eq!(posted["kind"], 9);
        assert_eq!(posted["content"], "All green.");
        let tags = posted["tags"].as_array().expect("tags");
        assert!(
            tags.iter()
                .any(|t| t.get(0) == Some(&serde_json::json!("h"))
                    && t.get(1) == Some(&serde_json::json!(dest.channel_id.to_string()))),
            "kind:9 must carry the triggering channel h tag; tags={tags:?}"
        );
        assert!(
            tags.iter()
                .any(|t| t.get(0) == Some(&serde_json::json!("e"))
                    && t.get(1) == Some(&serde_json::json!(trigger))),
            "kind:9 must reply to the [Context] destination; tags={tags:?}"
        );
    }

    #[tokio::test]
    async fn harness_skips_publish_when_agent_already_sent_in_same_thread() {
        let batch = batch_with(make_event("@bot status?", vec![]));
        let dest = reply_destination(&batch).expect("destination");
        let root = dest.reply_to.clone().expect("threaded destination");
        // Flat kind:9: root == parent, stored as a reply marker (ThreadRef).
        let body =
            format!(r#"[{{"id":"aa","content":"All green.","tags":[["e","{root}","","reply"]]}}]"#);
        let mock = spawn_mock_relay(body).await;
        let rest = test_rest(mock.base_url.clone());

        publish_assistant_reply(&rest, &dest, "All green.")
            .await
            .expect("dedup skip is success");

        let submitted = mock.submitted.lock().expect("lock").clone();
        assert!(
            submitted.is_empty(),
            "must not double-post when a kind:9 from this identity already landed in this thread"
        );
    }

    #[tokio::test]
    async fn harness_publishes_when_existing_kind9_is_in_another_thread() {
        let batch = batch_with(make_event("@bot status?", vec![]));
        let dest = reply_destination(&batch).expect("destination");
        let other = "ab".repeat(32);
        let body = format!(
            r#"[{{"id":"aa","content":"reply in the other thread","tags":[["e","{other}","","reply"]]}}]"#
        );
        let mock = spawn_mock_relay(body).await;
        let rest = test_rest(mock.base_url.clone());

        publish_assistant_reply(&rest, &dest, "All green.")
            .await
            .expect("other thread must not suppress");

        let submitted = mock.submitted.lock().expect("lock").clone();
        assert_eq!(
            submitted.len(),
            1,
            "a kind:9 in a different thread must not silence this one"
        );
    }

    #[test]
    fn same_thread_existing_reply_skips_other_thread_does_not() {
        let root = "aa".repeat(32);
        let other = "bb".repeat(32);
        let parent = "cc".repeat(32);
        let dest = ReplyDestination {
            channel_id: Uuid::new_v4(),
            reply_to: Some(root.clone()),
            since: 0,
        };
        let text = "The deploy is green.";

        let same_flat = serde_json::json!([{
            "content": "already sent",
            "tags": [["e", root, "", "reply"]]
        }]);
        assert!(
            !should_publish_assistant_reply(text, &self_reply_contents(&same_flat, &dest)),
            "flat same-thread kind:9 (reply marker is the root) must skip"
        );

        let same_nested = serde_json::json!([{
            "content": "already sent",
            "tags": [["e", root, "", "root"], ["e", parent, "", "reply"]]
        }]);
        assert!(
            !should_publish_assistant_reply(text, &self_reply_contents(&same_nested, &dest)),
            "nested same-thread kind:9 (root marker) must skip"
        );

        let other_thread = serde_json::json!([{
            "content": "other thread",
            "tags": [["e", other, "", "reply"]]
        }]);
        assert!(
            should_publish_assistant_reply(text, &self_reply_contents(&other_thread, &dest)),
            "a kind:9 rooted in another thread must not skip"
        );

        let channel_level = serde_json::json!([{
            "content": "channel broadcast",
            "tags": [["h", dest.channel_id.to_string()]]
        }]);
        assert!(
            should_publish_assistant_reply(text, &self_reply_contents(&channel_level, &dest)),
            "a channel-level kind:9 must not skip a threaded reply"
        );

        assert!(
            should_publish_assistant_reply(
                text,
                &self_reply_contents(&serde_json::json!([]), &dest)
            ),
            "empty result still publishes"
        );

        // Unthreaded destination keeps channel-wide dedup.
        let unthreaded = ReplyDestination {
            reply_to: None,
            ..dest.clone()
        };
        assert!(
            !should_publish_assistant_reply(text, &self_reply_contents(&other_thread, &unthreaded)),
            "reply_to None still skips on any recent kind:9"
        );
        assert!(
            !should_publish_assistant_reply(
                text,
                &self_reply_contents(&channel_level, &unthreaded)
            ),
            "reply_to None still skips on a channel-level kind:9"
        );
    }
}
