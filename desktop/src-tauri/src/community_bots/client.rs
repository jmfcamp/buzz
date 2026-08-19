//! WebSocket client for the OpenClaw remote gateway.
//!
//! Desktop is the admin console only. This module never posts to Buzz
//! channels — the VPS Buzz plugin stays the always-on talker.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::{protocol::CloseFrame, Message};

use super::identity::{
    attach_buzz_identities, merge_buzz_identity_sources, strip_config_secrets, BuzzIdentity,
};
use super::protocol::{
    build_device_auth_payload_v3, device_id_from_public_key, parse_agents_list,
    parse_connect_challenge, parse_hello_auth, parse_pairing_required,
    parse_pairing_required_from_text, public_key_base64url, public_key_from_secret,
    scopes_are_sufficient, sign_device_payload, signature_token_from_connect_auth, RemoteAgent,
    OPENCLAW_CLIENT_DISPLAY_NAME, OPENCLAW_CLIENT_ID, OPENCLAW_CLIENT_MODE, OPENCLAW_CLIENT_ROLE,
    OPENCLAW_DEVICE_FAMILY, REQUIRED_OPERATOR_SCOPES,
};
use super::secret::{extract_buzz_account_secret, RevealedBotSecret};
use super::store::GatewaySecrets;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const RPC_TIMEOUT: Duration = Duration::from_secs(30);

/// Outcome of one connect attempt.
#[derive(Debug)]
pub enum ConnectOutcome {
    /// Device is waiting for the admin to approve this exact request.
    Pending {
        /// Gateway pairing request id.
        request_id: String,
        /// Scopes this connect asked for.
        requested_scopes: Vec<String>,
    },
    /// Handshake succeeded but approved scopes omit write/admin.
    InsufficientScopes {
        /// Scopes the gateway actually granted.
        approved_scopes: Vec<String>,
        /// Scopes this connect asked for.
        requested_scopes: Vec<String>,
    },
    /// Handshake succeeded with enough scopes. `device_token` is the reusable credential.
    Connected {
        /// Scopes granted on this socket.
        approved_scopes: Vec<String>,
        /// Device token to persist for later reconnects.
        device_token: Option<String>,
    },
}

/// Connect, complete handshake, and return pairing or success.
pub async fn handshake(secrets: &GatewaySecrets) -> Result<ConnectOutcome, String> {
    let mut session = GatewaySession::connect(&secrets.url).await?;
    session.authenticate(secrets).await
}

/// Fetch the Buzz account nsec on demand. Never persists or logs the payload.
pub async fn reveal_buzz_account_secret(
    secrets: &GatewaySecrets,
    expected_pubkey: &str,
) -> Result<RevealedBotSecret, String> {
    let mut session = GatewaySession::connect(&secrets.url).await?;
    match session.authenticate(secrets).await? {
        ConnectOutcome::Connected { .. } => {}
        ConnectOutcome::Pending { request_id, .. } => {
            return Err(format!(
                "gateway pairing still pending (request {request_id})"
            ));
        }
        ConnectOutcome::InsufficientScopes { .. } => {
            return Err(
                "gateway pairing is read-only; approve operator.write and operator.admin".into(),
            );
        }
    }
    // Live method only. Current OpenClaw redacts privateKey; older builds may
    // still return a parseable Buzz account secret.
    let config = session.rpc("config.get", json!({})).await?;
    Ok(extract_buzz_account_secret(&config, expected_pubkey))
}

/// Connect, authenticate, and list remote agents (includes `main`).
pub async fn list_remote_agents(secrets: &GatewaySecrets) -> Result<Vec<RemoteAgent>, String> {
    let mut session = GatewaySession::connect(&secrets.url).await?;
    match session.authenticate(secrets).await? {
        ConnectOutcome::Connected { .. } => session.list_agents_with_buzz_identities().await,
        ConnectOutcome::Pending { request_id, .. } => Err(format!(
            "gateway pairing still pending (request {request_id})"
        )),
        ConnectOutcome::InsufficientScopes { .. } => {
            Err("gateway pairing is read-only; approve operator.write and operator.admin".into())
        }
    }
}

struct GatewaySession {
    write: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    read: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    next_id: u32,
}

impl GatewaySession {
    async fn connect(url: &str) -> Result<Self, String> {
        let (stream, _) = timeout(HANDSHAKE_TIMEOUT, tokio_tungstenite::connect_async(url))
            .await
            .map_err(|_| "timed out connecting to the OpenClaw gateway".to_string())?
            .map_err(|error| format!("failed to connect to the OpenClaw gateway: {error}"))?;
        let (write, read) = stream.split();
        Ok(Self {
            write,
            read,
            next_id: 1,
        })
    }

