//! Community-shared pinned websites (kind:30623).
//!
//! Owner/admin-authored NIP-33 replaceable list. Personal pins never use this
//! kind — they stay on the author's device. Session cookies are always local.

use serde::{Deserialize, Serialize};

/// d-tag for the community pinned-sites list.
pub const COMMUNITY_PINNED_SITES_D_TAG: &str = "buzz:community-pins";

/// Maximum number of community pins in one list.
pub const MAX_COMMUNITY_PINS: usize = 50;

/// Maximum length of a pin name or icon id.
pub const MAX_PIN_NAME_LEN: usize = 80;

/// Maximum length of a pin URL.
pub const MAX_PIN_URL_LEN: usize = 2048;

/// One community-shared pin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommunityPinnedSite {
    /// Stable pin id (UUID or other unique string).
    pub id: String,
    /// Display name in the primary menu.
    pub name: String,
    /// Start / home URL. Must be `https:`.
    pub url: String,
    /// Lucide icon id from the desktop allowlist.
    pub icon: String,
    /// When true, clients may poll the start URL for changes.
    #[serde(default, rename = "pollForChanges")]
    pub poll_for_changes: bool,
}

/// Versioned community pin list stored in event content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommunityPinnedSitesPayload {
    /// Payload version. Currently `1`.
    pub version: u32,
    /// Shared pins, newest last.
    pub pins: Vec<CommunityPinnedSite>,
}

/// Validate a kind:30623 event's `d` tag and JSON content.
///
/// `d_tag` must be [`COMMUNITY_PINNED_SITES_D_TAG`]. Content must parse as
/// [`CommunityPinnedSitesPayload`] with `version == 1` and well-formed pins.
pub fn validate_community_pinned_sites_payload(
    d_tag: Option<&str>,
    content: &str,
) -> Result<CommunityPinnedSitesPayload, String> {
    if d_tag != Some(COMMUNITY_PINNED_SITES_D_TAG) {
        return Err(format!("d tag must be {COMMUNITY_PINNED_SITES_D_TAG}"));
    }
    let payload: CommunityPinnedSitesPayload = serde_json::from_str(content)
        .map_err(|error| format!("pinned-sites content is not valid JSON: {error}"))?;
    if payload.version != 1 {
        return Err(format!(
            "unsupported pinned-sites version {}",
            payload.version
        ));
    }
    if payload.pins.len() > MAX_COMMUNITY_PINS {
        return Err(format!(
            "too many community pins (max {MAX_COMMUNITY_PINS})"
        ));
    }
    let mut seen = std::collections::BTreeSet::new();
    for pin in &payload.pins {
        validate_pin(pin)?;
        if !seen.insert(pin.id.as_str()) {
            return Err(format!("duplicate pin id {}", pin.id));
        }
    }
    Ok(payload)
}

fn validate_pin(pin: &CommunityPinnedSite) -> Result<(), String> {
    if pin.id.trim().is_empty() || pin.id.len() > 80 {
        return Err("pin id is required and must be at most 80 characters".into());
    }
    if pin
        .id
        .chars()
        .any(|ch| !ch.is_ascii_alphanumeric() && ch != '-' && ch != '_')
    {
        return Err("pin id may only contain ASCII letters, digits, hyphen, or underscore".into());
    }
    if pin.name.trim().is_empty() || pin.name.len() > MAX_PIN_NAME_LEN {
        return Err(format!(
            "pin name is required and must be at most {MAX_PIN_NAME_LEN} characters"
        ));
    }
    if pin.icon.trim().is_empty() || pin.icon.len() > MAX_PIN_NAME_LEN {
        return Err("pin icon is required".into());
    }
    if !pin
        .icon
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        return Err("pin icon may only contain ASCII letters, digits, or hyphen".into());
    }
    validate_https_url(&pin.url)?;
    Ok(())
}

fn validate_https_url(raw: &str) -> Result<(), String> {
    if raw.len() > MAX_PIN_URL_LEN {
        return Err(format!(
            "pin URL must be at most {MAX_PIN_URL_LEN} characters"
        ));
    }
    let parsed = url::Url::parse(raw).map_err(|_| "pin URL is not a valid URL".to_string())?;
    if parsed.scheme() != "https" {
        return Err("pin URL must use https".into());
    }
    if parsed.host_str().is_none() {
        return Err("pin URL must include a host".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_pin() -> CommunityPinnedSite {
        CommunityPinnedSite {
            id: "wayfinder".into(),
            name: "Wayfinder".into(),
            url: "https://wayfinder.huladesk.com".into(),
            icon: "compass".into(),
            poll_for_changes: false,
        }
    }

    #[test]
    fn accepts_valid_payload() {
        let payload = CommunityPinnedSitesPayload {
            version: 1,
            pins: vec![valid_pin()],
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        let parsed =
            validate_community_pinned_sites_payload(Some(COMMUNITY_PINNED_SITES_D_TAG), &json)
                .expect("valid");
        assert_eq!(parsed.pins[0].name, "Wayfinder");
    }

    #[test]
    fn rejects_http_url() {
        let mut pin = valid_pin();
        pin.url = "http://example.com".into();
        let payload = CommunityPinnedSitesPayload {
            version: 1,
            pins: vec![pin],
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        let error =
            validate_community_pinned_sites_payload(Some(COMMUNITY_PINNED_SITES_D_TAG), &json)
                .expect_err("http");
        assert!(error.contains("https"), "{error}");
    }

    #[test]
    fn rejects_wrong_d_tag() {
        let payload = CommunityPinnedSitesPayload {
            version: 1,
            pins: vec![],
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(validate_community_pinned_sites_payload(Some("other"), &json).is_err());
    }
}
