//! In-memory browser-agent grants keyed by webview label.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BrowserAgentMode {
    Observe,
    Drive,
}

impl BrowserAgentMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Observe => "observe",
            Self::Drive => "drive",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BrowserAgentSurface {
    Playground,
    Pin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAgentGrant {
    pub webview_label: String,
    pub surface: BrowserAgentSurface,
    pub surface_id: String,
    pub agent_id: String,
    pub agent_pubkey: String,
    pub channel_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_root: Option<String>,
    pub mode: BrowserAgentMode,
    pub created_at_ms: u64,
}

#[derive(Debug, Default)]
pub struct BrowserAgentGrantStore {
    grants: Mutex<HashMap<String, BrowserAgentGrant>>,
}

impl BrowserAgentGrantStore {
    pub fn get(&self, webview_label: &str) -> Option<BrowserAgentGrant> {
        self.grants
            .lock()
            .ok()?
            .get(webview_label)
            .cloned()
    }

    pub fn list_for_agent(&self, agent_pubkey: &str) -> Vec<BrowserAgentGrant> {
        let Ok(map) = self.grants.lock() else {
            return Vec::new();
        };
        map.values()
            .filter(|g| g.agent_pubkey == agent_pubkey)
            .cloned()
            .collect()
    }

    pub fn list_all(&self) -> Vec<BrowserAgentGrant> {
        let Ok(map) = self.grants.lock() else {
            return Vec::new();
        };
        map.values().cloned().collect()
    }

    /// Insert or replace. Returns the previous grant when replacing another agent.
    pub fn set(
        &self,
        grant: BrowserAgentGrant,
        allow_replace: bool,
    ) -> Result<Option<BrowserAgentGrant>, String> {
        let mut map = self
            .grants
            .lock()
            .map_err(|_| "browser agent grant lock poisoned".to_string())?;
        if let Some(existing) = map.get(&grant.webview_label) {
            if existing.agent_pubkey != grant.agent_pubkey && !allow_replace {
                return Err(
                    "another agent already holds this browser; confirm replace".into(),
                );
            }
        }
        let previous = map.insert(grant.webview_label.clone(), grant);
        Ok(previous)
    }

    pub fn clear(&self, webview_label: &str) -> Option<BrowserAgentGrant> {
        self.grants.lock().ok()?.remove(webview_label)
    }

    pub fn clear_surface(&self, surface_id: &str) -> Vec<BrowserAgentGrant> {
        let Ok(mut map) = self.grants.lock() else {
            return Vec::new();
        };
        let keys: Vec<String> = map
            .iter()
            .filter(|(_, g)| g.surface_id == surface_id)
            .map(|(k, _)| k.clone())
            .collect();
        keys.into_iter()
            .filter_map(|k| map.remove(&k))
            .collect()
    }

    pub fn require_mode(
        &self,
        webview_label: &str,
        agent_pubkey: &str,
        mode: BrowserAgentMode,
    ) -> Result<BrowserAgentGrant, String> {
        let grant = self
            .get(webview_label)
            .ok_or_else(|| "no browser agent grant for this webview".to_string())?;
        if grant.agent_pubkey != agent_pubkey {
            return Err("caller is not the granted agent for this webview".into());
        }
        match (mode, grant.mode) {
            (BrowserAgentMode::Observe, BrowserAgentMode::Observe)
            | (BrowserAgentMode::Observe, BrowserAgentMode::Drive)
            | (BrowserAgentMode::Drive, BrowserAgentMode::Drive) => Ok(grant),
            (BrowserAgentMode::Drive, BrowserAgentMode::Observe) => {
                Err("drive requires Drive mode grant".into())
            }
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn playground_label(sid: &str, window_label: &str) -> String {
    if window_label == "main" || window_label.is_empty() {
        format!("playground-{sid}")
    } else {
        format!("playground-{sid}--{window_label}")
    }
}

pub fn pin_label(pin_id: &str, window_label: &str) -> String {
    if window_label == "main" || window_label.is_empty() {
        format!("pin-{pin_id}")
    } else {
        format!("pin-{pin_id}--{window_label}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(label: &str, pubkey: &str, mode: BrowserAgentMode) -> BrowserAgentGrant {
        BrowserAgentGrant {
            webview_label: label.into(),
            surface: BrowserAgentSurface::Playground,
            surface_id: "demo".into(),
            agent_id: pubkey.into(),
            agent_pubkey: pubkey.into(),
            channel_id: "chan".into(),
            thread_root: None,
            mode,
            created_at_ms: 1,
        }
    }

    #[test]
    fn one_agent_replace_requires_flag() {
        let store = BrowserAgentGrantStore::default();
        store
            .set(sample("playground-a", "aa", BrowserAgentMode::Observe), false)
            .unwrap();
        let err = store
            .set(sample("playground-a", "bb", BrowserAgentMode::Drive), false)
            .unwrap_err();
        assert!(err.contains("confirm replace"));
        store
            .set(sample("playground-a", "bb", BrowserAgentMode::Drive), true)
            .unwrap();
        assert_eq!(
            store.get("playground-a").unwrap().agent_pubkey,
            "bb"
        );
    }

    #[test]
    fn observe_grant_allows_observe_not_drive() {
        let store = BrowserAgentGrantStore::default();
        store
            .set(sample("playground-a", "aa", BrowserAgentMode::Observe), false)
            .unwrap();
        assert!(store
            .require_mode("playground-a", "aa", BrowserAgentMode::Observe)
            .is_ok());
        assert!(store
            .require_mode("playground-a", "aa", BrowserAgentMode::Drive)
            .is_err());
    }

    #[test]
    fn drive_grant_allows_observe_and_drive() {
        let store = BrowserAgentGrantStore::default();
        store
            .set(sample("playground-a", "aa", BrowserAgentMode::Drive), false)
            .unwrap();
        assert!(store
            .require_mode("playground-a", "aa", BrowserAgentMode::Observe)
            .is_ok());
        assert!(store
            .require_mode("playground-a", "aa", BrowserAgentMode::Drive)
            .is_ok());
    }

    #[test]
    fn clear_surface_removes_all_labels() {
        let store = BrowserAgentGrantStore::default();
        store
            .set(sample("playground-demo", "aa", BrowserAgentMode::Observe), false)
            .unwrap();
        store
            .set(
                sample("playground-demo--pop", "aa", BrowserAgentMode::Observe),
                false,
            )
            .unwrap();
        let removed = store.clear_surface("demo");
        assert_eq!(removed.len(), 2);
        assert!(store.get("playground-demo").is_none());
    }

    #[test]
    fn take_control_clears_to_off() {
        let store = BrowserAgentGrantStore::default();
        store
            .set(sample("playground-a", "aa", BrowserAgentMode::Drive), false)
            .unwrap();
        assert!(store.clear("playground-a").is_some());
        assert!(store.get("playground-a").is_none());
    }
}
