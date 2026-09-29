//! STT wake gate: only p-tag / wake huddle agents when speech uses
//! the explicit phrase **"At" + agent name** (case-insensitive).
//!
//! Ordinary STT lines still post as kind:9 transcript messages, but with
//! **no** agent p-tags. Bare name address (`Fable, what do you think?`) does
//! **not** wake. Explicit chat @mentions continue to wake via the normal
//! composer send path (unchanged here).

use std::collections::HashSet;

/// One huddle agent and the display names / aliases that can follow `At`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentNameAlias {
    pub pubkey: String,
    /// Non-empty display names / aliases (trimmed). Matched longest-first.
    pub aliases: Vec<String>,
}

/// Return pubkeys of huddle agents addressed by spoken `At <Name>` in `text`.
///
/// Matching rules:
/// - Case-insensitive `At` token at start-of-string or after whitespace.
/// - Immediately followed by whitespace, then an agent alias (longest first).
/// - Alias must end at a word boundary (end of string, whitespace, or
///   comma / punctuation like `,.;:!?)]}`).
/// - Bare agent name without leading `At` does **not** match.
/// - `At` / `at` with no following huddle agent name does **not** match.
pub fn addressed_agent_pubkeys(text: &str, agents: &[AgentNameAlias]) -> Vec<String> {
    if text.is_empty() || agents.is_empty() {
        return Vec::new();
    }

    let mut aliases: Vec<(&str, &str)> = Vec::new(); // (alias, pubkey)
    for agent in agents {
        let pk = agent.pubkey.trim();
        if pk.is_empty() {
            continue;
        }
        for alias in &agent.aliases {
            let a = alias.trim();
            if !a.is_empty() {
                aliases.push((a, pk));
            }
        }
    }
    if aliases.is_empty() {
        return Vec::new();
    }
    // Longest alias first so "At Claim Miner" wins over "At Claim".
    aliases.sort_by_key(|(a, _)| std::cmp::Reverse(a.len()));

    let lower = text.to_ascii_lowercase();
    let mut hit_pubkeys = Vec::new();
    let mut seen = HashSet::new();

    for (idx, _) in lower.match_indices("at") {
        if !is_at_token_start(&lower, idx) {
            continue;
        }
        // "at" must be followed by whitespace then the name.
        let after_at = idx + 2;
        let rest = &lower[after_at..];
        let Some(name_start_rel) = rest.find(|c: char| !c.is_ascii_whitespace()) else {
            continue;
        };
        // Require at least one whitespace between "at" and the name.
        if name_start_rel == 0 {
            continue;
        }
        let name_region = &rest[name_start_rel..];
        // Original-case slice for alias length (aliases compared case-insensitively
        // against the lowercased region; alias lengths are ASCII-oriented names).
        if let Some((_, pubkey)) = aliases.iter().find(|(alias, _)| {
            let al = alias.to_ascii_lowercase();
            name_region
                .get(..al.len())
                .is_some_and(|s| s == al && is_name_boundary(&name_region[al.len()..]))
        }) {
            let pk = (*pubkey).to_string();
            if seen.insert(pk.to_ascii_lowercase()) {
                hit_pubkeys.push(pk);
            }
        }
    }

    hit_pubkeys
}

/// True when `at` at `idx` is a standalone token (start or after whitespace,
/// and not part of a longer word like "that" / "cat").
fn is_at_token_start(lower: &str, idx: usize) -> bool {
    let bytes = lower.as_bytes();
    if idx + 2 > bytes.len() {
        return false;
    }
    // Preceded by start or whitespace.
    if idx > 0 && !bytes[idx - 1].is_ascii_whitespace() {
        return false;
    }
    // "at" itself — already matched; ensure it is not the start of a longer
    // alphabetic token like "atlas" (no whitespace/punct immediately after
    // would still be ok if followed by space+name; "atlas" has no space).
    // Token end: after "at" we need whitespace (required for name) OR end —
    // end alone cannot address anyone, handled by caller.
    true
}

fn is_name_boundary(s: &str) -> bool {
    s.chars().next().is_none_or(|c| {
        c.is_ascii_whitespace()
            || matches!(c, ',' | ';' | '.' | '!' | '?' | ':' | ')' | ']' | '}')
    })
}

