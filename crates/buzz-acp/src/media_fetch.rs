//! Download channel attachments with Blossom `t=get` auth and stage them as
//! local files the agent can read without hitting a 401 on `/media/…`.
//!
//! GET/HEAD `/media/*` always requires Blossom auth plus relay membership. The
//! prompt historically embedded the raw media URL in `imeta` tags; agents then
//! fetch it unauthenticated and fail. This module signs the get, writes the
//! bytes under a cache directory, and returns paths (plus optional ACP image
//! content blocks for small images).

use std::path::{Path, PathBuf};

use base64::Engine;
use nostr::{EventBuilder, JsonUtil, Keys, Kind, Tag, Timestamp};

use crate::relay::{RelayError, RestClient};

/// Cap for embedding an image as an ACP base64 content block. Larger files
/// are still staged on disk; only the embed is skipped.
const ACP_IMAGE_EMBED_MAX_BYTES: usize = 2 * 1024 * 1024;
/// Hard ceiling for any single download.
const MEDIA_DOWNLOAD_MAX_BYTES: usize = 25 * 1024 * 1024;
/// Max attachments staged per prompt turn.
const MEDIA_PER_TURN_CAP: usize = 8;

/// One staged attachment ready for the agent.
#[derive(Debug, Clone)]
pub struct StagedAttachment {
    pub local_path: PathBuf,
    pub mime: String,
    pub sha256: String,
    pub source_url: String,
    /// When set, include as an ACP `{type:image, data, mimeType}` block.
    pub acp_image_base64: Option<String>,
}

/// Extract NIP-92 `imeta` descriptors from a kind:9 (etc.) event's tags.
pub fn extract_imeta_refs(tags: &[Vec<String>]) -> Vec<ImetaRef> {
    let mut out = Vec::new();
    for tag in tags {
        if tag.first().map(String::as_str) != Some("imeta") {
            continue;
        }
        let mut url = None;
        let mut mime = None;
        let mut sha256 = None;
        for entry in tag.iter().skip(1) {
            if let Some(rest) = entry.strip_prefix("url ") {
                url = Some(rest.to_string());
            } else if let Some(rest) = entry.strip_prefix("m ") {
                mime = Some(rest.to_string());
            } else if let Some(rest) = entry.strip_prefix("x ") {
                sha256 = Some(rest.to_ascii_lowercase());
            }
        }
        let Some(url) = url else { continue };
        out.push(ImetaRef {
            url,
            mime: mime.unwrap_or_else(|| "application/octet-stream".into()),
            sha256,
        });
    }
    out
}

#[derive(Debug, Clone)]
pub struct ImetaRef {
    pub url: String,
    pub mime: String,
    pub sha256: Option<String>,
}

/// Stage every `imeta` attachment on `events` that points at this relay's
/// `/media/` path. Failures are logged and skipped — the turn still proceeds.
pub async fn stage_event_attachments(
    rest: &RestClient,
    events: impl IntoIterator<Item = &nostr::Event>,
) -> Vec<StagedAttachment> {
    let mut staged = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for event in events {
        let tags: Vec<Vec<String>> = event.tags.iter().map(|t| t.as_slice().to_vec()).collect();
        for imeta in extract_imeta_refs(&tags) {
            if staged.len() >= MEDIA_PER_TURN_CAP {
                tracing::warn!(
                    cap = MEDIA_PER_TURN_CAP,
                    "media_fetch: attachment cap reached; remaining imeta skipped"
                );
                return staged;
            }
            let Ok(url) = media_url_for_relay(&rest.base_url, &imeta.url) else {
                tracing::debug!(url = %imeta.url, "media_fetch: skipping non-relay media URL");
                continue;
            };
            let key = imeta
                .sha256
                .clone()
                .unwrap_or_else(|| url.clone());
            if !seen.insert(key) {
                continue;
            }
            match download_and_stage(rest, &url, &imeta.mime, imeta.sha256.as_deref()).await {
                Ok(att) => staged.push(att),
                Err(e) => {
                    tracing::warn!(url = %url, "media_fetch: download failed: {e}");
                }
            }
        }
    }
    staged
}

/// Render a prompt section that points the agent at local files and warns
/// against fetching the authenticated media URL.
pub fn format_attachments_section(attachments: &[StagedAttachment]) -> Option<String> {
    if attachments.is_empty() {
        return None;
    }
    let mut body = String::from(
        "Channel attachments were downloaded with the agent's Blossom credentials \
         and saved locally. Read these files directly. Do NOT HTTP-fetch the \
         original /media/ URLs — they require Blossom auth and will return 401.\n",
    );
    for (i, att) in attachments.iter().enumerate() {
        body.push_str(&format!(
            "\n{}. {} — {} (sha256 {})\n   local file: {}\n   original URL (do not fetch): {}",
            i + 1,
            att.mime,
            att.local_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("attachment"),
            if att.sha256.is_empty() {
                "unknown"
            } else {
                &att.sha256
            },
            att.local_path.display(),
            att.source_url,
        ));
    }
    Some(crate::prompt_framing::semantic_section(
        "buzz-attachments",
        &body,
    ))
}

