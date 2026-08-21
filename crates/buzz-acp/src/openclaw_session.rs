//! OpenClaw Gateway session keys for last-mile ACP.
//!
//! One `openclaw acp` child stays up for the life of the unit. `--session
//! agent:<id>:buzz` is that process's default Gateway key (heartbeats keep
//! falling through to it). Conversation `session/new` must send
//! `_meta.sessionKey` or OpenClaw's mapper reuses that leftover and every
//! Buzz room piles into one Control UI row.
//!
//! Key shape mirrors Slack (`agent:<id>:<channel>:<peer>[:thread:<id>]`) with
//! a `buzz` namespace. The store key is ids only — never a channel name.
//! [`crate::config::compose_session_title`] remains the human label
//! (`_meta.sessionTitle`).

use uuid::Uuid;

use crate::queue::{parse_thread_tags, FlushBatch};

/// Buzz-side conversation that maps to one OpenClaw Gateway session.
///
/// Distinct from the ACP `sessionId` OpenClaw returns. The harness still
/// caches that id in [`crate::pool::SessionState`]; this key is what the
/// Gateway stores and what the Control UI lists.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct ConversationKey {
    pub channel_id: Uuid,
    /// NIP-10 `root` (or lone `reply`) event id from [`parse_thread_tags`].
    /// `None` for a top-level channel or DM conversation.
    pub thread_root: Option<String>,
}

impl ConversationKey {
    pub(crate) fn channel(channel_id: Uuid) -> Self {
        Self {
            channel_id,
            thread_root: None,
        }
    }

    /// Conversation for a flush: channel of the batch plus the last event's
    /// thread root (`ThreadTags.root_event_id`), when any.
    pub(crate) fn from_batch(batch: &FlushBatch) -> Self {
        let thread_root = batch
            .events
            .last()
            .and_then(|event| parse_thread_tags(&event.event).root_event_id)
            .and_then(normalize_thread_root);
        Self {
            channel_id: batch.channel_id,
            thread_root,
        }
    }
}

