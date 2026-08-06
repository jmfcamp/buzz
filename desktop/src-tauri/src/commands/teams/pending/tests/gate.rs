// Wes/Carl P1: tombstones must publish through the real relay ingest gate.
//
// The relay rejects any event more than ±900s from server time
// (`crates/buzz-relay/src/handlers/ingest.rs` MAX_TIMESTAMP_DRIFT_SECS). A
// future-dated head forces a future-dated tombstone, so a byte-frozen replay
// can age out of the acceptance window and strand the head live forever. These
// tests drive the real enqueue helpers for BOTH coordinates (30176 team,
// 30178 catalog) through a stub relay that enforces that exact gate, including
// the delayed/offline-retry case where the tombstone was signed strictly past
// a future head. Gated off Windows like `persona_events::flush_barrier`:
// `build_app_state()` pulls native DLLs unavailable on the Windows runner.
#![cfg(not(target_os = "windows"))]

use super::*;
use crate::app_state::build_app_state;
use crate::managed_agents::persona_events::flush_pending_events;
use crate::managed_agents::team_events::build_team_event;
use std::sync::{Arc, Mutex};

const RELAY_ACCEPT_WINDOW_SECS: i64 = 900;

/// Accepted `(kind, created_at)` pairs recorded by the gate stub.
type Accepted = Arc<Mutex<Vec<(u64, i64)>>>;

/// Stub relay enforcing the real ingest timestamp gate: `POST /events`
/// rejects any event whose `created_at` is more than ±900s from server
/// time (HTTP 200 + `accepted:false`, which the submit path treats as a
/// failure), and records every accepted event so tests can assert
/// domination. Returns the HTTP base URL and the shared accept log.
async fn spawn_gate_relay() -> (String, Accepted) {
    use axum::{extract::State, routing::post, Json, Router};

    let accepted: Accepted = Arc::new(Mutex::new(Vec::new()));
    let app = Router::new()
        .route(
            "/events",
            post(|State(log): State<Accepted>, body: String| async move {
                let event: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                let kind = event.get("kind").and_then(serde_json::Value::as_u64);
                let created_at = event.get("created_at").and_then(serde_json::Value::as_i64);
                let now = chrono::Utc::now().timestamp();
                let in_window =
                    created_at.is_some_and(|ts| (ts - now).abs() <= RELAY_ACCEPT_WINDOW_SECS);
                if !in_window {
                    return Json(serde_json::json!({
                        "event_id": "",
                        "accepted": false,
                        "message": "event timestamp too far from server time"
                    }));
                }
                log.lock()
                    .unwrap()
                    .push((kind.unwrap_or(0), created_at.unwrap()));
                Json(serde_json::json!({
                    "event_id": event.get("id").and_then(serde_json::Value::as_str).unwrap_or(""),
                    "accepted": true,
                    "message": ""
                }))
            }),
        )
        .with_state(accepted.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind gate relay");
    let addr = listener.local_addr().expect("gate relay addr");
    tokio::spawn(async move {
        axum::serve(listener, app).await.ok();
    });
    (format!("http://{addr}"), accepted)
}

/// Seed a retained 30176 team head dated `created_at` seconds since epoch.
fn seed_team_head(db_path: &Path, keys: &nostr::Keys, created_at: i64) {
    let event = build_team_event(&team())
        .unwrap()
        .custom_created_at(nostr::Timestamp::from(created_at as u64))
        .sign_with_keys(keys)
        .unwrap();
    let conn = open_retention_db(db_path).unwrap();
    retain_event(
        &conn,
        &RetainedEvent {
            kind: KIND_TEAM,
            pubkey: keys.public_key().to_hex(),
            d_tag: "team-abc".to_string(),
            content: event.content.to_string(),
            created_at,
            raw_event: event.as_json(),
            pending_sync: false,
        },
    )
    .unwrap();
}

fn app_state_for(keys: nostr::Keys, relay_http: &str) -> crate::app_state::AppState {
    let state = build_app_state();
    *state.keys.lock().unwrap() = keys;
    *state.relay_url_override.lock().unwrap() = Some(relay_http.to_string());
    state
}

/// A tombstone signed strictly past a head that is already inside the
/// relay window publishes verbatim at that floor and dominates the head —
/// the delayed retry that lands once the wall clock is within 900s of the
/// signed timestamp.
#[tokio::test]
async fn catalog_tombstone_within_window_publishes_and_dominates() {
    let dir = tempfile::tempdir().unwrap();
    let keys = nostr::Keys::generate();
    let owner = keys.public_key().to_hex();
    let db_path = scoped_db(dir.path(), "wss://a.example", &owner);

    let head = nostr::Timestamp::now().as_secs() as i64 + 600;
    seed_catalog_head(&db_path, &keys, head);
    tombstone_team_catalog_at(&db_path, &keys, "team-abc").unwrap();
    let floor = enqueued_tombstone(&db_path).created_at;
    assert!(
        floor > head,
        "tombstone must dominate the head before flush"
    );

    let (relay_http, accepted) = spawn_gate_relay().await;
    let state = app_state_for(keys, &relay_http);
    let flushed = flush_pending_events(&db_path, &state).await.unwrap();

    assert_eq!(flushed, 1, "the in-window tombstone must publish");
    let accepted = accepted.lock().unwrap();
    assert_eq!(accepted.len(), 1, "gate accepted exactly the tombstone");
    assert_eq!(accepted[0].0, KIND_DELETE as u64);
    assert!(
        accepted[0].1 > head,
        "accepted tombstone {} must dominate head {head}",
        accepted[0].1
    );
    let conn = open_retention_db(&db_path).unwrap();
    assert!(
        !get_pending_sync(&conn).unwrap().iter().any(|r| r.kind == 5),
        "the published tombstone must be marked synced"
    );
}

/// A tombstone signed further ahead than the relay window is NOT sent — it
/// stays pending and converges as the wall clock advances toward its floor,
/// instead of being published and rejected forever. The gate never sees a
/// rejectable event.
#[tokio::test]
async fn catalog_tombstone_beyond_window_stays_pending_never_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let keys = nostr::Keys::generate();
    let owner = keys.public_key().to_hex();
    let db_path = scoped_db(dir.path(), "wss://a.example", &owner);

    let head = nostr::Timestamp::now().as_secs() as i64 + 5_000;
    seed_catalog_head(&db_path, &keys, head);
    tombstone_team_catalog_at(&db_path, &keys, "team-abc").unwrap();

    let (relay_http, accepted) = spawn_gate_relay().await;
    let state = app_state_for(keys, &relay_http);
    let flushed = flush_pending_events(&db_path, &state).await.unwrap();

    assert_eq!(flushed, 0, "a beyond-window tombstone must not publish");
    assert!(
        accepted.lock().unwrap().is_empty(),
        "the gate must never receive an out-of-window event"
    );
    let conn = open_retention_db(&db_path).unwrap();
    assert!(
        get_pending_sync(&conn)
            .unwrap()
            .iter()
            .any(|r| r.kind == 5 && r.pending_sync),
        "the tombstone stays pending to converge on a later sweep"
    );
}

