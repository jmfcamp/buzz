//! Community-installed OpenClaw bots (kind:30624).
//!
//! Owner/admin-authored NIP-33 replaceable catalog. Secrets never belong here
//! — only public bot ids, display names, and member pubkeys. Always-on posting
//! stays on the remote OpenClaw VPS; this event is the community-visible
//! membership directory.

use serde::{Deserialize, Serialize};

/// d-tag for the community bot catalog.
pub const COMMUNITY_BOTS_D_TAG: &str = "buzz:community-bots";

/// Maximum number of installed bots in one catalog.
pub const MAX_COMMUNITY_BOTS: usize = 100;

/// Maximum length of a bot id or display name.
pub const MAX_BOT_NAME_LEN: usize = 80;

/// One installed community bot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommunityBot {
    /// Gateway agent id (`main`, `mo`, …).
    pub id: String,
    /// Display name shown to members.
    pub name: String,
    /// Hex Nostr pubkey this bot uses as a community member.
    pub pubkey: String,
    /// Installation source. Currently only `openclaw`.
    pub source: String,
}

/// Versioned community bot catalog stored in event content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommunityBotsPayload {
    /// Payload version. Currently `1`.
    pub version: u32,
    /// Installed bots. Order is not significant.
    pub bots: Vec<CommunityBot>,
}

/// Validate a kind:30624 event's `d` tag and JSON content.
///
/// `d_tag` must be [`COMMUNITY_BOTS_D_TAG`]. Content must parse as
/// [`CommunityBotsPayload`] with `version == 1` and well-formed bots.
/// Secrets (passwords, nsecs, device tokens) are rejected if present.
pub fn validate_community_bots_payload(
    d_tag: Option<&str>,
    content: &str,
) -> Result<CommunityBotsPayload, String> {
    if d_tag != Some(COMMUNITY_BOTS_D_TAG) {
        return Err(format!("d tag must be {COMMUNITY_BOTS_D_TAG}"));
    }
    if content_looks_secret(content) {
        return Err("community-bots content must not include secrets".into());
    }
    let payload: CommunityBotsPayload = serde_json::from_str(content)
        .map_err(|error| format!("community-bots content is not valid JSON: {error}"))?;
    if payload.version != 1 {
        return Err(format!(
            "unsupported community-bots version {}",
            payload.version
        ));
    }
    if payload.bots.len() > MAX_COMMUNITY_BOTS {
        return Err(format!(
            "too many community bots (max {MAX_COMMUNITY_BOTS})"
        ));
    }
    let mut seen_ids = std::collections::BTreeSet::new();
    for bot in &payload.bots {
        validate_bot(bot)?;
        if !seen_ids.insert(bot.id.as_str()) {
            return Err(format!("duplicate bot id {}", bot.id));
        }
    }
    Ok(payload)
}

fn content_looks_secret(content: &str) -> bool {
    let lowered = content.to_ascii_lowercase();
    lowered.contains("\"password\"")
        || lowered.contains("\"nsec\"")
        || lowered.contains("\"device_token\"")
        || lowered.contains("\"devicetoken\"")
        || lowered.contains("\"private_key\"")
        || lowered.contains("\"privatekey\"")
}

fn validate_bot(bot: &CommunityBot) -> Result<(), String> {
    if bot.id.trim().is_empty() || bot.id.len() > MAX_BOT_NAME_LEN {
        return Err("bot id is required and must be at most 80 characters".into());
    }
    if bot
        .id
        .chars()
        .any(|ch| !ch.is_ascii_alphanumeric() && ch != '-' && ch != '_')
    {
        return Err("bot id may only contain ASCII letters, digits, hyphen, or underscore".into());
    }
    if bot.name.trim().is_empty() || bot.name.len() > MAX_BOT_NAME_LEN {
        return Err(format!(
            "bot name is required and must be at most {MAX_BOT_NAME_LEN} characters"
        ));
    }
    if !is_hex_pubkey(&bot.pubkey) {
        return Err("bot pubkey must be a 64-character lowercase hex pubkey".into());
    }
    if bot.source != "openclaw" {
        return Err("bot source must be openclaw".into());
    }
    Ok(())
}

fn is_hex_pubkey(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|ch| matches!(ch, '0'..='9' | 'a'..='f'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_bot() -> CommunityBot {
        CommunityBot {
            id: "mo".into(),
            name: "Mo".into(),
            pubkey: "ab".repeat(32),
            source: "openclaw".into(),
        }
    }

    #[test]
    fn accepts_valid_payload() {
        let payload = CommunityBotsPayload {
            version: 1,
            bots: vec![valid_bot()],
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        let parsed =
            validate_community_bots_payload(Some(COMMUNITY_BOTS_D_TAG), &json).expect("valid");
        assert_eq!(parsed.bots[0].id, "mo");
    }

    #[test]
    fn rejects_wrong_d_tag() {
        let payload = CommunityBotsPayload {
            version: 1,
            bots: vec![],
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(validate_community_bots_payload(Some("other"), &json).is_err());
    }

    #[test]
    fn rejects_password_field() {
        let json = r#"{"version":1,"bots":[],"password":"secret"}"#;
        let error =
            validate_community_bots_payload(Some(COMMUNITY_BOTS_D_TAG), json).expect_err("secret");
        assert!(error.contains("secrets"), "{error}");
    }

    #[test]
    fn rejects_uppercase_pubkey() {
        let mut bot = valid_bot();
        bot.pubkey = "AB".repeat(32);
        let payload = CommunityBotsPayload {
            version: 1,
            bots: vec![bot],
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(validate_community_bots_payload(Some(COMMUNITY_BOTS_D_TAG), &json).is_err());
    }
}
