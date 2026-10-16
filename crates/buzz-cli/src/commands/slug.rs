//! `buzz slug` — which Buzz channel a Hula-OS slug (one `plans/<slug>/` scope of
//! work) lives in.
//!
//! Resolution order: the slug's mapping file `plans/<slug>/.buzz-channel.yaml`
//! (written when the slug channel is created), then a channel whose kind:9007
//! create carries `buzz-project-slug=<slug>` (see `channels create
//! --project-home/--slug`), then a unique open channel named `…_<slug>`.
//!
//! Slug-scoped commands (`buzz slug check`, `buzz messages send --slug`) refuse
//! to run from any other channel and print the right link. Ordinary commands
//! never consult this.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use uuid::Uuid;

use crate::client::BuzzClient;
use crate::commands::channels::{
    channel_create_output, project_slug_tags, ChannelSummary, PROJECT_HOME_TAG, PROJECT_SLUG_TAG,
};
use crate::error::CliError;

pub const MAPPING_FILE: &str = ".buzz-channel.yaml";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Mapping {
    pub channel_id: String,
    pub channel_name: Option<String>,
    pub project_home_id: Option<String>,
}

/// Tolerant `key: value` reader (no YAML dependency; the file is three flat keys).
pub fn parse_mapping(text: &str) -> Option<Mapping> {
    let mut m = Mapping::default();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        let v = v.trim().trim_matches('"').trim_matches('\'').to_string();
        if v.is_empty() {
            continue;
        }
        match k.trim() {
            "channel_id" => m.channel_id = v,
            "channel_name" => m.channel_name = Some(v),
            "project_home_id" => m.project_home_id = Some(v),
            _ => {}
        }
    }
    Uuid::parse_str(&m.channel_id).ok().map(|_| m)
}

pub fn render_mapping(m: &Mapping) -> String {
    let mut out = String::from(
        "# Buzz channel for this slug. Written when the slug channel is created;\n# read first by hula skills and `buzz slug where`. Do not hand-edit.\n",
    );
    out.push_str(&format!("channel_id: {}\n", m.channel_id));
    if let Some(n) = &m.channel_name {
        out.push_str(&format!("channel_name: {n}\n"));
    }
    if let Some(h) = &m.project_home_id {
        out.push_str(&format!("project_home_id: {h}\n"));
    }
    out
}

fn mapping_path(plans_dir: &str, slug: &str) -> PathBuf {
    Path::new(plans_dir).join(slug).join(MAPPING_FILE)
}

