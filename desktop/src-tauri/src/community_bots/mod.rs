//! Community Bots — OpenClaw gateway admin console.
//!
//! Desktop stores URL + password on this device and publishes the public
//! catalog to the relay. The remote VPS keeps talking in channels.

mod client;
mod commands;
mod identity;
mod protocol;
mod secret;
mod store;

pub use commands::{
    community_bots_connect, community_bots_disconnect, community_bots_get_status,
    community_bots_list_remote_agents, community_bots_resolve_identity,
    community_bots_reveal_identity_secret, community_bots_sign_profile,
};
