//! OpenClaw gateway handshake helpers.
//!
//! Talks the documented WebSocket protocol directly. Never shells out to
//! `openclaw` — the CLI `--url` flag drops configured password credentials.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Operator scopes required for ACP / install. Read-only is not enough.
pub const REQUIRED_OPERATOR_SCOPES: &[&str] =
    &["operator.read", "operator.write", "operator.admin"];

/// Client id accepted by the OpenClaw connect schema (`GATEWAY_CLIENT_IDS`).
pub const OPENCLAW_CLIENT_ID: &str = "cli";

/// Coarse client category for `connect.params.client.mode`.
///
/// OpenClaw's live `GATEWAY_CLIENT_MODES` allowlist is
/// `webchat | cli | ui | backend | node | worker | probe | test`.
/// `operator` is a **role**, not a mode. Official protocol docs still
/// show `mode: "operator"` in examples; the schema rejects it with
/// `INVALID_REQUEST: invalid connect params: at /client/mode`.
///
/// `cli` matches the official CLI (`id: "cli"` + `mode: "cli"`) and is
/// the correct pairing for this non-browser desktop admin console.
/// Remote password auth is the CLI's documented path, so this mode is
/// not policy-blocked. The signed v3 `client_mode` must match this value.
pub const OPENCLAW_CLIENT_MODE: &str = "cli";

/// Handshake role. Distinct from [`OPENCLAW_CLIENT_MODE`].
pub const OPENCLAW_CLIENT_ROLE: &str = "operator";

/// Display name shown on the gateway pairing request.
pub const OPENCLAW_CLIENT_DISPLAY_NAME: &str = "Hula Buzz";

/// Device family bound into the v3 signature payload.
///
/// Must also be sent as `connect.params.client.deviceFamily`. The gateway
/// reconstructs the signed string from that JSON field; omitting it verifies
/// as `""` and fails with `device signature invalid`.
pub const OPENCLAW_DEVICE_FAMILY: &str = "desktop";

/// Token the gateway binds into the v3 device signature.
///
/// Mirrors OpenClaw `resolveSignatureToken`:
/// `auth.token ?? auth.deviceToken ?? auth.bootstrapToken ?? ""`.
/// Password is never part of the signed token.
pub fn signature_token_from_connect_auth(auth: &serde_json::Value) -> String {
    for key in ["token", "deviceToken", "bootstrapToken"] {
        if let Some(serde_json::Value::String(value)) = auth.get(key) {
            return value.clone();
        }
    }
    String::new()
}

/// Build the v3 device-auth payload signed during `connect`.
///
/// `token` must be the same string [`signature_token_from_connect_auth`]
/// returns for the connect `auth` object we send. Password-only connects
/// sign the empty string.
pub fn build_device_auth_payload_v3(
    device_id: &str,
    client_id: &str,
    client_mode: &str,
    role: &str,
    scopes: &[&str],
    signed_at_ms: u64,
    token: &str,
    nonce: &str,
    platform: &str,
    device_family: &str,
) -> String {
    [
        "v3",
        device_id,
        client_id,
        client_mode,
        role,
        &scopes.join(","),
        &signed_at_ms.to_string(),
        token,
        nonce,
        &normalize_device_metadata(platform),
        &normalize_device_metadata(device_family),
    ]
    .join("|")
}

/// Lowercase device metadata the way OpenClaw compares signatures.
pub fn normalize_device_metadata(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

/// Derive `device.id` = SHA-256(raw 32-byte Ed25519 public key) as hex.
pub fn device_id_from_public_key(public_key: &[u8; 32]) -> String {
    hex::encode(Sha256::digest(public_key))
}

/// Encode raw 32-byte Ed25519 public key as unpadded base64url.
pub fn public_key_base64url(public_key: &[u8; 32]) -> String {
    URL_SAFE_NO_PAD.encode(public_key)
}

/// Sign a UTF-8 payload with a raw 32-byte Ed25519 secret.
pub fn sign_device_payload(secret: &[u8; 32], payload: &str) -> Result<String, String> {
    let signing_key = SigningKey::from_bytes(secret);
    let signature = signing_key.sign(payload.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(signature.to_bytes()))
}

/// Generate a new Ed25519 device secret from OS entropy.
pub fn generate_device_secret() -> Result<[u8; 32], String> {
    let mut secret = [0u8; 32];
    getrandom::getrandom(&mut secret)
        .map_err(|error| format!("failed to generate device key: {error}"))?;
    Ok(secret)
}

/// Hex-encode a device secret.
pub fn encode_device_secret(secret: &[u8; 32]) -> String {
    hex::encode(secret)
}

/// Decode a 32-byte device secret from hex.
pub fn decode_device_secret(hex_secret: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(hex_secret.trim())
        .map_err(|error| format!("invalid device secret: {error}"))?;
    let secret: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "device secret must be 32 bytes".to_string())?;
    Ok(secret)
}