/// ACP image content blocks for small images (base64). Order matches
/// [`StagedAttachment::acp_image_base64`] presence.
pub fn acp_image_blocks(attachments: &[StagedAttachment]) -> Vec<serde_json::Value> {
    attachments
        .iter()
        .filter_map(|att| {
            let data = att.acp_image_base64.as_ref()?;
            if !att.mime.starts_with("image/") {
                return None;
            }
            Some(serde_json::json!({
                "type": "image",
                "mimeType": att.mime,
                "data": data,
            }))
        })
        .collect()
}

async fn download_and_stage(
    rest: &RestClient,
    url: &str,
    mime: &str,
    sha_hint: Option<&str>,
) -> Result<StagedAttachment, RelayError> {
    let bytes = rest.download_media(url).await?;
    if bytes.len() > MEDIA_DOWNLOAD_MAX_BYTES {
        return Err(RelayError::Http(format!(
            "media exceeds {MEDIA_DOWNLOAD_MAX_BYTES} byte limit (got {})",
            bytes.len()
        )));
    }
    let sha256 = sha_hint
        .map(str::to_string)
        .filter(|s| s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()))
        .unwrap_or_else(|| hex::encode(sha2_hash(&bytes)));
    let ext = extension_for(mime, url);
    let dir = media_cache_dir()?;
    let path = dir.join(format!("{sha256}{ext}"));
    if !path.exists() {
        std::fs::write(&path, &bytes)
            .map_err(|e| RelayError::Http(format!("failed to stage media: {e}")))?;
    }
    let acp_image_base64 = if mime.starts_with("image/") && bytes.len() <= ACP_IMAGE_EMBED_MAX_BYTES
    {
        Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
    } else {
        None
    };
    Ok(StagedAttachment {
        local_path: path,
        mime: mime.to_string(),
        sha256,
        source_url: url.to_string(),
        acp_image_base64,
    })
}

fn sha2_hash(bytes: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().into()
}

fn media_cache_dir() -> Result<PathBuf, RelayError> {
    let base = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".cache"))
        })
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join("buzz-acp").join("media");
    std::fs::create_dir_all(&dir)
        .map_err(|e| RelayError::Http(format!("media cache dir: {e}")))?;
    Ok(dir)
}

fn extension_for(mime: &str, url: &str) -> String {
    if let Some(ext) = mime_to_ext(mime) {
        return format!(".{ext}");
    }
    url::Url::parse(url)
        .ok()
        .and_then(|u| {
            Path::new(u.path())
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{}", e.to_ascii_lowercase()))
        })
        .unwrap_or_default()
}

fn mime_to_ext(mime: &str) -> Option<&'static str> {
    match mime {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "video/mp4" => Some("mp4"),
        "application/pdf" => Some("pdf"),
        _ => None,
    }
}

/// Accept only this relay's `/media/{sha…}` URLs (absolute or path-absolute).
pub fn media_url_for_relay(relay_base: &str, input: &str) -> Result<String, RelayError> {
    let input = input.trim();
    let relay = url::Url::parse(relay_base)
        .map_err(|e| RelayError::Http(format!("invalid relay URL: {e}")))?;
    if input.starts_with("http://") || input.starts_with("https://") {
        let parsed = url::Url::parse(input)
            .map_err(|e| RelayError::Http(format!("invalid media URL: {e}")))?;
        if !parsed.path().starts_with("/media/") {
            return Err(RelayError::Http(
                "media URL must point at a /media/ path".into(),
            ));
        }
        if parsed.scheme() != relay.scheme()
            || parsed.host_str() != relay.host_str()
            || parsed.port_or_known_default() != relay.port_or_known_default()
        {
            return Err(RelayError::Http(
                "refusing to sign media GET for a non-relay origin".into(),
            ));
        }
        let sha = parsed
            .path()
            .strip_prefix("/media/")
            .ok_or_else(|| RelayError::Http("media path missing".into()))?;
        if !is_safe_media_path_segment(sha) {
            return Err(RelayError::Http("unsafe media path segment".into()));
        }
        return Ok(input.to_string());
    }
    if input.contains("://") {
        return Err(RelayError::Http(
            "media URL must use http:// or https://".into(),
        ));
    }
    let sha = input.trim_start_matches('/').trim_start_matches("media/");
    if !is_safe_media_path_segment(sha) {
        return Err(RelayError::Http("unsafe media path segment".into()));
    }
    Ok(format!(
        "{}/media/{sha}",
        relay_base.trim_end_matches('/')
    ))
}

