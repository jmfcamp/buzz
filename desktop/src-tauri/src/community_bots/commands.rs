//! Tauri commands for the community Bots admin console.

use nostr::Keys;
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::relay::relay_ws_url_with_override;

use super::client::{connect_failure_outcome, handshake, list_remote_agents, ConnectOutcome};
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
    /// This desktop's OpenClaw device id (sha256 of the Ed25519 public key).
    pub device_id: Option<String>,
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
        request_id: secrets.and_then(|s| {
            s.pending_request_id
                .as_deref()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned)
        }),
        device_id: secrets.and_then(|s| s.device_id().ok()),
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

/// Reuse the stored Ed25519 device when the URL matches this community.
///
/// Handshake pairing / NOT_PAIRED must not mint a new identity — the
/// gateway already has a pending or approved row for this public key.
fn resolve_connect_secrets(
    existing: Option<GatewaySecrets>,
    url: String,
    password: String,
    token: Option<String>,
) -> Result<GatewaySecrets, String> {
    match existing {
        Some(existing) if existing.url == url => {
            let mut next = existing;
            if !password.is_empty() {
                next.password = password;
            }
            if token.is_some() {
                next.token = token;
            }
            if next.password.is_empty() {
                return Err("password is required".into());
            }
            Ok(next)
        }
        _ => {
            if password.is_empty() {
                return Err("password is required".into());
            }
            GatewaySecrets::new(url, password, token)
        }
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
    Ok(status_from_secrets(
        Some(&secrets),
        stored_status_state(&secrets),
    ))
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

    let mut secrets = resolve_connect_secrets(load_gateway(&host)?, url, password, token)?;
    // Persist the device identity before the gateway sees the public key.
    // If handshake returns pairing / NOT_PAIRED, the next Connect must
    // present the same device — not a freshly minted one.
    store_gateway(&host, &secrets)?;

    let outcome = match handshake(&secrets).await {
        Ok(outcome) => outcome,
        Err(error) => {
            if let Some(outcome) = connect_failure_outcome(&error) {
                outcome
            } else {
                return Err(error);
            }
        }
    };
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

fn stored_status_state(secrets: &GatewaySecrets) -> &'static str {
    if !secrets.approved_scopes.is_empty()
        && super::protocol::scopes_are_sufficient(&secrets.approved_scopes)
    {
        return "connected";
    }
    if secrets.pending_request_id.is_some() {
        return "pending";
    }
    if !secrets.approved_scopes.is_empty() {
        return "insufficient_scopes";
    }
    "disconnected"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_not_paired_stores_device_and_second_connect_reuses_it() {
        let url = "wss://gateway.example/ws".to_string();
        let first =
            resolve_connect_secrets(None, url.clone(), "secret".into(), None).expect("first");
        let first_key = first.device_private_key.clone();
        let first_device_id = first.device_id().expect("device id");

        let outcome = ConnectOutcome::Pending {
            request_id: String::new(),
            requested_scopes: requested_scopes(),
        };
        let mut stored = first;
        apply_outcome(&mut stored, &outcome);

        assert_eq!(stored_status_state(&stored), "pending");
        let status = status_from_outcome(&stored, &outcome);
        assert_eq!(status.state, "pending");
        assert_eq!(status.request_id, None);
        assert_eq!(status.device_id.as_deref(), Some(first_device_id.as_str()));
        assert_eq!(
            status.requested_scopes,
            vec!["operator.read", "operator.write", "operator.admin"]
        );

        let second = resolve_connect_secrets(Some(stored.clone()), url, "secret".into(), None)
            .expect("reuse");
        assert_eq!(
            second.device_private_key, first_key,
            "same URL must not mint a new device after NOT_PAIRED"
        );
        assert_eq!(second.device_id().expect("id"), first_device_id);

        let other = resolve_connect_secrets(
            Some(stored),
            "wss://other.example/ws".into(),
            "secret".into(),
            None,
        )
        .expect("other url");
        assert_ne!(other.device_private_key, first_key);
    }

    #[test]
    fn pending_with_request_id_surfaces_id_and_device() {
        let mut secrets =
            GatewaySecrets::new("wss://gateway.example/ws".into(), "secret".into(), None)
                .expect("secrets");
        let device_id = secrets.device_id().expect("device id");
        apply_outcome(
            &mut secrets,
            &ConnectOutcome::Pending {
                request_id: "req-42".into(),
                requested_scopes: vec!["operator.write".into()],
            },
        );
        let status = status_from_secrets(Some(&secrets), stored_status_state(&secrets));
        assert_eq!(status.state, "pending");
        assert_eq!(status.request_id.as_deref(), Some("req-42"));
        assert_eq!(status.device_id.as_deref(), Some(device_id.as_str()));
        assert_eq!(status.requested_scopes, vec!["operator.write"]);
    }

    #[test]
    fn connected_outcome_persists_device_token() {
        let mut secrets =
            GatewaySecrets::new("wss://gateway.example/ws".into(), "secret".into(), None)
                .expect("secrets");
        apply_outcome(
            &mut secrets,
            &ConnectOutcome::Connected {
                approved_scopes: requested_scopes(),
                device_token: Some("hello-ok-token".into()),
            },
        );
        assert_eq!(secrets.device_token.as_deref(), Some("hello-ok-token"));
        assert_eq!(stored_status_state(&secrets), "connected");
    }
}
