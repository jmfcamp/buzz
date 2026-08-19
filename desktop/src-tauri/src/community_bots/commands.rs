//! Tauri commands for the community Bots admin console.

use nostr::Keys;
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::relay::relay_ws_url_with_override;

use super::client::{handshake, list_remote_agents, ConnectOutcome};
use super::protocol::{
    normalize_hex_pubkey, relay_host_key, validate_gateway_url, RemoteAgent,
    REQUIRED_OPERATOR_SCOPES,
};
use super::store::{
    delete_gateway, load_gateway, load_minted_secret, store_gateway, store_minted_secret,
    GatewaySecrets,
};

/// Connection state returned to the settings UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityBotsStatus {
    /// `disconnected`, `pending`, `connected`, or `insufficient_scopes`.
    pub state: String,
    /// Saved gateway URL, if any. Never includes the password.
    pub url: Option<String>,
    /// Whether a password is stored for this community.
    pub has_password: bool,
    /// Pending pairing request id to approve on the VPS.
    pub request_id: Option<String>,
    /// Scopes this connect asked for.
    pub requested_scopes: Vec<String>,
    /// Scopes granted by the last successful hello-ok.
    pub approved_scopes: Vec<String>,
}

/// Identity used when installing a remote agent as a member.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedBotIdentity {
    /// Hex pubkey to add as a community member.
    pub pubkey: String,
    /// True when this desktop minted the key because the VPS had none.
    pub minted: bool,
}

fn requested_scopes() -> Vec<String> {
    REQUIRED_OPERATOR_SCOPES
        .iter()
        .map(|scope| (*scope).to_string())
        .collect()
}

fn relay_host(state: &AppState) -> String {
    relay_host_key(&relay_ws_url_with_override(state))
}

fn status_from_secrets(secrets: Option<&GatewaySecrets>, state: &str) -> CommunityBotsStatus {
    CommunityBotsStatus {
        state: state.to_string(),
        url: secrets.map(|s| s.url.clone()),
        has_password: secrets.is_some_and(|s| !s.password.is_empty()),
        request_id: secrets.and_then(|s| s.pending_request_id.clone()),
        requested_scopes: secrets
            .map(|s| {
                if s.pending_scopes.is_empty() {
                    requested_scopes()
                } else {
                    s.pending_scopes.clone()
                }
            })
            .unwrap_or_else(requested_scopes),
        approved_scopes: secrets
            .map(|s| s.approved_scopes.clone())
            .unwrap_or_default(),
    }
}

/// Return the last known gateway connection state. Does not open a socket.
#[tauri::command]
pub fn community_bots_get_status(
    state: State<'_, AppState>,
) -> Result<CommunityBotsStatus, String> {
    let host = relay_host(&state);
    let secrets = load_gateway(&host)?;
    let Some(secrets) = secrets else {
        return Ok(status_from_secrets(None, "disconnected"));
    };
    if !secrets.approved_scopes.is_empty()
        && super::protocol::scopes_are_sufficient(&secrets.approved_scopes)
    {
        return Ok(status_from_secrets(Some(&secrets), "connected"));
    }
    if secrets.pending_request_id.is_some() {
        return Ok(status_from_secrets(Some(&secrets), "pending"));
    }
    if !secrets.approved_scopes.is_empty() {
        return Ok(status_from_secrets(Some(&secrets), "insufficient_scopes"));
    }
    Ok(status_from_secrets(Some(&secrets), "disconnected"))
}

/// Save URL + password and attempt an OpenClaw gateway handshake.
#[tauri::command]
pub async fn community_bots_connect(
    state: State<'_, AppState>,
    url: String,
    password: String,
    token: Option<String>,
) -> Result<CommunityBotsStatus, String> {
    let host = relay_host(&state);
    let url = validate_gateway_url(&url)?;
    let password = password.trim().to_string();
    let token = token
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let mut secrets = match load_gateway(&host)? {
        Some(existing) if existing.url == url => {
            let mut next = existing;
            if !password.is_empty() {
                next.password = password;
            }
            if token.is_some() {
                next.token = token;
            }
            next
        }
        Some(existing) if password.is_empty() && url == existing.url => existing,
        _ => {
            if password.is_empty() {
                return Err("password is required".into());
            }
            GatewaySecrets::new(url, password, token)?
        }
    };
    if secrets.password.is_empty() {
        return Err("password is required".into());
    }

    let outcome = handshake(&secrets).await?;
    apply_outcome(&mut secrets, &outcome);
    store_gateway(&host, &secrets)?;
    Ok(status_from_outcome(&secrets, &outcome))
}