/// When the wall clock has advanced past the signed floor (head is now in
/// the past), the tombstone re-dates to `now`, still dominating the head.
#[tokio::test]
async fn catalog_tombstone_past_floor_redates_to_now_and_dominates() {
    let dir = tempfile::tempdir().unwrap();
    let keys = nostr::Keys::generate();
    let owner = keys.public_key().to_hex();
    let db_path = scoped_db(dir.path(), "wss://a.example", &owner);

    let head = nostr::Timestamp::now().as_secs() as i64 - 5_000;
    seed_catalog_head(&db_path, &keys, head);
    tombstone_team_catalog_at(&db_path, &keys, "team-abc").unwrap();

    let (relay_http, accepted) = spawn_gate_relay().await;
    let before = nostr::Timestamp::now().as_secs() as i64;
    let state = app_state_for(keys, &relay_http);
    let flushed = flush_pending_events(&db_path, &state).await.unwrap();
    let after = nostr::Timestamp::now().as_secs() as i64;

    assert_eq!(flushed, 1, "the re-dated tombstone must publish");
    let accepted = accepted.lock().unwrap();
    assert_eq!(accepted.len(), 1);
    let ts = accepted[0].1;
    assert!(
        ts >= before && ts <= after,
        "tombstone re-dated to wall clock; got {ts}"
    );
    assert!(
        ts > head,
        "the re-dated tombstone still dominates head {head}"
    );
}

/// The sibling 30176 team tombstone flows through the identical gate — the
/// flush fix is coordinate-agnostic, so fixing only the catalog helper would
/// have left team deletion broken (Carl's explicit note).
#[tokio::test]
async fn team_tombstone_within_window_publishes_and_dominates() {
    let dir = tempfile::tempdir().unwrap();
    let keys = nostr::Keys::generate();
    let owner = keys.public_key().to_hex();
    let db_path = scoped_db(dir.path(), "wss://a.example", &owner);

    let head = nostr::Timestamp::now().as_secs() as i64 + 600;
    seed_team_head(&db_path, &keys, head);
    super::super::super::tombstone_team_at(&db_path, &keys, "team-abc").unwrap();
    let floor = enqueued_tombstone(&db_path).created_at;
    assert!(
        floor > head,
        "team tombstone must dominate the head before flush"
    );

    let (relay_http, accepted) = spawn_gate_relay().await;
    let state = app_state_for(keys, &relay_http);
    let flushed = flush_pending_events(&db_path, &state).await.unwrap();

    assert_eq!(flushed, 1, "the in-window team tombstone must publish");
    let accepted = accepted.lock().unwrap();
    assert_eq!(accepted.len(), 1);
    assert_eq!(accepted[0].0, KIND_DELETE as u64);
    assert!(
        accepted[0].1 > head,
        "accepted team tombstone {} must dominate head {head}",
        accepted[0].1
    );
}

/// A beyond-window 30176 tombstone likewise stays pending rather than
/// publishing an event the relay would reject.
#[tokio::test]
async fn team_tombstone_beyond_window_stays_pending_never_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let keys = nostr::Keys::generate();
    let owner = keys.public_key().to_hex();
    let db_path = scoped_db(dir.path(), "wss://a.example", &owner);

    let head = nostr::Timestamp::now().as_secs() as i64 + 5_000;
    seed_team_head(&db_path, &keys, head);
    super::super::super::tombstone_team_at(&db_path, &keys, "team-abc").unwrap();

    let (relay_http, accepted) = spawn_gate_relay().await;
    let state = app_state_for(keys, &relay_http);
    let flushed = flush_pending_events(&db_path, &state).await.unwrap();

    assert_eq!(
        flushed, 0,
        "a beyond-window team tombstone must not publish"
    );
    assert!(accepted.lock().unwrap().is_empty());
    let conn = open_retention_db(&db_path).unwrap();
    assert!(
        get_pending_sync(&conn)
            .unwrap()
            .iter()
            .any(|r| r.kind == 5 && r.pending_sync),
        "the team tombstone stays pending to converge later"
    );
}