    async fn authenticate(&mut self, secrets: &GatewaySecrets) -> Result<ConnectOutcome, String> {
        let challenge = match self.wait_for_challenge().await {
            Ok(challenge) => challenge,
            Err(error) => return pairing_or_err(error),
        };
        let request_id = self.next_request_id();
        let connect = build_connect_frame(secrets, &challenge, &request_id)?;
        self.write
            .send(Message::Text(connect.to_string().into()))
            .await
            .map_err(|error| format!("failed to send connect: {error}"))?;
        let response = match self.wait_for_response(&request_id).await {
            Ok(response) => response,
            Err(error) => return pairing_or_err(error),
        };
        interpret_connect_response(response)
    }

    async fn rpc(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let request_id = self.next_request_id();
        let frame = json!({
            "type": "req",
            "id": request_id,
            "method": method,
            "params": params
        });
        self.write
            .send(Message::Text(frame.to_string().into()))
            .await
            .map_err(|error| format!("failed to request {method}: {error}"))?;
        let response = self.wait_for_response(&request_id).await?;
        if response.get("ok").and_then(Value::as_bool) != Some(true) {
            let message = response
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("gateway method failed");
            return Err(format!("{method}: {message}"));
        }
        Ok(response.get("payload").cloned().unwrap_or(Value::Null))
    }

    async fn agents_list(&mut self) -> Result<Vec<RemoteAgent>, String> {
        let payload = self.rpc("agents.list", json!({})).await?;
        parse_agents_list(&payload)
    }

    async fn list_agents_with_buzz_identities(&mut self) -> Result<Vec<RemoteAgent>, String> {
        let mut agents = self.agents_list().await?;
        let identities = self.fetch_buzz_identities().await;
        attach_buzz_identities(&mut agents, &identities);
        Ok(agents)
    }

    /// Live `channels.status`, then secret-stripped `config.get`.
    ///
    /// Failures here must not block the agent list — Install can still ask
    /// the admin to paste a public hex.
    async fn fetch_buzz_identities(&mut self) -> Vec<BuzzIdentity> {
        let status = self
            .rpc("channels.status", json!({ "channel": "buzz" }))
            .await
            .ok();
        let config = if status
            .as_ref()
            .is_some_and(|payload| !merge_buzz_identity_sources(Some(payload), None).is_empty())
        {
            None
        } else {
            self.rpc("config.get", json!({}))
                .await
                .ok()
                .map(|payload| strip_config_secrets(&payload))
        };
        merge_buzz_identity_sources(status.as_ref(), config.as_ref())
    }

    fn next_request_id(&mut self) -> String {
        let id = self.next_id;
        self.next_id += 1;
        format!("buzz-{id}")
    }

    async fn wait_for_challenge(&mut self) -> Result<super::protocol::ConnectChallenge, String> {
        let deadline = timeout(HANDSHAKE_TIMEOUT, async {
            loop {
                let frame = read_json_frame(&mut self.read).await?;
                if frame.get("type").and_then(Value::as_str) == Some("event")
                    && frame.get("event").and_then(Value::as_str) == Some("connect.challenge")
                {
                    let payload = frame.get("payload").cloned().unwrap_or(Value::Null);
                    return parse_connect_challenge(&payload);
                }
            }
        })
        .await
        .map_err(|_| "timed out waiting for connect.challenge".to_string())?;
        deadline
    }

    async fn wait_for_response(&mut self, request_id: &str) -> Result<Value, String> {
        let deadline = timeout(RPC_TIMEOUT, async {
            loop {
                let frame = read_json_frame(&mut self.read).await?;
                if frame.get("type").and_then(Value::as_str) == Some("res")
                    && frame.get("id").and_then(Value::as_str) == Some(request_id)
                {
                    return Ok(frame);
                }
            }
        })
        .await
        .map_err(|_| format!("timed out waiting for gateway response {request_id}"))?;
        deadline
    }
}

async fn read_json_frame(
    read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
) -> Result<Value, String> {
    loop {
        let message = read
            .next()
            .await
            .ok_or_else(|| "OpenClaw gateway closed the connection".to_string())?
            .map_err(|error| format!("OpenClaw gateway read failed: {error}"))?;
        match message {
            Message::Text(text) => {
                return serde_json::from_str(&text)
                    .map_err(|error| format!("invalid gateway JSON: {error}"));
            }
            Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => {}
            Message::Binary(_) => {
                return Err("OpenClaw gateway sent a binary frame".into());
            }
            Message::Close(frame) => {
                return Err(format_close_error(frame.as_ref()));
            }
        }
    }
}