/// Drop stored gateway credentials. Installed bots stay community members.
#[tauri::command]
pub fn community_bots_disconnect(
    state: State<'_, AppState>,
) -> Result<CommunityBotsStatus, String> {
    let host = relay_host(&state);
    delete_gateway(&host)?;
    Ok(status_from_secrets(None, "disconnected"))
}

/// List remote OpenClaw agents after the gateway is approved.
#[tauri::command]
pub async fn community_bots_list_remote_agents(
    state: State<'_, AppState>,
) -> Result<Vec<RemoteAgent>, String> {
    let host = relay_host(&state);
    let secrets =
        load_gateway(&host)?.ok_or_else(|| "no OpenClaw gateway is connected".to_string())?;
    list_remote_agents(&secrets).await
}

/// Bind to a VPS Nostr identity or mint the smallest member key.
#[tauri::command]
pub fn community_bots_resolve_identity(
    state: State<'_, AppState>,
    agent_id: String,
    pubkey: Option<String>,
) -> Result<ResolvedBotIdentity, String> {
    let host = relay_host(&state);
    let agent_id = agent_id.trim();
    if agent_id.is_empty() {
        return Err("agent id is required".into());
    }
    if let Some(hex) = pubkey.as_deref().and_then(normalize_hex_pubkey) {
        return Ok(ResolvedBotIdentity {
            pubkey: hex,
            minted: false,
        });
    }
    if let Some(secret_hex) = load_minted_secret(&host, agent_id)? {
        let keys = Keys::parse(secret_hex.trim())
            .map_err(|error| format!("stored bot identity is invalid: {error}"))?;
        return Ok(ResolvedBotIdentity {
            pubkey: keys.public_key().to_hex(),
            minted: true,
        });
    }
    let keys = Keys::generate();
    store_minted_secret(&host, agent_id, &keys.secret_key().to_secret_hex())?;
    Ok(ResolvedBotIdentity {
        pubkey: keys.public_key().to_hex(),
        minted: true,
    })
}

fn apply_outcome(secrets: &mut GatewaySecrets, outcome: &ConnectOutcome) {
    match outcome {
        ConnectOutcome::Pending {
            request_id,
            requested_scopes,
        } => {
            secrets.pending_request_id = Some(request_id.clone());
            secrets.pending_scopes = requested_scopes.clone();
            secrets.approved_scopes.clear();
        }
        ConnectOutcome::InsufficientScopes {
            approved_scopes,
            requested_scopes,
        } => {
            secrets.pending_request_id = None;
            secrets.pending_scopes = requested_scopes.clone();
            secrets.approved_scopes = approved_scopes.clone();
            secrets.device_token = None;
        }
        ConnectOutcome::Connected {
            approved_scopes,
            device_token,
        } => {
            secrets.pending_request_id = None;
            secrets.pending_scopes = requested_scopes();
            secrets.approved_scopes = approved_scopes.clone();
            if let Some(token) = device_token {
                secrets.device_token = Some(token.clone());
            }
        }
    }
}

fn status_from_outcome(secrets: &GatewaySecrets, outcome: &ConnectOutcome) -> CommunityBotsStatus {
    match outcome {
        ConnectOutcome::Pending { .. } => status_from_secrets(Some(secrets), "pending"),
        ConnectOutcome::InsufficientScopes { .. } => {
            status_from_secrets(Some(secrets), "insufficient_scopes")
        }
        ConnectOutcome::Connected { .. } => status_from_secrets(Some(secrets), "connected"),
    }
}
