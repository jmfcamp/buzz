//! `buzz_inbox` /query extension: one server-side Inbox definition per user.
//!
//! Request (POST /query, same NIP-98 / web-session auth, admission, replay and
//! relay-membership checks as every other /query):
//! `[{"buzz_inbox":1, "limit":50, "until":1700000000, "roots":["<64-hex>", ...]}]`
//! Response: `{"buzz_inbox":1, "items":[{"category":"mention","event":{..}}], "next_until":n|null}`.
//! See `buzz_db::inbox` for eligibility. `until` is exclusive.

use axum::{http::StatusCode, Json};
use buzz_core::TenantContext;
use serde_json::{json, Value};

use crate::{api::api_error, state::AppState};

pub(super) const VERSION: u64 = 1;

pub(super) fn requested(filters: &[Value]) -> bool {
    filters.iter().any(|f| f.get("buzz_inbox").is_some())
}

#[derive(Debug, PartialEq)]
pub(super) struct InboxRequest {
    pub limit: i64,
    pub until: Option<i64>,
    pub roots: Vec<Vec<u8>>,
}

pub(super) fn parse(filters: &[Value]) -> Result<InboxRequest, &'static str> {
    let [f] = filters else {
        return Err("buzz_inbox must be the only filter");
    };
    let obj = f.as_object().ok_or("buzz_inbox filter must be an object")?;
    for key in obj.keys() {
        if !matches!(key.as_str(), "buzz_inbox" | "limit" | "until" | "roots") {
            return Err("buzz_inbox: unknown field");
        }
    }
    if obj.get("buzz_inbox").and_then(Value::as_u64) != Some(VERSION) {
        return Err("buzz_inbox: unsupported version");
    }
    let limit = match obj.get("limit") {
        None => 50,
        Some(v) => v.as_i64().filter(|l| *l > 0).ok_or("buzz_inbox: bad limit")?,
    }
    .min(buzz_db::inbox::INBOX_MAX_LIMIT);
    let until = match obj.get("until") {
        None | Some(Value::Null) => None,
        Some(v) => Some(v.as_i64().filter(|u| *u > 0).ok_or("buzz_inbox: bad until")?),
    };
    let mut roots = Vec::new();
    if let Some(v) = obj.get("roots") {
        let arr = v.as_array().ok_or("buzz_inbox: roots must be an array")?;
        if arr.len() > buzz_db::inbox::INBOX_MAX_EXTRA_ROOTS {
            return Err("buzz_inbox: too many roots");
        }
        for r in arr {
            let bytes = r
                .as_str()
                .and_then(|s| hex::decode(s).ok())
                .filter(|b| b.len() == 32)
                .ok_or("buzz_inbox: roots must be 64-hex event ids")?;
            roots.push(bytes);
        }
    }
    Ok(InboxRequest { limit, until, roots })
}

pub(super) async fn query(
    state: &AppState,
    tenant: &TenantContext,
    pubkey: &nostr::PublicKey,
    accessible_channels: &[uuid::Uuid],
    filters: &[Value],
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let req = parse(filters).map_err(|m| api_error(StatusCode::BAD_REQUEST, m))?;
    let until = req
        .until
        .and_then(|u| chrono::DateTime::from_timestamp(u, 0));
    let pubkey_bytes = pubkey.to_bytes().to_vec();
    let authed_hex = pubkey.to_hex();
    let rows = state
        .db
        .query_inbox(
            tenant.community(),
            &pubkey_bytes,
            accessible_channels,
            &req.roots,
            until,
            req.limit,
        )
        .await
        .map_err(|error| {
            tracing::error!(%error, "buzz_inbox query failed");
            api_error(StatusCode::SERVICE_UNAVAILABLE, "buzz_inbox unavailable")
        })?;
    let full = rows.len() as i64 >= req.limit;
    let mut next_until = None;
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let se = &row.event;
        next_until = Some(se.event.created_at.as_secs());
        if !super::event_in_accessible_channel(se, accessible_channels)
            || !buzz_core::filter::reader_authorized_for_event(&se.event, &authed_hex)
        {
            continue;
        }
        if let Ok(event) = serde_json::to_value(&se.event) {
            items.push(json!({"category": row.category.as_str(), "event": event}));
        }
    }
    Ok(Json(json!({
        "buzz_inbox": VERSION,
        "items": items,
        "next_until": if full { next_until } else { None },
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_and_full_requests() {
        let r = parse(&[json!({"buzz_inbox":1})]).unwrap();
        assert_eq!(r, InboxRequest { limit: 50, until: None, roots: vec![] });
        let root = "ab".repeat(32);
        let r = parse(&[json!({"buzz_inbox":1,"limit":500,"until":10,"roots":[root]})]).unwrap();
        assert_eq!(r.limit, buzz_db::inbox::INBOX_MAX_LIMIT);
        assert_eq!(r.until, Some(10));
        assert_eq!(r.roots, vec![vec![0xab; 32]]);
    }

    #[test]
    fn rejects_bad_shapes() {
        assert!(parse(&[]).is_err());
        assert!(parse(&[json!({"buzz_inbox":1}), json!({"kinds":[1]})]).is_err());
        assert!(parse(&[json!({"buzz_inbox":2})]).is_err());
        assert!(parse(&[json!({"buzz_inbox":1,"kinds":[1]})]).is_err());
        assert!(parse(&[json!({"buzz_inbox":1,"roots":["zz"]})]).is_err());
        assert!(parse(&[json!({"buzz_inbox":1,"limit":0})]).is_err());
    }

    #[test]
    fn detects_request() {
        assert!(requested(&[json!({"buzz_inbox":1})]));
        assert!(!requested(&[json!({"kinds":[9]})]));
    }
}