fn build_connect_frame(
    secrets: &GatewaySecrets,
    challenge: &super::protocol::ConnectChallenge,
    request_id: &str,
) -> Result<Value, String> {
    let secret = secrets.device_secret()?;
    let public_key = public_key_from_secret(&secret);
    let device_id = device_id_from_public_key(&public_key);
    let platform = normalize_platform(std::env::consts::OS);
    let auth = build_connect_auth(secrets);
    // OpenClaw reconstructs this as auth.token ?? auth.deviceToken ??
    // auth.bootstrapToken ?? "". Password is never signed.
    let signature_token = signature_token_from_connect_auth(&Value::Object(auth.clone()));
    let payload = build_device_auth_payload_v3(
        &device_id,
        OPENCLAW_CLIENT_ID,
        OPENCLAW_CLIENT_MODE,
        OPENCLAW_CLIENT_ROLE,
        REQUIRED_OPERATOR_SCOPES,
        challenge.ts,
        &signature_token,
        &challenge.nonce,
        &platform,
        OPENCLAW_DEVICE_FAMILY,
    );
    let signature = sign_device_payload(&secret, &payload)?;
    Ok(json!({
        "type": "req",
        "id": request_id,
        "method": "connect",
        "params": {
            "minProtocol": 4,
            "maxProtocol": 4,
            "client": {
                "id": OPENCLAW_CLIENT_ID,
                "displayName": OPENCLAW_CLIENT_DISPLAY_NAME,
                "version": env!("CARGO_PKG_VERSION"),
                "platform": platform,
                "deviceFamily": OPENCLAW_DEVICE_FAMILY,
                "mode": OPENCLAW_CLIENT_MODE
            },
            "role": OPENCLAW_CLIENT_ROLE,
            "scopes": REQUIRED_OPERATOR_SCOPES,
            "caps": [],
            "commands": [],
            "permissions": {},
            "auth": auth,
            "locale": "en-US",
            "userAgent": format!("hula-buzz/{}", env!("CARGO_PKG_VERSION")),
            "device": {
                "id": device_id,
                "publicKey": public_key_base64url(&public_key),
                "signature": signature,
                "signedAt": challenge.ts,
                "nonce": challenge.nonce
            }
        }
    }))
}

/// Shared-secret / device-token fields sent on `connect.params.auth`.
///
/// User token wins over device token when both are stored, matching the
/// gateway's `auth.token ?? auth.deviceToken` reconstruction order.
fn build_connect_auth(secrets: &GatewaySecrets) -> serde_json::Map<String, Value> {
    let mut auth = serde_json::Map::new();
    if !secrets.password.is_empty() {
        auth.insert("password".into(), json!(secrets.password));
    }
    if let Some(token) = secrets
        .token
        .as_deref()
        .filter(|value| !value.is_empty())
        .or(secrets
            .device_token
            .as_deref()
            .filter(|value| !value.is_empty()))
    {
        auth.insert("token".into(), json!(token));
    }
    auth
}

fn interpret_connect_response(response: Value) -> Result<ConnectOutcome, String> {
    if response.get("ok").and_then(Value::as_bool) == Some(true) {
        let payload = response.get("payload").cloned().unwrap_or(Value::Null);
        let (approved_scopes, device_token) = parse_hello_auth(&payload);
        if !scopes_are_sufficient(&approved_scopes) {
            return Ok(ConnectOutcome::InsufficientScopes {
                approved_scopes,
                requested_scopes: required_scope_strings(),
            });
        }
        return Ok(ConnectOutcome::Connected {
            approved_scopes,
            device_token,
        });
    }
    let error = response.get("error").cloned().unwrap_or(Value::Null);
    if let Some(outcome) = pairing_outcome_from_error(&error) {
        return Ok(outcome);
    }
    let code = error
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("CONNECT_FAILED");
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("OpenClaw gateway connect failed");
    let formatted = format!("{code}: {message}");
    if let Some(outcome) = connect_failure_outcome(&formatted) {
        return Ok(outcome);
    }
    Err(formatted)
}

/// Turn a pairing JSON error into [`ConnectOutcome::Pending`].
fn pairing_outcome_from_error(error: &Value) -> Option<ConnectOutcome> {
    let pairing = parse_pairing_required(error)?;
    Some(pending_outcome(
        pairing.request_id,
        pairing.requested_scopes,
    ))
}

/// Turn a close reason or formatted `CODE: message` into pending when it is pairing.
pub(crate) fn connect_failure_outcome(error: &str) -> Option<ConnectOutcome> {
    let pairing = parse_pairing_required_from_text(error)?;
    Some(pending_outcome(
        pairing.request_id,
        pairing.requested_scopes,
    ))
}