/// Build alias lists for huddle agent pubkeys from managed-agent records.
pub fn aliases_from_managed_records(
    agent_pubkeys: &[String],
    records: &[(String, Vec<String>)],
) -> Vec<AgentNameAlias> {
    let mut out = Vec::new();
    for pk in agent_pubkeys {
        let pk_norm = pk.trim();
        if pk_norm.is_empty() {
            continue;
        }
        let mut aliases = Vec::new();
        let mut seen = HashSet::new();
        for (rpk, names) in records {
            if !rpk.eq_ignore_ascii_case(pk_norm) {
                continue;
            }
            for name in names {
                let trimmed = name.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let key = trimmed.to_ascii_lowercase();
                if seen.insert(key) {
                    aliases.push(trimmed.to_string());
                }
            }
        }
        if !aliases.is_empty() {
            out.push(AgentNameAlias {
                pubkey: pk_norm.to_string(),
                aliases,
            });
        }
    }
    out
}

/// Collect display-name aliases from a managed agent name + optional display_name.
pub fn collect_record_aliases(name: &str, display_name: Option<&str>) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for raw in [Some(name), display_name].into_iter().flatten() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_ascii_lowercase();
        if seen.insert(key) {
            out.push(trimmed.to_string());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fable() -> AgentNameAlias {
        AgentNameAlias {
            pubkey: "pk-fable".into(),
            aliases: vec!["Fable".into()],
        }
    }

    fn claim_miner() -> AgentNameAlias {
        AgentNameAlias {
            pubkey: "pk-cm".into(),
            aliases: vec!["Claim Miner".into(), "ClaimMiner".into()],
        }
    }

    #[test]
    fn at_fable_tags_fable() {
        let hits = addressed_agent_pubkeys("At Fable, what do you think?", &[fable()]);
        assert_eq!(hits, vec!["pk-fable"]);
    }

    #[test]
    fn bare_fable_does_not_tag() {
        let hits = addressed_agent_pubkeys("Fable, what do you think?", &[fable()]);
        assert!(hits.is_empty());
    }

    #[test]
    fn at_fable_case_insensitive() {
        let hits = addressed_agent_pubkeys("at fable can you help", &[fable()]);
        assert_eq!(hits, vec!["pk-fable"]);
        let hits = addressed_agent_pubkeys("AT FABLE please", &[fable()]);
        assert_eq!(hits, vec!["pk-fable"]);
    }

    #[test]
    fn at_without_agent_name_does_not_tag() {
        let hits = addressed_agent_pubkeys("At the store later", &[fable()]);
        assert!(hits.is_empty());
        let hits = addressed_agent_pubkeys("we meet at noon", &[fable()]);
        assert!(hits.is_empty());
        let hits = addressed_agent_pubkeys("At", &[fable()]);
        assert!(hits.is_empty());
        let hits = addressed_agent_pubkeys("atlas rising", &[fable()]);
        assert!(hits.is_empty());
    }

    #[test]
    fn stt_without_at_name_logs_no_tags() {
        let agents = vec![fable(), claim_miner()];
        assert!(addressed_agent_pubkeys("sounds good everyone", &agents).is_empty());
        assert!(addressed_agent_pubkeys("Fable and ClaimMiner agree", &agents).is_empty());
    }

    #[test]
    fn at_multiword_alias() {
        let hits =
            addressed_agent_pubkeys("At Claim Miner, summarize please", &[claim_miner()]);
        assert_eq!(hits, vec!["pk-cm"]);
    }

    #[test]
    fn at_name_allows_trailing_punctuation() {
        for text in [
            "At Fable.",
            "At Fable!",
            "At Fable?",
            "At Fable:",
            "At Fable)",
        ] {
            let hits = addressed_agent_pubkeys(text, &[fable()]);
            assert_eq!(hits, vec!["pk-fable"], "text={text}");
        }
    }

    #[test]
    fn only_addressed_agent_tagged() {
        let agents = vec![fable(), claim_miner()];
        let hits = addressed_agent_pubkeys("At Fable take the lead", &agents);
        assert_eq!(hits, vec!["pk-fable"]);
    }

    #[test]
    fn collect_record_aliases_dedups() {
        let a = collect_record_aliases("Fable", Some("fable"));
        assert_eq!(a, vec!["Fable"]);
        let b = collect_record_aliases("Fable", Some("Ship"));
        assert_eq!(b, vec!["Fable", "Ship"]);
    }

    #[test]
    fn aliases_from_managed_records_filters_roster() {
        let records = vec![
            ("pk-fable".into(), vec!["Fable".into()]),
            ("pk-other".into(), vec!["Other".into()]),
        ];
        let out = aliases_from_managed_records(&["pk-fable".into()], &records);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].pubkey, "pk-fable");
        assert_eq!(out[0].aliases, vec!["Fable"]);
    }
}
