//! Installation-global huddle defaults.
//!
//! The file is `huddle-defaults.json` in the app data directory. A missing
//! file is the built-in default (push-to-talk, system devices, full gain).
//! Invalid JSON or a newer version is a load error: later saves refuse to
//! overwrite that file. Agent transcription may change the live voice mode
//! without writing this file.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::app_state::AppState;
use crate::managed_agents::storage::atomic_write_json_restricted;

use super::tts_settings::HuddleAudioSettingsState;

const SETTINGS_FILE: &str = "huddle-defaults.json";
const CURRENT_VERSION: u32 = 1;
const MAX_DEVICE_CHARS: usize = 512;

/// Saved huddle defaults. Empty device strings mean the system default.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HuddleDefaults {
    pub version: u32,
    pub push_to_talk: bool,
    pub microphone_device_id: String,
    pub speaker_device_name: String,
    pub camera_device_id: String,
    pub microphone_gain: f64,
}

impl Default for HuddleDefaults {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            push_to_talk: true,
            microphone_device_id: String::new(),
            speaker_device_name: String::new(),
            camera_device_id: String::new(),
            microphone_gain: 1.0,
        }
    }
}

/// Partial update. Absent fields stay as they are.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct HuddleDefaultsPatch {
    pub push_to_talk: Option<bool>,
    pub microphone_device_id: Option<String>,
    pub speaker_device_name: Option<String>,
    pub camera_device_id: Option<String>,
    pub microphone_gain: Option<f64>,
}

/// Clamp gain into `0..=1`. Non-finite values become the default `1`.
pub fn normalize_microphone_gain(value: f64) -> f64 {
    if !value.is_finite() {
        1.0
    } else {
        value.clamp(0.0, 1.0)
    }
}

/// Trim a device id or name. Empty is the system default. Longer than 512
/// characters is rejected so a bad value cannot grow the settings file.
pub fn normalize_device_name(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() > MAX_DEVICE_CHARS {
        return Err("huddle device name is too long".to_string());
    }
    Ok(trimmed.to_string())
}

pub fn apply_patch(
    defaults: &mut HuddleDefaults,
    patch: &HuddleDefaultsPatch,
) -> Result<(), String> {
    if let Some(push_to_talk) = patch.push_to_talk {
        defaults.push_to_talk = push_to_talk;
    }
    if let Some(device_id) = &patch.microphone_device_id {
        defaults.microphone_device_id = normalize_device_name(device_id)?;
    }
    if let Some(name) = &patch.speaker_device_name {
        defaults.speaker_device_name = normalize_device_name(name)?;
    }
    if let Some(device_id) = &patch.camera_device_id {
        defaults.camera_device_id = normalize_device_name(device_id)?;
    }
    if let Some(gain) = patch.microphone_gain {
        defaults.microphone_gain = normalize_microphone_gain(gain);
    }
    defaults.version = CURRENT_VERSION;
    Ok(())
}

pub(crate) fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SETTINGS_FILE))
        .map_err(|error| format!("could not locate Buzz settings storage: {error}"))
}

pub(crate) fn load_from_path(path: &Path) -> Result<HuddleDefaults, String> {
    if !path.exists() {
        return Ok(HuddleDefaults::default());
    }
    let bytes =
        std::fs::read(path).map_err(|error| format!("could not read huddle defaults: {error}"))?;
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("huddle defaults are not valid JSON: {error}"))?;
    let version = value
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| "huddle defaults version is invalid".to_string())?;
    if version == 0 || version > u64::from(CURRENT_VERSION) {
        return Err(format!(
            "huddle defaults version {version} is newer than this Buzz build supports"
        ));
    }

    let push_to_talk = match value.get("pushToTalk") {
        None => true,
        Some(serde_json::Value::Bool(enabled)) => *enabled,
        Some(_) => return Err("huddle defaults pushToTalk must be a boolean".to_string()),
    };
    let mut defaults = HuddleDefaults {
        version: CURRENT_VERSION,
        push_to_talk,
        microphone_device_id: device_field(&value, "microphoneDeviceId")?,
        speaker_device_name: device_field(&value, "speakerDeviceName")?,
        camera_device_id: device_field(&value, "cameraDeviceId")?,
        microphone_gain: gain_field(&value)?,
    };
    defaults.version = CURRENT_VERSION;
    Ok(defaults)
}

fn device_field(value: &serde_json::Value, key: &str) -> Result<String, String> {
    match value.get(key) {
        None => Ok(String::new()),
        Some(serde_json::Value::String(text)) => normalize_device_name(text),
        Some(_) => Err(format!("huddle defaults {key} must be a string")),
    }
}

fn gain_field(value: &serde_json::Value) -> Result<f64, String> {
    match value.get("microphoneGain") {
        None => Ok(1.0),
        Some(serde_json::Value::Number(number)) => {
            let gain = number
                .as_f64()
                .ok_or_else(|| "huddle defaults microphoneGain must be a number".to_string())?;
            Ok(normalize_microphone_gain(gain))
        }
        Some(_) => Err("huddle defaults microphoneGain must be a number".to_string()),
    }
}

pub(crate) fn save_to_path(path: &Path, defaults: &HuddleDefaults) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create huddle defaults directory: {error}"))?;
    }
    let payload = serde_json::to_vec_pretty(defaults)
        .map_err(|error| format!("could not encode huddle defaults: {error}"))?;
    atomic_write_json_restricted(path, &payload)
        .map_err(|error| format!("could not save huddle defaults: {error}"))
}