fn validate_slug(slug: &str) -> Result<(), CliError> {
    if slug.is_empty()
        || !slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(CliError::Usage(format!(
            "slug must be lowercase letters, digits and hyphens (got: {slug})"
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Resolved {
    pub slug: String,
    pub channel_id: String,
    pub name: String,
    pub link: String,
    /// `mapping`, `tag`, `name` or `created`.
    pub source: String,
}

pub fn link(channel_id: &str) -> String {
    format!("hulabuzz://channel/{channel_id}")
}

/// Pure resolution over already-fetched data (unit-tested).
pub fn resolve(
    slug: &str,
    project_home: Option<&str>,
    mapping: Option<&Mapping>,
    channels: &[(String, String, bool)],
    create_tags: &HashMap<String, (Option<String>, Option<String>)>,
) -> Result<Option<Resolved>, CliError> {
    let live: Vec<&(String, String, bool)> = channels.iter().filter(|c| !c.2).collect();
    let mk = |id: &str, name: &str, source: &str| Resolved {
        slug: slug.to_string(),
        channel_id: id.to_string(),
        name: name.to_string(),
        link: link(id),
        source: source.to_string(),
    };
    if let Some(m) = mapping {
        if let Some(c) = live
            .iter()
            .find(|c| c.0.eq_ignore_ascii_case(&m.channel_id))
        {
            return Ok(Some(mk(&c.0, &c.1, "mapping")));
        }
    }
    let home = project_home.map(|h| h.trim().to_ascii_lowercase());
    let home_name = home.as_ref().and_then(|h| {
        channels
            .iter()
            .find(|c| c.0.eq_ignore_ascii_case(h))
            .map(|c| c.1.to_ascii_lowercase())
    });
    let suffix = format!("_{slug}");
    let named: Vec<&&(String, String, bool)> = live
        .iter()
        .filter(|c| {
            let n = c.1.to_ascii_lowercase();
            n.ends_with(&suffix)
                && home_name
                    .as_ref()
                    .is_none_or(|h| n.starts_with(&format!("{h}_")))
        })
        .collect();
    let tagged: Vec<&&&(String, String, bool)> = named
        .iter()
        .filter(|c| {
            create_tags.get(&c.0).is_some_and(|(h, s)| {
                s.as_deref() == Some(slug)
                    && home.as_ref().is_none_or(|want| {
                        h.as_deref().map(str::to_ascii_lowercase).as_ref() == Some(want)
                    })
            })
        })
        .collect();
    match tagged.len() {
        1 => return Ok(Some(mk(&tagged[0].0, &tagged[0].1, "tag"))),
        0 => {}
        _ => {
            return Err(CliError::Usage(format!(
                "several channels are tagged for slug {slug}: {}",
                tagged
                    .iter()
                    .map(|c| format!("#{} ({})", c.1, c.0))
                    .collect::<Vec<_>>()
                    .join(", ")
            )))
        }
    }
    match named.len() {
        0 => Ok(None),
        1 => Ok(Some(mk(&named[0].0, &named[0].1, "name"))),
        _ => Err(CliError::Usage(format!(
            "several channels end with _{slug}; pass --project-home or add plans/{slug}/{MAPPING_FILE}: {}",
            named.iter().map(|c| format!("#{} ({})", c.1, c.0)).collect::<Vec<_>>().join(", ")
        ))),
    }
}

async fn fetch_state(
    client: &BuzzClient,
    slug: &str,
) -> Result<
    (
        Vec<(String, String, bool)>,
        HashMap<String, (Option<String>, Option<String>)>,
    ),
    CliError,
> {
    let arr = client
        .query_paginated(serde_json::json!({ "kinds": [39000] }), 5000)
        .await?;
    let channels: Vec<(String, String, bool)> = arr
        .iter()
        .filter_map(ChannelSummary::from_event)
        .map(|c| (c.channel_id, c.name, c.archived))
        .collect();
    let suffix = format!("_{slug}");
    let ids: Vec<String> = channels
        .iter()
        .filter(|c| c.1.to_ascii_lowercase().ends_with(&suffix))
        .map(|c| c.0.clone())
        .take(50)
        .collect();
    let mut tags = HashMap::new();
    if !ids.is_empty() {
        let raw = client
            .query(&serde_json::json!({ "kinds": [9007], "#h": ids, "limit": 100 }))
            .await?;
        let events: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap_or_default();
        for ev in events {
            let Some(arr) = ev.get("tags").and_then(|t| t.as_array()) else {
                continue;
            };
            let get = |k: &str| {
                arr.iter().find_map(|t| {
                    let t = t.as_array()?;
                    (t.first()?.as_str()? == k).then(|| t.get(1)?.as_str().map(str::to_string))?
                })
            };
            if let Some(h) = get("h") {
                tags.entry(h)
                    .or_insert((get(PROJECT_HOME_TAG), get(PROJECT_SLUG_TAG)));
            }
        }
    }
    Ok((channels, tags))
}

fn read_mapping(plans_dir: &str, slug: &str) -> Option<Mapping> {
    std::fs::read_to_string(mapping_path(plans_dir, slug))
        .ok()
        .and_then(|t| parse_mapping(&t))
}

pub async fn resolve_slug(
    client: &BuzzClient,
    slug: &str,
    project_home: Option<&str>,
    plans_dir: &str,
) -> Result<Option<Resolved>, CliError> {
    validate_slug(slug)?;
    let mapping = read_mapping(plans_dir, slug);
    let home = project_home
        .map(str::to_string)
        .or_else(|| mapping.as_ref().and_then(|m| m.project_home_id.clone()));
    let (channels, tags) = fetch_state(client, slug).await?;
    resolve(slug, home.as_deref(), mapping.as_ref(), &channels, &tags)
}

pub async fn cmd_where(
    client: &BuzzClient,
    slug: &str,
    project_home: Option<&str>,
    plans_dir: &str,
    create: bool,
    name: Option<&str>,
) -> Result<(), CliError> {
    if let Some(found) = resolve_slug(client, slug, project_home, plans_dir).await? {
        println!("{}", serde_json::to_string(&found).expect("serialize"));
        return Ok(());
    }
    if !create {
        return Err(CliError::NotFound(format!(
            "no Buzz channel for slug {slug}. Create it with: buzz slug where {slug} --project-home <home uuid> --create"
        )));
    }
    let home = project_home.ok_or_else(|| {
        CliError::Usage("--create needs --project-home <project home channel uuid>".into())
    })?;
    let home_uuid = Uuid::parse_str(home.trim()).map_err(|_| {
        CliError::Usage(format!(
            "--project-home must be a channel UUID (got: {home})"
        ))
    })?;
    let channel_name = match name {
        Some(n) => n.to_string(),
        None => {
            let (channels, _) = fetch_state(client, slug).await?;
            let home_name = channels
                .iter()
                .find(|c| c.0.eq_ignore_ascii_case(&home_uuid.to_string()))
                .map(|c| c.1.clone())
                .ok_or_else(|| {
                    CliError::NotFound(format!("project home channel {home_uuid} not found"))
                })?;
            format!("{home_name}_{slug}")
        }
    };
    let tags = project_slug_tags(&channel_name, &home_uuid.to_string(), slug)?;
    let channel_uuid = Uuid::new_v4();
    let builder = buzz_sdk::build_create_channel(
        channel_uuid,
        &channel_name,
        Some(buzz_sdk::Visibility::Open),
        Some(buzz_sdk::ChannelKind::Stream),
        None,
        None,
    )
    .map_err(|e| CliError::Other(format!("build_create_channel failed: {e}")))?
    .tags(tags);
    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    let mut out: serde_json::Value = serde_json::from_str(&channel_create_output(
        &resp,
        &channel_uuid.to_string(),
        &channel_name,
    ))
    .unwrap_or_default();
    if out.get("accepted").and_then(|a| a.as_bool()) != Some(true) {
        println!("{out}");
        return Err(CliError::Other(
            "relay did not accept the channel create".into(),
        ));
    }
    // Layer 3: the slug folder records its channel when it exists.
    let dir = Path::new(plans_dir).join(slug);
    let mut written = false;
    if dir.is_dir() {
        let m = Mapping {
            channel_id: channel_uuid.to_string(),
            channel_name: Some(channel_name.clone()),
            project_home_id: Some(home_uuid.to_string()),
        };
        written = std::fs::write(dir.join(MAPPING_FILE), render_mapping(&m)).is_ok();
    }
    out["slug"] = serde_json::json!(slug);
    out["source"] = serde_json::json!("created");
    out["mapping_written"] = serde_json::json!(written);
    println!("{out}");
    Ok(())
}

/// Guard for slug-scoped work: Ok when `channel` is the slug's channel.
pub async fn guard(
    client: &BuzzClient,
    slug: &str,
    channel: &str,
    project_home: Option<&str>,
    plans_dir: &str,
) -> Result<Resolved, CliError> {
    let found = resolve_slug(client, slug, project_home, plans_dir)
        .await?
        .ok_or_else(|| CliError::NotFound(format!("no Buzz channel for slug {slug}")))?;
    if found.channel_id.eq_ignore_ascii_case(channel.trim()) {
        Ok(found)
    } else {
        Err(CliError::Usage(format!(
            "Work on {slug} happens in #{}: {}",
            found.name, found.link
        )))
    }
}

pub async fn dispatch(cmd: crate::SlugCmd, client: &BuzzClient) -> Result<(), CliError> {
    match cmd {
        crate::SlugCmd::Where {
            slug,
            project_home,
            plans_dir,
            create,
            name,
        } => {
            cmd_where(
                client,
                &slug,
                project_home.as_deref(),
                &plans_dir,
                create,
                name.as_deref(),
            )
            .await
        }
        crate::SlugCmd::Check {
            slug,
            channel,
            project_home,
            plans_dir,
        } => {
            let found = guard(client, &slug, &channel, project_home.as_deref(), &plans_dir).await?;
            println!(
                "{}",
                serde_json::json!({ "ok": true, "slug": found.slug, "channel_id": found.channel_id, "name": found.name, "link": found.link, "source": found.source })
            );
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOME: &str = "bc95409d-ab1e-4235-8169-c1824b953d05";
    const A: &str = "4e5504cd-b1bf-4d1d-894e-9c8c15d521d9";
    const B: &str = "11111111-1111-4111-8111-111111111111";

    fn chans() -> Vec<(String, String, bool)> {
        vec![
            (HOME.into(), "products_hulahealth".into(), false),
            (A.into(), "products_hulahealth_portal".into(), false),
            (B.into(), "other_portal".into(), false),
        ]
    }

    #[test]
    fn mapping_round_trip_and_first() {
        let m = Mapping {
            channel_id: B.into(),
            channel_name: Some("other_portal".into()),
            project_home_id: Some(HOME.into()),
        };
        assert_eq!(parse_mapping(&render_mapping(&m)), Some(m.clone()));
        let r = resolve("portal", None, Some(&m), &chans(), &HashMap::new())
            .unwrap()
            .unwrap();
        assert_eq!((r.channel_id.as_str(), r.source.as_str()), (B, "mapping"));
        assert!(parse_mapping("channel_id: nope").is_none());
    }

    #[test]
    fn tag_then_name_with_home_disambiguation() {
        let mut tags = HashMap::new();
        tags.insert(
            A.to_string(),
            (Some(HOME.to_string()), Some("portal".to_string())),
        );
        let r = resolve("portal", None, None, &chans(), &tags)
            .unwrap()
            .unwrap();
        assert_eq!((r.channel_id.as_str(), r.source.as_str()), (A, "tag"));
        // Untagged + two names → ambiguous unless the home narrows it.
        assert!(resolve("portal", None, None, &chans(), &HashMap::new()).is_err());
        let r = resolve("portal", Some(HOME), None, &chans(), &HashMap::new())
            .unwrap()
            .unwrap();
        assert_eq!((r.channel_id.as_str(), r.source.as_str()), (A, "name"));
        assert!(resolve("missing", None, None, &chans(), &HashMap::new())
            .unwrap()
            .is_none());
        assert_eq!(r.link, format!("hulabuzz://channel/{A}"));
    }
}