fn pending_outcome(request_id: String, requested_scopes: Vec<String>) -> ConnectOutcome {
    ConnectOutcome::Pending {
        request_id,
        requested_scopes: if requested_scopes.is_empty() {
            required_scope_strings()
        } else {
            requested_scopes
        },
    }
}

fn pairing_or_err(error: String) -> Result<ConnectOutcome, String> {
    if let Some(outcome) = connect_failure_outcome(&error) {
        return Ok(outcome);
    }
    Err(error)
}

fn format_close_error(frame: Option<&CloseFrame>) -> String {
    match frame {
        Some(close) => {
            let code = u16::from(close.code);
            let reason = close.reason.to_string();
            if reason.is_empty() {
                format!("OpenClaw gateway closed the connection ({code})")
            } else {
                format!("OpenClaw gateway closed the connection ({code}): {reason}")
            }
        }
        None => "OpenClaw gateway closed the connection".into(),
    }
}

fn required_scope_strings() -> Vec<String> {
    REQUIRED_OPERATOR_SCOPES
        .iter()
        .map(|scope| (*scope).to_string())
        .collect()
}

fn normalize_platform(os: &str) -> String {
    match os {
        "macos" => "macos".into(),
        "windows" => "windows".into(),
        _ => "linux".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::community_bots::protocol::ConnectChallenge;

    fn challenge() -> ConnectChallenge {
        ConnectChallenge {
            nonce: "nonce-1".into(),
            ts: 1_737_264_000_000,
        }
    }

    /// Reconstruct the v3 string the way OpenClaw's gateway does: from the
    /// connect JSON, not from the constants we intended to sign.
    fn gateway_reconstructed_payload(params: &Value) -> String {
        let client = &params["client"];
        let device = &params["device"];
        let scopes: Vec<&str> = params["scopes"]
            .as_array()
            .expect("scopes")
            .iter()
            .filter_map(Value::as_str)
            .collect();
        build_device_auth_payload_v3(
            device["id"].as_str().expect("device.id"),
            client["id"].as_str().expect("client.id"),
            client["mode"].as_str().unwrap_or(""),
            params["role"].as_str().expect("role"),
            &scopes,
            device["signedAt"].as_u64().expect("signedAt"),
            &signature_token_from_connect_auth(params.get("auth").unwrap_or(&Value::Null)),
            device["nonce"].as_str().expect("nonce"),
            client["platform"].as_str().unwrap_or(""),
            client["deviceFamily"].as_str().unwrap_or(""),
        )
    }

    fn assert_signature_matches_reconstructed_payload(secrets: &GatewaySecrets, params: &Value) {
        let payload = gateway_reconstructed_payload(params);
        let client = &params["client"];
        let device = &params["device"];
        let mode = client["mode"].as_str().expect("client.mode");
        let device_family = client["deviceFamily"]
            .as_str()
            .expect("client.deviceFamily");
        let signed_at = device["signedAt"].as_u64().expect("signedAt").to_string();
        let nonce = device["nonce"].as_str().expect("nonce");
        let signature_token =
            signature_token_from_connect_auth(params.get("auth").unwrap_or(&Value::Null));

        assert_eq!(mode, OPENCLAW_CLIENT_MODE);
        assert_eq!(device_family, OPENCLAW_DEVICE_FAMILY);
        assert!(
            payload.contains(&format!("|{mode}|")),
            "signed payload must include client.mode: {payload}"
        );
        assert!(
            payload.ends_with(&format!("|{device_family}"))
                || payload.contains(&format!("|{device_family}|")),
            "signed payload must include client.deviceFamily: {payload}"
        );
        assert!(
            payload.contains(&format!("|{signed_at}|")),
            "signed payload must include device.signedAt: {payload}"
        );
        assert!(
            payload.contains(&format!("|{nonce}|")),
            "signed payload must include device.nonce: {payload}"
        );
        assert!(
            payload.contains(&format!("|{signature_token}|{nonce}|")),
            "signed payload must include the auth signature-token field: {payload}"
        );
        assert!(
            !payload.contains("secret"),
            "password must not be part of the signed token: {payload}"
        );

        let expected_signature =
            sign_device_payload(&secrets.device_secret().expect("secret"), &payload)
                .expect("signature");
        assert_eq!(device["signature"], expected_signature);
    }

    #[test]
    fn connect_frame_sends_allowed_cli_mode_matching_signed_payload() {
        let secrets = GatewaySecrets::new("wss://gateway.example/ws".into(), "secret".into(), None)
            .expect("secrets");
        let frame = build_connect_frame(&secrets, &challenge(), "buzz-1").expect("frame");
        let params = &frame["params"];
        let client = &params["client"];

        assert_eq!(client["id"], OPENCLAW_CLIENT_ID);
        assert_eq!(client["mode"], OPENCLAW_CLIENT_MODE);
        assert_eq!(client["mode"], "cli");
        assert_ne!(client["mode"], "operator");
        assert_eq!(client["deviceFamily"], OPENCLAW_DEVICE_FAMILY);
        assert_eq!(params["role"], OPENCLAW_CLIENT_ROLE);
        assert_eq!(
            params["scopes"],
            json!(["operator.read", "operator.write", "operator.admin"])
        );
        assert_eq!(params["device"]["signedAt"], challenge().ts);
        assert_eq!(params["device"]["nonce"], challenge().nonce);
        assert!(params["auth"].get("token").is_none());
        assert_eq!(params["auth"]["password"], "secret");

        let payload = gateway_reconstructed_payload(params);
        assert!(
            payload.contains("|cli|cli|operator|"),
            "signed payload must bind client.mode=cli, not the operator role: {payload}"
        );
        assert!(
            !payload.contains("|cli|operator|operator|"),
            "signed payload must not use operator as client_mode: {payload}"
        );
        assert!(
            payload.ends_with("|desktop"),
            "signed payload must bind client.deviceFamily=desktop: {payload}"
        );

        assert_signature_matches_reconstructed_payload(&secrets, params);
    }

    #[test]
    fn connect_frame_signs_sent_user_token_not_password_or_device_token() {
        let mut secrets = GatewaySecrets::new(
            "wss://gateway.example/ws".into(),
            "secret".into(),
            Some("user-token".into()),
        )
        .expect("secrets");
        secrets.device_token = Some("device-token".into());
        let frame = build_connect_frame(&secrets, &challenge(), "buzz-1").expect("frame");
        let params = &frame["params"];

        assert_eq!(params["auth"]["token"], "user-token");
        assert!(params["auth"].get("deviceToken").is_none());
        assert_eq!(
            signature_token_from_connect_auth(&params["auth"]),
            "user-token"
        );
        assert_signature_matches_reconstructed_payload(&secrets, params);
    }

    #[test]
    fn connect_frame_signs_device_token_when_that_is_the_sent_auth_token() {
        let mut secrets =
            GatewaySecrets::new("wss://gateway.example/ws".into(), "secret".into(), None)
                .expect("secrets");
        secrets.device_token = Some("device-token".into());
        let frame = build_connect_frame(&secrets, &challenge(), "buzz-1").expect("frame");
        let params = &frame["params"];

        assert_eq!(params["auth"]["token"], "device-token");
        assert_eq!(
            signature_token_from_connect_auth(&params["auth"]),
            "device-token"
        );
        assert_signature_matches_reconstructed_payload(&secrets, params);
    }

    #[test]
    fn interpret_not_paired_without_request_id_is_pending() {
        let response = json!({
            "type": "res",
            "id": "buzz-1",
            "ok": false,
            "error": {
                "code": "NOT_PAIRED",
                "message": "pairing required: device is not approved yet"
            }
        });
        let outcome = interpret_connect_response(response).expect("pending");
        match outcome {
            ConnectOutcome::Pending {
                request_id,
                requested_scopes,
            } => {
                assert!(request_id.is_empty());
                assert_eq!(
                    requested_scopes,
                    vec!["operator.read", "operator.write", "operator.admin"]
                );
            }
            other => panic!("expected pending, got {other:?}"),
        }
    }

    #[test]
    fn interpret_pairing_required_with_request_id_is_pending() {
        let response = json!({
            "ok": false,
            "error": {
                "code": "PAIRING_REQUIRED",
                "details": {
                    "requestId": "req-123",
                    "scopes": ["operator.read"]
                }
            }
        });
        let outcome = interpret_connect_response(response).expect("pending");
        match outcome {
            ConnectOutcome::Pending {
                request_id,
                requested_scopes,
            } => {
                assert_eq!(request_id, "req-123");
                assert_eq!(requested_scopes, vec!["operator.read"]);
            }
            other => panic!("expected pending, got {other:?}"),
        }
    }

    #[test]
    fn close_reason_pairing_is_pending_not_an_error() {
        let outcome = connect_failure_outcome(
            "OpenClaw gateway closed the connection (1008): pairing required: device is not approved yet",
        )
        .expect("pending");
        assert!(matches!(outcome, ConnectOutcome::Pending { .. }));
        assert!(connect_failure_outcome("timed out connecting to the OpenClaw gateway").is_none());
    }
}