fn normalize_thread_root(raw: String) -> Option<String> {
    let normalized = raw.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

/// Parse `agent:<id>` out of `openclaw acp --session agent:<id>:buzz`.
///
/// The leftover `--session` flag stays on the process (do not drop it). New
/// conversation work must not keep appending to that key.
pub(crate) fn parse_openclaw_agent_id(agent_args: &[String]) -> Option<String> {
    let mut args = agent_args.iter();
    while let Some(arg) = args.next() {
        let value = if let Some(value) = arg.strip_prefix("--session=") {
            value
        } else if arg == "--session" {
            args.next().map(String::as_str)?
        } else {
            continue;
        };
        return agent_id_from_session_flag(value);
    }
    None
}

fn agent_id_from_session_flag(flag: &str) -> Option<String> {
    let mut parts = flag.split(':');
    if parts.next()? != "agent" {
        return None;
    }
    let id = parts.next()?.trim();
    if id.is_empty() {
        return None;
    }
    let normalized: String = id
        .chars()
        .map(|c| c.to_ascii_lowercase())
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

/// Stable OpenClaw Gateway key for one Buzz conversation.
///
/// - Channel (stream / private / group, no thread):
///   `agent:<agentId>:buzz:channel:<channelUuid>`
/// - Thread: `agent:<agentId>:buzz:channel:<channelUuid>:thread:<rootEventId>`
/// - DM: `agent:<agentId>:buzz:direct:<channelUuid>`
/// - DM thread: `agent:<agentId>:buzz:direct:<channelUuid>:thread:<rootEventId>`
pub(crate) fn compose_openclaw_session_key(
    agent_id: &str,
    channel_id: Uuid,
    thread_root: Option<&str>,
    is_dm: bool,
) -> String {
    let peer = if is_dm { "direct" } else { "channel" };
    let mut key = format!("agent:{agent_id}:buzz:{peer}:{channel_id}");
    if let Some(root) = thread_root.and_then(|root| normalize_thread_root(root.to_string())) {
        key.push_str(":thread:");
        key.push_str(&root);
    }
    key
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue::BatchEvent;
    use nostr::{EventBuilder, Keys, Kind, Tag};
    use std::time::Instant;

    fn channel(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    fn root_id(byte: u8) -> String {
        hex::encode([byte; 32])
    }

    fn make_event(content: &str, tags: Vec<Tag>) -> nostr::Event {
        let keys = Keys::generate();
        EventBuilder::new(Kind::Custom(9), content)
            .tags(tags)
            .sign_with_keys(&keys)
            .expect("sign")
    }

    fn batch_with(channel_id: Uuid, event: nostr::Event) -> FlushBatch {
        FlushBatch {
            channel_id,
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
    fn parse_session_flag_reads_agent_id_from_leftover_buzz_key() {
        assert_eq!(
            parse_openclaw_agent_id(&[
                "acp".into(),
                "--session".into(),
                "agent:captain:buzz".into()
            ])
            .as_deref(),
            Some("captain")
        );
        assert_eq!(
            parse_openclaw_agent_id(&["acp".into(), "--session=agent:Mo:buzz".into()]).as_deref(),
            Some("mo")
        );
        assert_eq!(
            parse_openclaw_agent_id(&[
                "acp".into(),
                "--session".into(),
                "agent:korg:buzz:channel:x".into()
            ])
            .as_deref(),
            Some("korg")
        );
    }

    #[test]
    fn parse_session_flag_ignores_non_openclaw_args() {
        assert_eq!(parse_openclaw_agent_id(&["acp".into()]), None);
        assert_eq!(
            parse_openclaw_agent_id(&["acp".into(), "--session".into(), "main".into()]),
            None
        );
        assert_eq!(parse_openclaw_agent_id(&[]), None);
    }

    #[test]
    fn key_is_stable_per_agent_channel_thread_or_dm() {
        let general = channel(1);
        let dm = channel(2);
        let root = root_id(0xab);
        let channel_key = compose_openclaw_session_key("captain", general, None, false);
        let thread_key = compose_openclaw_session_key("captain", general, Some(&root), false);
        let dm_key = compose_openclaw_session_key("captain", dm, None, true);

        assert_eq!(channel_key, format!("agent:captain:buzz:channel:{general}"));
        assert_eq!(
            thread_key,
            format!("agent:captain:buzz:channel:{general}:thread:{root}")
        );
        assert_eq!(dm_key, format!("agent:captain:buzz:direct:{dm}"));

        assert_eq!(
            compose_openclaw_session_key("captain", general, None, false),
            channel_key,
            "same inbound channel must reuse the key"
        );
        assert_eq!(
            compose_openclaw_session_key("captain", general, Some(&root), false),
            thread_key,
            "same inbound thread must reuse the key"
        );
        assert_eq!(
            compose_openclaw_session_key("captain", dm, None, true),
            dm_key,
            "same inbound DM must reuse the key"
        );
    }

    #[test]
    fn different_channels_threads_and_dms_differ() {
        let a = channel(1);
        let b = channel(2);
        let root_a = root_id(0x11);
        let root_b = root_id(0x22);
        let keys = [
            compose_openclaw_session_key("captain", a, None, false),
            compose_openclaw_session_key("captain", b, None, false),
            compose_openclaw_session_key("captain", a, Some(&root_a), false),
            compose_openclaw_session_key("captain", a, Some(&root_b), false),
            compose_openclaw_session_key("captain", a, None, true),
            compose_openclaw_session_key("mo", a, None, false),
        ];
        for (i, left) in keys.iter().enumerate() {
            for (j, right) in keys.iter().enumerate() {
                if i != j {
                    assert_ne!(
                        left, right,
                        "keys {i} and {j} must differ: {left} vs {right}"
                    );
                }
            }
        }
    }

    #[test]
    fn key_uses_uuid_never_channel_name() {
        let id = channel(9);
        let key = compose_openclaw_session_key("quasar", id, None, false);
        assert!(key.contains(&id.to_string()));
        assert!(!key.contains("general"));
        assert!(!key.contains("watercooler"));
    }

    #[test]
    fn from_batch_uses_root_event_id_not_parent_or_trigger() {
        let channel_id = channel(3);
        let root = root_id(0xcd);
        let parent = root_id(0xef);
        let event = make_event(
            "@captain follow up",
            vec![
                Tag::parse(["e", &root, "", "root"]).expect("root tag"),
                Tag::parse(["e", &parent, "", "reply"]).expect("reply tag"),
            ],
        );
        let trigger = event.id.to_hex();
        let key = ConversationKey::from_batch(&batch_with(channel_id, event));
        assert_eq!(key.channel_id, channel_id);
        assert_eq!(key.thread_root.as_deref(), Some(root.as_str()));
        assert_ne!(key.thread_root.as_deref(), Some(parent.as_str()));
        assert_ne!(key.thread_root.as_deref(), Some(trigger.as_str()));
    }

    #[test]
    fn from_batch_top_level_mention_has_no_thread() {
        let channel_id = channel(4);
        let event = make_event("@captain hello", vec![]);
        let key = ConversationKey::from_batch(&batch_with(channel_id, event));
        assert_eq!(key, ConversationKey::channel(channel_id));
        assert_eq!(
            compose_openclaw_session_key(
                "captain",
                key.channel_id,
                key.thread_root.as_deref(),
                false
            ),
            format!("agent:captain:buzz:channel:{channel_id}")
        );
    }

    #[test]
    fn leftover_agent_buzz_key_is_not_a_conversation_key() {
        let composed = compose_openclaw_session_key("captain", channel(1), None, false);
        assert_ne!(composed, "agent:captain:buzz");
        assert!(composed.starts_with("agent:captain:buzz:"));
    }
}