pub fn load_for_app(app: &AppHandle) -> (HuddleDefaults, Option<String>) {
    let result = settings_path(app).and_then(|path| load_from_path(&path));
    match result {
        Ok(defaults) => (defaults, None),
        Err(error) => {
            eprintln!(
                "buzz-desktop: {error}; preserving the file and using push-to-talk for this session"
            );
            (HuddleDefaults::default(), Some(error))
        }
    }
}

fn ensure_writable(audio: &HuddleAudioSettingsState) -> Result<(), String> {
    if let Some(error) = audio
        .defaults_load_error
        .lock()
        .map_err(|lock_error| format!("huddle defaults lock poisoned: {lock_error}"))?
        .as_ref()
    {
        return Err(format!(
            "Huddle defaults were not saved because the existing file could not be loaded: {error}"
        ));
    }
    Ok(())
}

/// Replace the saved defaults. The in-memory copy changes only after the file
/// write succeeds.
pub fn update_saved_defaults(
    app: &AppHandle,
    audio: &HuddleAudioSettingsState,
    mutate: impl FnOnce(&mut HuddleDefaults) -> Result<(), String>,
) -> Result<HuddleDefaults, String> {
    ensure_writable(audio)?;
    let mut guard = audio
        .defaults
        .lock()
        .map_err(|error| format!("huddle defaults lock poisoned: {error}"))?;
    let mut next = guard.clone();
    mutate(&mut next)?;
    next.version = CURRENT_VERSION;
    let path = settings_path(app)?;
    save_to_path(&path, &next)?;
    *guard = next.clone();
    Ok(next)
}

/// Return the saved defaults. A load error refuses the read so the UI does
/// not treat fallback values as the file contents.
#[tauri::command]
pub fn get_huddle_defaults(state: State<'_, AppState>) -> Result<HuddleDefaults, String> {
    if let Some(error) = state
        .huddle_audio
        .defaults_load_error
        .lock()
        .map_err(|lock_error| format!("huddle defaults lock poisoned: {lock_error}"))?
        .clone()
    {
        return Err(format!(
            "Huddle defaults could not be loaded and were left unchanged: {error}"
        ));
    }
    state
        .huddle_audio
        .defaults
        .lock()
        .map(|defaults| defaults.clone())
        .map_err(|error| format!("huddle defaults lock poisoned: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "buzz-huddle-defaults-{}-{}-{}",
            std::process::id(),
            name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir.join("huddle-defaults.json")
    }

    #[test]
    fn missing_file_defaults_to_push_to_talk() {
        let defaults = load_from_path(&temp_path("missing")).expect("missing file");
        assert!(defaults.push_to_talk);
        assert_eq!(defaults.microphone_device_id, "");
        assert_eq!(defaults.speaker_device_name, "");
        assert_eq!(defaults.camera_device_id, "");
        assert_eq!(defaults.microphone_gain, 1.0);
    }

    #[test]
    fn explicit_false_push_to_talk_survives_a_round_trip() {
        let path = temp_path("round-trip");
        let mut defaults = HuddleDefaults::default();
        defaults.push_to_talk = false;
        defaults.microphone_device_id = "mic-1".to_string();
        defaults.speaker_device_name = "Speakers".to_string();
        defaults.camera_device_id = "cam-1".to_string();
        defaults.microphone_gain = 0.25;
        save_to_path(&path, &defaults).expect("save");
        let loaded = load_from_path(&path).expect("load");
        assert_eq!(loaded, defaults);
    }

    #[test]
    fn missing_push_to_talk_means_true_and_gain_is_clamped() {
        let path = temp_path("partial");
        std::fs::write(
            &path,
            r#"{"version":1,"microphoneGain":4.5,"speakerDeviceName":"  Desk  "}"#,
        )
        .expect("write");
        let defaults = load_from_path(&path).expect("load");
        assert!(defaults.push_to_talk);
        assert_eq!(defaults.microphone_gain, 1.0);
        assert_eq!(defaults.speaker_device_name, "Desk");
    }

    #[test]
    fn newer_version_is_a_load_error() {
        let path = temp_path("future");
        std::fs::write(&path, r#"{"version":2,"pushToTalk":false}"#).expect("write");
        let error = load_from_path(&path).expect_err("future version");
        assert!(error.contains("newer"));
    }

    #[test]
    fn device_names_longer_than_512_are_rejected() {
        let mut defaults = HuddleDefaults::default();
        let patch = HuddleDefaultsPatch {
            microphone_device_id: Some("m".repeat(513)),
            ..HuddleDefaultsPatch::default()
        };
        let error = apply_patch(&mut defaults, &patch).expect_err("too long");
        assert!(error.contains("too long"));
        assert_eq!(defaults.microphone_device_id, "");
    }

    #[test]
    fn patch_keeps_unspecified_fields_and_clamps_gain() {
        let mut defaults = HuddleDefaults {
            push_to_talk: true,
            microphone_device_id: "mic".to_string(),
            speaker_device_name: "speakers".to_string(),
            camera_device_id: "cam".to_string(),
            microphone_gain: 0.5,
            ..HuddleDefaults::default()
        };
        apply_patch(
            &mut defaults,
            &HuddleDefaultsPatch {
                push_to_talk: Some(false),
                microphone_gain: Some(f64::NAN),
                ..HuddleDefaultsPatch::default()
            },
        )
        .expect("patch");
        assert!(!defaults.push_to_talk);
        assert_eq!(defaults.microphone_device_id, "mic");
        assert_eq!(defaults.speaker_device_name, "speakers");
        assert_eq!(defaults.camera_device_id, "cam");
        assert_eq!(defaults.microphone_gain, 1.0);
    }
}