/// Public key bytes from a raw Ed25519 secret.
pub fn public_key_from_secret(secret: &[u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(secret).verifying_key().to_bytes()
}

/// Whether `hello-ok.auth.scopes` is enough to install bots.
///
/// Approving a read-only `gateway:health` pairing must not look like success.
pub fn scopes_are_sufficient(scopes: &[String]) -> bool {
    REQUIRED_OPERATOR_SCOPES
        .iter()
        .all(|required| scopes.iter().any(|scope| scope == required))
}

/// Parsed `connect.challenge` payload.
#[derive(Debug, Clone, Deserialize)]
pub struct ConnectChallenge {
    /// Server nonce that must be echoed and signed.
    pub nonce: String,
    /// Server timestamp used as `device.signedAt`.
    pub ts: u64,
}

/// Structured pairing-required details shown to the admin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingRequired {
    /// Exact pending request id to approve on the gateway.
    ///
    /// Empty when the gateway omitted it. The connect is still pending —
    /// the admin matches this desktop's device id instead.
    pub request_id: String,
    /// Scopes this connect asked for (not a previous read-only request).
    pub requested_scopes: Vec<String>,
}

/// Codes the live OpenClaw gateway uses for "approve this device".
const PAIRING_ERROR_CODES: &[&str] = &["PAIRING_REQUIRED", "NOT_PAIRED"];

/// One remote OpenClaw agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAgent {
    /// Gateway agent id (`main`, `mo`, …).
    pub id: String,
    /// Display name when the gateway provides one.
    pub name: String,
    /// Bound Nostr/Buzz pubkey, when the VPS already has one.
    pub pubkey: Option<String>,
}

/// Parse a `connect.challenge` event payload.
pub fn parse_connect_challenge(payload: &serde_json::Value) -> Result<ConnectChallenge, String> {
    let nonce = payload
        .get("nonce")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .trim();
    if nonce.is_empty() {
        return Err("connect.challenge nonce is required".into());
    }
    let ts = payload
        .get("ts")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| "connect.challenge ts must be a non-negative integer".to_string())?;
    Ok(ConnectChallenge {
        nonce: nonce.to_string(),
        ts,
    })
}

/// Extract pairing-required details from a gateway error object.
///
/// Live gateways return `NOT_PAIRED` with
/// `pairing required: device is not approved yet`. Official docs still
/// use `PAIRING_REQUIRED` plus `details.requestId`. Either is pending —
/// a missing request id must not fail the connect.
pub fn parse_pairing_required(error: &serde_json::Value) -> Option<PairingRequired> {
    let details = error.get("details").unwrap_or(error);
    let code = error
        .get("code")
        .and_then(serde_json::Value::as_str)
        .or_else(|| details.get("code").and_then(serde_json::Value::as_str))
        .unwrap_or("");
    let blob = flatten_error_text(error);
    if !is_pairing_error_code(code) && !looks_like_pairing_required(&blob) {
        return None;
    }
    let request_id = first_string(details, &["requestId", "request_id"])
        .or_else(|| first_string(error, &["requestId", "request_id"]))
        .or_else(|| extract_request_id_from_text(&blob))
        .unwrap_or_default();
    let requested_scopes = parse_scope_list(details);
    Some(PairingRequired {
        request_id,
        requested_scopes,
    })
}

/// Parse pairing from a close reason, formatted error, or JSON blob.
pub fn parse_pairing_required_from_text(text: &str) -> Option<PairingRequired> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(pairing) = parse_pairing_required(&value) {
            return Some(pairing);
        }
        if let Some(error) = value.get("error") {
            if let Some(pairing) = parse_pairing_required(error) {
                return Some(pairing);
            }
        }
    }
    if !looks_like_pairing_required(trimmed) {
        return None;
    }
    Some(PairingRequired {
        request_id: extract_request_id_from_text(trimmed).unwrap_or_default(),
        requested_scopes: Vec::new(),
    })
}

