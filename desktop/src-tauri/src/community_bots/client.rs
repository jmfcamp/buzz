//! WebSocket client for the OpenClaw remote gateway.
//!
//! Desktop is the admin console only. This module never posts to Buzz
//! channels — the VPS Buzz plugin stays the always-on talker.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use super::protocol::{
    build_device_auth_payload_v3, device_id_from_public_key, parse_agents_list,
    parse_connect_challenge, parse_hello_auth, parse_pairing_required, public_key_base64url,
    public_key_from_secret, scopes_are_sufficient, sign_device_payload, RemoteAgent,
    OPENCLAW_CLIENT_DISPLAY_NAME, OPENCLAW_CLIENT_ID, OPENCLAW_DEVICE_FAMILY,
    REQUIRED_OPERATOR_SCOPES,
};
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

/// Connect, authenticate, and list remote agents (includes `main`).
pub async fn list_remote_agents(secrets: &GatewaySecrets) -> Result<Vec<RemoteAgent>, String> {
    let mut session = GatewaySession::connect(&secrets.url).await?;
    match session.authenticate(secrets).await? {
        ConnectOutcome::Connected { .. } => session.agents_list().await,
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
        let challenge = self.wait_for_challenge().await?;
        let request_id = self.next_request_id();
        let connect = build_connect_frame(secrets, &challenge, &request_id)?;
        self.write
            .send(Message::Text(connect.to_string().into()))
            .await
            .map_err(|error| format!("failed to send connect: {error}"))?;
        let response = self.wait_for_response(&request_id).await?;
        interpret_connect_response(response)
    }

    async fn agents_list(&mut self) -> Result<Vec<RemoteAgent>, String> {
        let request_id = self.next_request_id();
        let frame = json!({
            "type": "req",
            "id": request_id,
            "method": "agents.list",
            "params": {}
        });
        self.write
            .send(Message::Text(frame.to_string().into()))
            .await
            .map_err(|error| format!("failed to request agents.list: {error}"))?;
        let response = self.wait_for_response(&request_id).await?;
        if response.get("ok").and_then(Value::as_bool) != Some(true) {
            let message = response
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("agents.list failed");
            return Err(message.to_string());
        }
        let payload = response.get("payload").cloned().unwrap_or(Value::Null);
        parse_agents_list(&payload)
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
            Message::Close(_) => {
                return Err("OpenClaw gateway closed the connection".into());
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
    let signature_token = secrets.device_token.as_deref().unwrap_or("");
    let payload = build_device_auth_payload_v3(
        &device_id,
        OPENCLAW_CLIENT_ID,
        "operator",
        "operator",
        REQUIRED_OPERATOR_SCOPES,
        challenge.ts,
        signature_token,
        &challenge.nonce,
        &platform,
        OPENCLAW_DEVICE_FAMILY,
    );
    let signature = sign_device_payload(&secret, &payload)?;
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
                "mode": "operator"
            },
            "role": "operator",
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
    if let Some(pairing) = parse_pairing_required(&error) {
        return Ok(ConnectOutcome::Pending {
            request_id: pairing.request_id,
            requested_scopes: if pairing.requested_scopes.is_empty() {
                required_scope_strings()
            } else {
                pairing.requested_scopes
            },
        });
    }
    let code = error
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("CONNECT_FAILED");
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("OpenClaw gateway connect failed");
    Err(format!("{code}: {message}"))
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