fn is_safe_media_path_segment(sha256_ext: &str) -> bool {
    let segments: Vec<&str> = sha256_ext.split('.').collect();
    match segments.as_slice() {
        [hash] => is_lower_hex_sha256(hash),
        [hash, ext] => is_lower_hex_sha256(hash) && is_safe_media_ext(ext),
        [hash, "thumb", "jpg"] => is_lower_hex_sha256(hash),
        _ => false,
    }
}

fn is_lower_hex_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
}

fn is_safe_media_ext(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 8
        && value
            .chars()
            .all(|c| matches!(c, 'a'..='z' | '0'..='9'))
}

impl RestClient {
    /// Download a Blossom media blob with BUD-01 `t=get` auth (and optional
    /// NIP-OA `x-auth-tag`). Never logs or returns the private key.
    pub async fn download_media(&self, media_url: &str) -> Result<Vec<u8>, RelayError> {
        let url = media_url_for_relay(&self.base_url, media_url)?;
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| RelayError::Http(format!("http client init failed: {e}")))?;
        let auth_header = sign_blossom_get(&self.keys, &url)?;
        let mut req = client.get(&url).header("Authorization", auth_header);
        if let Some(ref tag) = self.auth_tag_json {
            req = req.header("x-auth-tag", tag);
        }
        let resp = req
            .send()
            .await
            .map_err(|e| RelayError::Http(e.to_string()))?;
        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(RelayError::Http(format!(
                "media GET {status}: {}",
                body.chars().take(200).collect::<String>()
            )));
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| RelayError::Http(e.to_string()))?;
        Ok(bytes.to_vec())
    }
}

fn sign_blossom_get(keys: &Keys, media_url: &str) -> Result<String, RelayError> {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    let now = Timestamp::now().as_secs();
    let exp_str = (now + 60).to_string();
    let domain = buzz_core::tenant::relay_url_authority(media_url);
    if domain.is_empty() {
        return Err(RelayError::Http(format!(
            "invalid media URL for Blossom server tag: {media_url}"
        )));
    }
    let tags = vec![
        Tag::parse(["t", "get"]).map_err(|e| RelayError::Http(e.to_string()))?,
        Tag::parse(["expiration", &exp_str]).map_err(|e| RelayError::Http(e.to_string()))?,
        Tag::parse(["server", &domain]).map_err(|e| RelayError::Http(e.to_string()))?,
    ];
    let auth_event = EventBuilder::new(Kind::from(24242), "Get media")
        .tags(tags)
        .sign_with_keys(keys)
        .map_err(|e| RelayError::Http(format!("blossom sign failed: {e}")))?;
    Ok(format!(
        "Nostr {}",
        URL_SAFE_NO_PAD.encode(auth_event.as_json().as_bytes())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_imeta_parses_url_mime_hash() {
        let hash = "a".repeat(64);
        let tags = vec![vec![
            "imeta".into(),
            format!("url https://relay.example/media/{hash}.png"),
            "m image/png".into(),
            format!("x {hash}"),
            "size 12".into(),
        ]];
        let refs = extract_imeta_refs(&tags);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].mime, "image/png");
        assert_eq!(refs[0].sha256.as_deref(), Some(hash.as_str()));
        assert!(refs[0].url.contains("/media/"));
    }

    #[test]
    fn media_url_rejects_foreign_origin() {
        let hash = "b".repeat(64);
        let err = media_url_for_relay(
            "https://relay.example",
            &format!("https://evil.example/media/{hash}.png"),
        )
        .unwrap_err();
        assert!(err.to_string().contains("non-relay"));
    }

    #[test]
    fn media_url_accepts_path_absolute() {
        let hash = "c".repeat(64);
        let url = media_url_for_relay("https://relay.example", &format!("/media/{hash}.jpg"))
            .unwrap();
        assert_eq!(url, format!("https://relay.example/media/{hash}.jpg"));
    }

    #[test]
    fn attachments_section_warns_against_fetch() {
        let section = format_attachments_section(&[StagedAttachment {
            local_path: PathBuf::from("/tmp/buzz-acp/media/abc.png"),
            mime: "image/png".into(),
            sha256: "a".repeat(64),
            source_url: "https://relay.example/media/aaa.png".into(),
            acp_image_base64: None,
        }])
        .unwrap();
        assert!(section.contains("buzz-attachments"));
        assert!(section.contains("Do NOT HTTP-fetch"));
        assert!(section.contains("/tmp/buzz-acp/media/abc.png"));
    }
}
