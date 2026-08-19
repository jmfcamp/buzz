//! Persist OpenClaw gateway credentials on the admin device.
//!
//! URL + password + device identity live in the OS keyring via
//! [`SecretStore`]. They are never written into relay events.

use serde::{Deserialize, Serialize};

use crate::app_state::keyring_service;
use crate::secret_store::SecretStore;

use super::protocol::{
    decode_device_secret, device_id_from_public_key, encode_device_secret, gateway_secret_key,
    generate_device_secret, minted_identity_secret_key, public_key_from_secret,
};

/// Stored gateway connection for one community relay.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewaySecrets {
    /// OpenClaw gateway WebSocket URL (`wss://…`).
    pub url: String,
    /// `gateway.remote.password`. Required for the user's working setup.
    pub password: String,
    /// Optional shared token. Password is still stored when both are set.
    #[serde(default)]
    pub token: Option<String>,
    /// Hex-encoded Ed25519 device secret. Stable across reconnects.
    pub device_private_key: String,
    /// Device token issued after pairing approval.
    #[serde(default)]
    pub device_token: Option<String>,
    /// Last pending pairing request id, if any.
    #[serde(default)]
    pub pending_request_id: Option<String>,
    /// Scopes asked for on the pending (or last) connect.
    #[serde(default)]
    pub pending_scopes: Vec<String>,
    /// Scopes reported by the last successful `hello-ok`.
    #[serde(default)]
    pub approved_scopes: Vec<String>,
}

impl GatewaySecrets {
    /// Build a new record, generating a device key when one is not supplied.
    pub fn new(url: String, password: String, token: Option<String>) -> Result<Self, String> {
        let secret = generate_device_secret()?;
        Ok(Self {
            url,
            password,
            token,
            device_private_key: encode_device_secret(&secret),
            device_token: None,
            pending_request_id: None,
            pending_scopes: Vec::new(),
            approved_scopes: Vec::new(),
        })
    }

    /// Decode the persisted device secret.
    pub fn device_secret(&self) -> Result<[u8; 32], String> {
        decode_device_secret(&self.device_private_key)
    }

    /// OpenClaw device id: SHA-256 of the raw 32-byte Ed25519 public key, hex.
    pub fn device_id(&self) -> Result<String, String> {
        let public_key = public_key_from_secret(&self.device_secret()?);
        Ok(device_id_from_public_key(&public_key))
    }
}

fn store() -> Result<&'static SecretStore, String> {
    Ok(SecretStore::shared(keyring_service()))
}

/// Load gateway secrets for `relay_host`.
pub fn load_gateway(relay_host: &str) -> Result<Option<GatewaySecrets>, String> {
    let raw = store()?.load(&gateway_secret_key(relay_host))?;
    let Some(raw) = raw else {
        return Ok(None);
    };
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| format!("corrupt community-bots secrets: {error}"))
}

/// Persist gateway secrets for `relay_host`.
pub fn store_gateway(relay_host: &str, secrets: &GatewaySecrets) -> Result<(), String> {
    let raw = serde_json::to_string(secrets)
        .map_err(|error| format!("failed to serialize community-bots secrets: {error}"))?;
    store()?.store(&gateway_secret_key(relay_host), &raw)
}

/// Delete gateway URL/password/device token. Installed-bot catalog is unchanged.
pub fn delete_gateway(relay_host: &str) -> Result<(), String> {
    store()?.delete(&gateway_secret_key(relay_host))
}

/// Load a previously minted bot nsec (hex), if this admin device ever created one.
///
/// Install no longer writes this key. The loader remains so leftover Mac-minted
/// identities can still be inspected without minting new ones.
pub fn load_minted_secret(relay_host: &str, agent_id: &str) -> Result<Option<String>, String> {
    store()?.load(&minted_identity_secret_key(relay_host, agent_id))
}