fn is_pairing_error_code(code: &str) -> bool {
    PAIRING_ERROR_CODES
        .iter()
        .any(|known| code.eq_ignore_ascii_case(known))
}

/// Message / close-reason phrases that mean "approve this device".
fn looks_like_pairing_required(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("pairing required")
        || lower.contains("not approved")
        || lower.contains("not-paired")
        || lower.contains("not_paired")
}

fn flatten_error_text(error: &serde_json::Value) -> String {
    let mut parts = Vec::new();
    for key in ["code", "message", "reason"] {
        if let Some(text) = error.get(key).and_then(serde_json::Value::as_str) {
            parts.push(text.to_string());
        }
    }
    if let Some(details) = error.get("details") {
        for key in ["code", "message", "reason", "requestId", "request_id"] {
            if let Some(text) = details.get(key).and_then(serde_json::Value::as_str) {
                parts.push(text.to_string());
            }
        }
    }
    parts.join(" ")
}

fn extract_request_id_from_text(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    for needle in ["requestid", "request_id", "request id"] {
        let Some(idx) = lower.find(needle) else {
            continue;
        };
        let rest = text[idx + needle.len()..].trim_start();
        let rest = rest.trim_start_matches([':', '=', ' ', '\t', '"', '\'']);
        let id: String = rest
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    None
}

/// Parse `hello-ok.auth.scopes` and optional `deviceToken`.
pub fn parse_hello_auth(payload: &serde_json::Value) -> (Vec<String>, Option<String>) {
    let auth = payload.get("auth").unwrap_or(payload);
    let scopes = parse_scope_list(auth);
    let device_token = first_string(auth, &["deviceToken", "device_token"]);
    (scopes, device_token)
}

/// Parse `agents.list` payload: `{ agents: [...] }` or a raw array.
pub fn parse_agents_list(payload: &serde_json::Value) -> Result<Vec<RemoteAgent>, String> {
    let agents = if let Some(array) = payload.as_array() {
        array
    } else if let Some(array) = payload.get("agents").and_then(serde_json::Value::as_array) {
        array
    } else {
        return Err("agents.list did not return an agent array".into());
    };
    let mut parsed = Vec::new();
    for agent in agents {
        if let Some(remote) = parse_remote_agent(agent) {
            parsed.push(remote);
        }
    }
    Ok(parsed)
}

fn parse_remote_agent(value: &serde_json::Value) -> Option<RemoteAgent> {
    let id = first_string(value, &["id", "agentId", "agent_id"])?;
    let name = first_string(value, &["name", "displayName", "display_name", "label"])
        .unwrap_or_else(|| id.clone());
    let pubkey = extract_agent_pubkey(value);
    Some(RemoteAgent { id, name, pubkey })
}

fn extract_agent_pubkey(value: &serde_json::Value) -> Option<String> {
    if let Some(hex) = first_hex_pubkey(value, &["pubkey", "publicKey", "public_key"]) {
        return Some(hex);
    }
    for nested in ["identity", "nostr", "buzz"] {
        if let Some(object) = value.get(nested) {
            if let Some(hex) = first_hex_pubkey(object, &["pubkey", "publicKey", "public_key"]) {
                return Some(hex);
            }
        }
    }
    None
}

/// Pull a Buzz/Nostr pubkey out of a `config.get` payload when present.
pub fn extract_buzz_plugin_pubkey(config: &serde_json::Value) -> Option<String> {
    let channels = config
        .get("channels")
        .or_else(|| config.get("config").and_then(|inner| inner.get("channels")))?;
    let buzz = channels.get("buzz")?;
    first_hex_pubkey(buzz, &["publicKey", "public_key", "pubkey"]).or_else(|| {
        buzz.get("identity")
            .and_then(|identity| first_hex_pubkey(identity, &["pubkey", "publicKey", "public_key"]))
    })
}

fn parse_scope_list(value: &serde_json::Value) -> Vec<String> {
    for key in ["scopes", "requestedScopes", "requested_scopes"] {
        if let Some(array) = value.get(key).and_then(serde_json::Value::as_array) {
            return array
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .map(ToOwned::to_owned)
                .collect();
        }
    }
    Vec::new()
}

fn first_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(text) = value.get(*key).and_then(serde_json::Value::as_str) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn first_hex_pubkey(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    first_string(value, keys).and_then(|raw| normalize_hex_pubkey(&raw))
}

/// Accept 64-char hex pubkeys, ignoring npub prefixes we cannot decode here.
pub fn normalize_hex_pubkey(value: &str) -> Option<String> {
    let trimmed = value.trim().to_ascii_lowercase();
    if trimmed.len() == 64
        && trimmed
            .chars()
            .all(|ch| matches!(ch, '0'..='9' | 'a'..='f'))
    {
        return Some(trimmed);
    }
    None
}

/// Validate a gateway WebSocket URL. Password is never part of the URL.
pub fn validate_gateway_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let parsed =
        url::Url::parse(trimmed).map_err(|_| "gateway URL is not a valid URL".to_string())?;
    if parsed.scheme() != "wss" && parsed.scheme() != "ws" {
        return Err("gateway URL must use wss:// (or ws:// for local development)".into());
    }
    if parsed.host_str().is_none() {
        return Err("gateway URL must include a host".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("put the gateway password in the password field, not the URL".into());
    }
    Ok(trimmed.to_string())
}

/// Stable secret-store key for one community's gateway credentials.
pub fn gateway_secret_key(relay_host: &str) -> String {
    format!("community-bots:{relay_host}")
}

/// Stable secret-store key for a minted bot identity.
pub fn minted_identity_secret_key(relay_host: &str, agent_id: &str) -> String {
    format!("community-bot-identity:{relay_host}:{agent_id}")
}

/// Host used to key secrets. Falls back to the raw string if URL parse fails.
pub fn relay_host_key(relay_url: &str) -> String {
    url::Url::parse(relay_url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_ascii_lowercase))
        .unwrap_or_else(|| relay_url.trim().to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_mode_is_allowed_and_is_not_the_operator_role() {
        const ALLOWED: &[&str] = &[
            "webchat", "cli", "ui", "backend", "node", "worker", "probe", "test",
        ];
        assert_eq!(OPENCLAW_CLIENT_MODE, "cli");
        assert_eq!(OPENCLAW_CLIENT_ROLE, "operator");
        assert_ne!(OPENCLAW_CLIENT_MODE, OPENCLAW_CLIENT_ROLE);
        assert!(ALLOWED.contains(&OPENCLAW_CLIENT_MODE));
        assert!(!ALLOWED.contains(&"operator"));
    }

    #[test]
    fn signature_token_follows_openclaw_auth_priority() {
        assert_eq!(
            signature_token_from_connect_auth(&serde_json::json!({
                "password": "gateway-password"
            })),
            ""
        );
        assert_eq!(
            signature_token_from_connect_auth(&serde_json::json!({
                "password": "gateway-password",
                "token": "user-token",
                "deviceToken": "device-token"
            })),
            "user-token"
        );
        assert_eq!(
            signature_token_from_connect_auth(&serde_json::json!({
                "deviceToken": "device-token",
                "bootstrapToken": "bootstrap-token"
            })),
            "device-token"
        );
        assert_eq!(
            signature_token_from_connect_auth(&serde_json::json!({
                "bootstrapToken": "bootstrap-token"
            })),
            "bootstrap-token"
        );
    }

    #[test]
    fn v3_payload_joins_fields() {
        let payload = build_device_auth_payload_v3(
            "abc",
            OPENCLAW_CLIENT_ID,
            OPENCLAW_CLIENT_MODE,
            OPENCLAW_CLIENT_ROLE,
            &["operator.read", "operator.write"],
            1737264000000,
            "",
            "nonce-1",
            "Linux",
            "Desktop",
        );
        assert_eq!(
            payload,
            "v3|abc|cli|cli|operator|operator.read,operator.write|1737264000000||nonce-1|linux|desktop"
        );
    }

    #[test]
    fn read_only_scopes_are_not_sufficient() {
        assert!(!scopes_are_sufficient(&[
            "operator.read".into(),
            "operator.approvals".into()
        ]));
        assert!(scopes_are_sufficient(&[
            "operator.read".into(),
            "operator.write".into(),
            "operator.admin".into()
        ]));
    }

    #[test]
    fn pairing_required_reads_request_id_and_scopes() {
        let error = serde_json::json!({
            "code": "PAIRING_REQUIRED",
            "details": {
                "requestId": "req-123",
                "scopes": ["operator.read", "operator.write", "operator.admin"],
                "recommendedNextStep": "wait_then_retry"
            }
        });
        let parsed = parse_pairing_required(&error).expect("pairing");
        assert_eq!(parsed.request_id, "req-123");
        assert_eq!(
            parsed.requested_scopes,
            vec!["operator.read", "operator.write", "operator.admin"]
        );
    }

    #[test]
    fn pairing_required_accepts_snake_case_request_id() {
        let error = serde_json::json!({
            "code": "PAIRING_REQUIRED",
            "details": { "request_id": "req-456", "requestedScopes": ["operator.write"] }
        });
        let parsed = parse_pairing_required(&error).expect("pairing");
        assert_eq!(parsed.request_id, "req-456");
        assert_eq!(parsed.requested_scopes, vec!["operator.write"]);
    }

    #[test]
    fn pairing_required_accepts_not_paired_and_pairing_required() {
        let not_paired = serde_json::json!({
            "code": "NOT_PAIRED",
            "message": "pairing required: device is not approved yet",
            "details": {
                "requestId": "req-not-paired",
                "scopes": ["operator.read", "operator.write", "operator.admin"]
            }
        });
        let parsed = parse_pairing_required(&not_paired).expect("NOT_PAIRED");
        assert_eq!(parsed.request_id, "req-not-paired");
        assert_eq!(
            parsed.requested_scopes,
            vec!["operator.read", "operator.write", "operator.admin"]
        );

        let pairing_required = serde_json::json!({
            "code": "PAIRING_REQUIRED",
            "details": { "requestId": "req-official" }
        });
        let parsed = parse_pairing_required(&pairing_required).expect("PAIRING_REQUIRED");
        assert_eq!(parsed.request_id, "req-official");
    }

    #[test]
    fn not_paired_without_request_id_is_still_pending() {
        let error = serde_json::json!({
            "code": "NOT_PAIRED",
            "message": "pairing required: device is not approved yet"
        });
        let parsed = parse_pairing_required(&error).expect("pairing without request id");
        assert!(parsed.request_id.is_empty(), "{}", parsed.request_id);
        assert!(parsed.requested_scopes.is_empty());
    }

    #[test]
    fn pairing_from_close_reason_and_formatted_error() {
        let close = "OpenClaw gateway closed the connection (1008): pairing required: device is not approved yet";
        let parsed = parse_pairing_required_from_text(close).expect("close reason");
        assert!(parsed.request_id.is_empty());

        let formatted = "NOT_PAIRED: pairing required: device is not approved yet";
        let parsed = parse_pairing_required_from_text(formatted).expect("formatted");
        assert!(parsed.request_id.is_empty());

        let with_id = r#"{"code":"NOT_PAIRED","message":"not approved","details":{"request_id":"from-text"}}"#;
        let parsed = parse_pairing_required_from_text(with_id).expect("json text");
        assert_eq!(parsed.request_id, "from-text");

        assert!(
            parse_pairing_required_from_text("timed out waiting for connect.challenge").is_none()
        );
    }

    #[test]
    fn request_id_extracted_from_message_text() {
        let error = serde_json::json!({
            "code": "NOT_PAIRED",
            "message": "pairing required: requestId=abc-99 device is not approved yet"
        });
        let parsed = parse_pairing_required(&error).expect("pairing");
        assert_eq!(parsed.request_id, "abc-99");
    }

    #[test]
    fn agents_list_includes_main_and_nested_pubkey() {
        let payload = serde_json::json!({
            "agents": [
                { "id": "main", "name": "Main" },
                { "id": "mo", "identity": { "pubkey": "ab".repeat(32) } }
            ]
        });
        let agents = parse_agents_list(&payload).expect("agents");
        assert_eq!(agents.len(), 2);
        assert_eq!(agents[0].id, "main");
        assert_eq!(agents[1].id, "mo");
        assert_eq!(agents[1].pubkey.as_deref(), Some("ab".repeat(32).as_str()));
    }

    #[test]
    fn agents_list_accepts_raw_array() {
        let payload = serde_json::json!([{ "id": "captain" }]);
        let agents = parse_agents_list(&payload).expect("agents");
        assert_eq!(agents[0].id, "captain");
        assert_eq!(agents[0].name, "captain");
    }

    #[test]
    fn gateway_url_rejects_embedded_password() {
        let error = validate_gateway_url("wss://user:secret@host.example").expect_err("password");
        assert!(error.contains("password field"), "{error}");
    }

    #[test]
    fn challenge_requires_integer_ts() {
        let error = parse_connect_challenge(&serde_json::json!({
            "nonce": "n",
            "ts": "now"
        }))
        .expect_err("ts");
        assert!(error.contains("ts"), "{error}");
    }
}
