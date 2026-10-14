//! Server-side Inbox projection (`buzz_inbox` /query extension).
//!
//! One per-user definition of what lands in the Inbox, shared by every client:
//! - `mention`: human-visible kinds that `p`-tag the user (same kinds as the
//!   Home feed mention query).
//! - `needs_action`: workflow approvals (46010..=46012) that `p`-tag the user.
//! - `dm`: messages from someone else in a DM channel the user belongs to.
//! - `thread_reply`: replies from someone else in a thread the user started,
//!   replied in, or names in `extra_roots` (client-private follows/stars).
//!
//! Done / unread overrides / muted threads stay client-side: they live in the
//! user's NIP-44 encrypted `buzz:inbox-state` document, which the relay cannot
//! read. Paging is by `until` (exclusive, seconds); there is no lookback window.

use chrono::{DateTime, Utc};
use sqlx::{PgPool, QueryBuilder};
use uuid::Uuid;

use buzz_core::{CommunityId, StoredEvent};

use crate::event::row_to_stored_event;
use crate::error::Result;

/// Hard cap on one inbox page.
pub const INBOX_MAX_LIMIT: i64 = 100;
/// Most recent participation roots considered (bounds the root scan).
pub const INBOX_MAX_PARTICIPATED_ROOTS: i64 = 2_000;
/// Most client-supplied extra roots (followed / starred threads).
pub const INBOX_MAX_EXTRA_ROOTS: usize = 500;

/// Mention kinds — keep in sync with `build_mentions_query` in `feed.rs` and
/// `MENTION_KINDS` in `desktop/src/features/inbox/inboxEligibility.ts`.
/// Kinds that count as a mention.
pub const INBOX_MENTION_KINDS: &[i32] = &[9, 40002, 1, 45001, 45003, 1618, 1619, 1621, 1630, 1631, 1632, 1633];
/// Workflow approval kinds (needs_action).
pub const INBOX_APPROVAL_KINDS: &[i32] = &[46010, 46011, 46012];
/// Chat message kinds counted for DMs and thread replies.
pub const INBOX_MESSAGE_KINDS: &[i32] = &[9, 40002];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// Why an event is in the Inbox.
pub enum InboxCategory {
    /// `p`-tags the user.
    Mention,
    /// Approval addressed to the user.
    NeedsAction,
    /// Message in one of the user's DMs.
    Dm,
    /// Reply in a thread the user is in.
    ThreadReply,
}

impl InboxCategory {
    /// Wire name.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Mention => "mention",
            Self::NeedsAction => "needs_action",
            Self::Dm => "dm",
            Self::ThreadReply => "thread_reply",
        }
    }
}

#[derive(Debug, Clone)]
/// One Inbox page row.
pub struct InboxRow {
    /// Category.
    pub category: InboxCategory,
    /// Event.
    pub event: StoredEvent,
}

const COLS: &str =
    "e.id, e.pubkey, e.created_at, e.kind, e.tags, e.content, e.sig, e.received_at, e.channel_id";

fn push_kinds(qb: &mut QueryBuilder<sqlx::Postgres>, kinds: &[i32]) {
    qb.push(" AND e.kind = ANY(").push_bind(kinds.to_vec()).push(")");
}

fn push_common(
    qb: &mut QueryBuilder<sqlx::Postgres>,
    channels: &[Uuid],
    until: Option<DateTime<Utc>>,
    limit: i64,
) {
    qb.push(" AND e.deleted_at IS NULL");
    // Visible: community-global rows, or channels the caller can access.
    qb.push(" AND (e.channel_id IS NULL OR e.channel_id = ANY(")
        .push_bind(channels.to_vec())
        .push("))");
    if let Some(u) = until {
        qb.push(" AND e.created_at < ").push_bind(u);
    }
    qb.push(" ORDER BY e.created_at DESC LIMIT ").push_bind(limit);
}

async fn fetch(
    pool: &PgPool,
    mut qb: QueryBuilder<sqlx::Postgres>,
    category: InboxCategory,
    out: &mut Vec<InboxRow>,
) -> Result<()> {
    let rows = qb.build().fetch_all(pool).await?;
    for row in rows {
        if let Some(event) = row_to_stored_event(row)? {
            out.push(InboxRow { category, event });
        }
    }
    Ok(())
}

