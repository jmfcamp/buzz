//! Regression: another device's edit to a definition (an inbound kind:30175)
//! must carry its new name and avatar onto THIS device's linked instances.
//!
//! Before the fix the inbound path patched only the definition, so the linked
//! instance kept its old name/avatar and every agent start republished that
//! stale kind:0 — the user saw their rename or new avatar "roll back". Driven
//! through the real `reconcile_inbound_persona_event_blocking` over a
//! `MockRuntime` handle, like `catalog_reconcile_tests`.

use super::reconcile_inbound_persona_event_blocking;
use crate::app_state::build_app_state;
use crate::managed_agents::persona_events::build_persona_event;
use crate::managed_agents::{
    load_managed_agents, save_managed_agents, save_personas, AgentDefinition, ManagedAgentRecord,
};
use nostr::{JsonUtil, ToBech32};
use std::collections::BTreeMap;

const RELAY: &str = "wss://identity-propagation.example";
const PERSONA_ID: &str = "persona-grok";
const OLD_AVATAR: &str = "https://example.test/old.png";
const NEW_AVATAR: &str = "https://example.test/new.jpg";

fn definition(display_name: &str, avatar_url: &str) -> AgentDefinition {
    AgentDefinition {
        session_policy: Default::default(),
        id: PERSONA_ID.to_string(),
        display_name: display_name.to_string(),
        description: None,
        avatar_url: Some(avatar_url.to_string()),
        system_prompt: "Do the work.".to_string(),
        acp_command: None,
        runtime: None,
        model: None,
        provider: None,
        name_pool: Vec::new(),
        is_builtin: false,
        is_active: true,
        shared: false,
        source_team: None,
        source_team_persona_slug: None,
        catalog_source: None,
        team_catalog_source: None,
        env_vars: BTreeMap::new(),
        respond_to: None,
        respond_to_allowlist: Vec::new(),
        parallelism: None,
        created_at: "2026-10-01T00:00:00Z".to_string(),
        updated_at: "2026-10-01T00:00:00Z".to_string(),
    }
}

fn instance(name: &str) -> ManagedAgentRecord {
    let keys = nostr::Keys::generate();
    ManagedAgentRecord {
        session_policy: Default::default(),
        description: None,
        pubkey: keys.public_key().to_hex(),
        name: name.to_string(),
        persona_id: Some(PERSONA_ID.to_string()),
        private_key_nsec: keys.secret_key().to_bech32().expect("bech32"),
        auth_tag: None,
        relay_url: RELAY.to_string(),
        avatar_url: Some(OLD_AVATAR.to_string()),
        acp_command: String::new(),
        agent_command: String::new(),
        agent_command_override: None,
        agent_args: vec![],
        mcp_command: String::new(),
        turn_timeout_seconds: 0,
        idle_timeout_seconds: None,
        max_turn_duration_seconds: None,
        parallelism: 1,
        system_prompt: None,
        model: None,
        provider: None,
        persona_source_version: None,
        env_vars: BTreeMap::new(),
        start_on_app_launch: false,
        auto_restart_on_config_change: true,
        use_openclaw_workspace: false,
        runtime_pid: None,
        backend: Default::default(),
        backend_agent_id: None,
        provider_policy_pending: false,
        provider_binary_path: None,
        team_id: None,
        persona_team_dir: None,
        persona_name_in_team: None,
        created_at: "2026-10-01T00:00:00Z".to_string(),
        updated_at: "2026-10-01T00:00:00Z".to_string(),
        last_started_at: None,
        last_stopped_at: None,
        last_exit_code: None,
        last_error: None,
        last_error_code: None,
        respond_to: Default::default(),
        respond_to_allowlist: vec![],
        display_name: Some(name.to_string()),
        slug: None,
        runtime: None,
        name_pool: vec![],
        is_builtin: false,
        is_active: true,
        shared: false,
        source_team: None,
        source_team_persona_slug: None,
        catalog_source: None,
        team_catalog_source: None,
        definition_respond_to: None,
        definition_respond_to_allowlist: vec![],
        definition_parallelism: None,
        relay_mesh: None,
        effort_level: None,
    }
}