/// One Inbox page, newest first, deduplicated by event id (first category wins
/// in order mention > needs_action > dm > thread_reply).
#[allow(clippy::too_many_arguments)]
pub async fn query_inbox(
    pool: &PgPool,
    community: CommunityId,
    pubkey_bytes: &[u8],
    accessible_channel_ids: &[Uuid],
    extra_roots: &[Vec<u8>],
    until: Option<DateTime<Utc>>,
    limit: i64,
) -> Result<Vec<InboxRow>> {
    let limit = limit.clamp(1, INBOX_MAX_LIMIT);
    let community_id = *community.as_uuid();
    let pubkey_hex = hex::encode(pubkey_bytes);
    let me = pubkey_bytes.to_vec();
    let extra: Vec<Vec<u8>> = extra_roots
        .iter()
        .filter(|r| r.len() == 32)
        .take(INBOX_MAX_EXTRA_ROOTS)
        .cloned()
        .collect();
    let mut out = Vec::new();

    for (category, kinds) in [
        (InboxCategory::Mention, INBOX_MENTION_KINDS),
        (InboxCategory::NeedsAction, INBOX_APPROVAL_KINDS),
    ] {
        let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(format!(
            "SELECT {COLS} FROM events e \
             INNER JOIN event_mentions m ON e.community_id = m.community_id AND e.id = m.event_id \
             WHERE e.community_id = "
        ));
        qb.push_bind(community_id);
        qb.push(" AND m.community_id = ").push_bind(community_id);
        qb.push(" AND m.pubkey_hex = ").push_bind(pubkey_hex.clone());
        qb.push(" AND e.pubkey <> ").push_bind(me.clone());
        push_kinds(&mut qb, kinds);
        push_common(&mut qb, accessible_channel_ids, until, limit);
        fetch(pool, qb, category, &mut out).await?;
    }

    // DMs: messages from others in DM channels the caller is an active member of.
    {
        let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(format!(
            "SELECT {COLS} FROM events e WHERE e.community_id = "
        ));
        qb.push_bind(community_id);
        qb.push(
            " AND e.channel_id IN (SELECT c.id FROM channels c \
             JOIN channel_members cm ON cm.community_id = c.community_id AND cm.channel_id = c.id \
             WHERE c.community_id = ",
        );
        qb.push_bind(community_id);
        qb.push(" AND c.channel_type = 'dm' AND c.deleted_at IS NULL AND cm.removed_at IS NULL AND cm.pubkey = ")
            .push_bind(me.clone());
        qb.push(")");
        qb.push(" AND e.pubkey <> ").push_bind(me.clone());
        push_kinds(&mut qb, INBOX_MESSAGE_KINDS);
        push_common(&mut qb, accessible_channel_ids, until, limit);
        fetch(pool, qb, InboxCategory::Dm, &mut out).await?;
    }

    // Thread replies in roots the caller started / replied in, plus extra roots.
    {
        let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(format!(
            "WITH roots AS ( \
               SELECT root FROM ( \
                 SELECT COALESCE(tm.root_event_id, tm.event_id) AS root, MAX(tm.event_created_at) AS at \
                 FROM thread_metadata tm \
                 JOIN events me ON me.community_id = tm.community_id AND me.id = tm.event_id \
                   AND me.created_at = tm.event_created_at \
                 WHERE tm.community_id = "
        ));
        qb.push_bind(community_id);
        qb.push(" AND me.pubkey = ").push_bind(me.clone());
        qb.push(" AND me.deleted_at IS NULL GROUP BY 1 ORDER BY at DESC LIMIT ")
            .push_bind(INBOX_MAX_PARTICIPATED_ROOTS);
        qb.push(") p UNION SELECT unnest(").push_bind(extra).push("::bytea[]) ) ");
        qb.push(format!(
            "SELECT {COLS} FROM thread_metadata tm \
             JOIN events e ON e.community_id = tm.community_id AND e.id = tm.event_id \
               AND e.created_at = tm.event_created_at \
             WHERE tm.community_id = "
        ));
        qb.push_bind(community_id);
        qb.push(" AND tm.depth > 0 AND tm.root_event_id IN (SELECT root FROM roots)");
        qb.push(" AND e.pubkey <> ").push_bind(me.clone());
        push_kinds(&mut qb, INBOX_MESSAGE_KINDS);
        push_common(&mut qb, accessible_channel_ids, until, limit);
        fetch(pool, qb, InboxCategory::ThreadReply, &mut out).await?;
    }

    Ok(merge_page(out, limit))
}

/// Dedupe by id (earlier category wins), sort newest first, cut to `limit`.
pub fn merge_page(rows: Vec<InboxRow>, limit: i64) -> Vec<InboxRow> {
    let mut seen = std::collections::HashSet::new();
    let mut rows: Vec<InboxRow> = rows
        .into_iter()
        .filter(|r| seen.insert(r.event.event.id))
        .collect();
    rows.sort_by(|a, b| {
        b.event
            .event
            .created_at
            .cmp(&a.event.event.created_at)
            .then_with(|| b.event.event.id.cmp(&a.event.event.id))
    });
    rows.truncate(limit.max(0) as usize);
    rows
}

impl crate::Db {
    /// See [`query_inbox`].
    pub async fn query_inbox(
        &self,
        community: CommunityId,
        pubkey_bytes: &[u8],
        accessible_channel_ids: &[Uuid],
        extra_roots: &[Vec<u8>],
        until: Option<DateTime<Utc>>,
        limit: i64,
    ) -> Result<Vec<InboxRow>> {
        query_inbox(
            &self.pool,
            community,
            pubkey_bytes,
            accessible_channel_ids,
            extra_roots,
            until,
            limit,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind, Timestamp};

    fn row(cat: InboxCategory, at: u64, keys: &Keys, content: &str) -> InboxRow {
        let ev = EventBuilder::new(Kind::Custom(9), content)
            .custom_created_at(Timestamp::from(at))
            .sign_with_keys(keys)
            .unwrap();
        InboxRow { category: cat, event: StoredEvent::new(ev, None) }
    }

    #[test]
    fn merge_page_dedupes_sorts_and_limits() {
        let k = Keys::generate();
        let a = row(InboxCategory::Mention, 100, &k, "a");
        let mut dup = a.clone();
        dup.category = InboxCategory::ThreadReply;
        let b = row(InboxCategory::Dm, 300, &k, "b");
        let c = row(InboxCategory::ThreadReply, 200, &k, "c");
        let page = merge_page(vec![a, b, c, dup], 2);
        assert_eq!(page.len(), 2);
        assert_eq!(page[0].event.event.content, "b");
        assert_eq!(page[1].event.event.content, "c");
        let all = merge_page(page.clone(), 10);
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn merge_page_keeps_first_category_for_duplicates() {
        let k = Keys::generate();
        let a = row(InboxCategory::Mention, 100, &k, "a");
        let mut dup = a.clone();
        dup.category = InboxCategory::ThreadReply;
        let page = merge_page(vec![a, dup], 10);
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].category, InboxCategory::Mention);
    }
}