/// Run `body` against a mock app whose data dir lives in a tempdir, with the
/// local store seeded with the "Grok" definition and `instances`.
fn with_seeded_app(
    instances: Vec<ManagedAgentRecord>,
    body: impl FnOnce(&tauri::AppHandle<tauri::test::MockRuntime>, &nostr::Keys),
) {
    let _guard = crate::managed_agents::lock_path_mutex();
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    std::fs::create_dir_all(&home).unwrap();
    let old_home = std::env::var_os("HOME");
    let old_xdg = std::env::var_os("XDG_DATA_HOME");
    std::env::set_var("HOME", &home);
    std::env::set_var("XDG_DATA_HOME", &home);

    let keys = nostr::Keys::generate();
    let state = build_app_state();
    *state.keys.lock().unwrap() = keys.clone();
    *state.relay_url_override.lock().unwrap() = Some(RELAY.to_string());
    let app = tauri::test::mock_builder()
        .manage(state)
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("mock app builds headless");

    save_personas(app.handle(), &[definition("Grok", OLD_AVATAR)]).expect("seed definition");
    save_managed_agents(app.handle(), &instances).expect("seed instances");

    let result =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| body(app.handle(), &keys)));

    match old_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match old_xdg {
        Some(v) => std::env::set_var("XDG_DATA_HOME", v),
        None => std::env::remove_var("XDG_DATA_HOME"),
    }
    if let Err(panic) = result {
        std::panic::resume_unwind(panic);
    }
}

/// The owner's kind:30175 for `persona`, as another device publishes it.
fn signed_definition(keys: &nostr::Keys, persona: &AgentDefinition) -> String {
    build_persona_event(persona)
        .expect("persona event builds")
        .sign_with_keys(keys)
        .expect("persona event signs")
        .as_json()
}

#[test]
fn inbound_rename_and_avatar_follow_onto_the_linked_instance() {
    let grok = instance("Grok");
    let grok_pubkey = grok.pubkey.clone();
    with_seeded_app(vec![grok], |app, keys| {
        let event = signed_definition(keys, &definition("Gore", NEW_AVATAR));
        let (_, profiles) =
            reconcile_inbound_persona_event_blocking(event, RELAY.to_string(), app.clone())
                .expect("inbound definition edit applies");

        let records = load_managed_agents(app).unwrap();
        let record = records.iter().find(|r| r.pubkey == grok_pubkey).unwrap();
        assert_eq!(
            record.name, "Gore",
            "instance follows the definition rename"
        );
        assert_eq!(
            record.avatar_url.as_deref(),
            Some(NEW_AVATAR),
            "instance follows the new avatar"
        );

        assert_eq!(
            profiles.len(),
            1,
            "the linked instance's kind:0 is republished"
        );
        let (_, _, name, avatar, _, _) = &profiles[0];
        assert_eq!(name, "Gore");
        assert_eq!(avatar.as_deref(), Some(NEW_AVATAR));
    });
}

#[test]
fn inbound_rename_keeps_an_individually_named_instance_name_but_updates_its_avatar() {
    let birch = instance("Birch");
    let birch_pubkey = birch.pubkey.clone();
    with_seeded_app(vec![birch], |app, keys| {
        let event = signed_definition(keys, &definition("Gore", NEW_AVATAR));
        let (_, profiles) =
            reconcile_inbound_persona_event_blocking(event, RELAY.to_string(), app.clone())
                .expect("inbound definition edit applies");

        let records = load_managed_agents(app).unwrap();
        let record = records.iter().find(|r| r.pubkey == birch_pubkey).unwrap();
        assert_eq!(
            record.name, "Birch",
            "a pool-named instance keeps its own name"
        );
        assert_eq!(record.avatar_url.as_deref(), Some(NEW_AVATAR));
        assert_eq!(profiles.len(), 1);
    });
}

#[test]
fn inbound_echo_of_an_unchanged_identity_republishes_nothing() {
    let grok = instance("Grok");
    with_seeded_app(vec![grok], |app, keys| {
        let mut same = definition("Grok", OLD_AVATAR);
        same.system_prompt = "Do different work.".to_string();
        let event = signed_definition(keys, &same);
        let (_, profiles) =
            reconcile_inbound_persona_event_blocking(event, RELAY.to_string(), app.clone())
                .expect("inbound definition edit applies");
        assert!(profiles.is_empty(), "a prompt-only edit touches no kind:0");
    });
}
