//! Native companion-window lifecycle for an active Huddle.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::app_state::AppState;

/// When true, the next huddle `Destroyed` must not restore the drawer —
/// used while docking (manual emit) or while `open_huddle_window` destroys a
/// zombie companion to recreate it.
static SUPPRESS_COMPANION_RETURN: AtomicBool = AtomicBool::new(false);

/// Returns true once when a destroy intentionally should not dock the huddle.
pub(crate) fn take_suppress_companion_return() -> bool {
    SUPPRESS_COMPANION_RETURN.swap(false, Ordering::SeqCst)
}

/// Clear any leftover suppress so a later real close can restore the drawer.
pub(crate) fn clear_suppress_companion_return() {
    SUPPRESS_COMPANION_RETURN.store(false, Ordering::SeqCst);
}

/// Close the companion belonging to an ended huddle. The native lifecycle is
/// authoritative here because a webview can be suspended while it is closing.
pub(super) fn close_huddle_window(app: &tauri::AppHandle, ephemeral_channel_id: &str) {
    if ephemeral_channel_id.is_empty() {
        return;
    }
    let label = format!("huddle-{ephemeral_channel_id}");
    destroy_huddle_window(app, &label, false);
}

/// Force-destroy the companion. `close()` alone can leave a visible macOS
/// window when CloseRequested races the webview teardown; `destroy()` removes
/// it from the window map so docking to the drawer actually clears the stage.
fn destroy_huddle_window(app: &tauri::AppHandle, label: &str, suppress_return: bool) {
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    if suppress_return {
        SUPPRESS_COMPANION_RETURN.store(true, Ordering::SeqCst);
    }
    // Hide first so the user does not see a lingering frame if destroy is slow.
    if let Err(error) = window.hide() {
        eprintln!("buzz-desktop: failed to hide huddle companion before destroy: {error}");
    }
    if let Err(error) = window.destroy() {
        eprintln!(
            "buzz-desktop: failed to destroy huddle companion ({error}); falling back to close"
        );
        if let Err(close_error) = window.close() {
            eprintln!("buzz-desktop: failed to close huddle companion: {close_error}");
            if suppress_return {
                // close also failed — clear the suppress flag so a later real
                // dock still restores the drawer.
                SUPPRESS_COMPANION_RETURN.store(false, Ordering::SeqCst);
            }
        }
    }
}

/// Whether the active huddle still has a companion webview in the window map.
#[tauri::command]
pub fn huddle_companion_window_exists(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let ephemeral_channel_id = match state.huddle()?.ephemeral_channel_id.clone() {
        Some(id) if !id.is_empty() => id,
        _ => return Ok(false),
    };
    let label = format!("huddle-{ephemeral_channel_id}");
    Ok(app.get_webview_window(&label).is_some())
}

/// Close the active companion without leaving the huddle. The main window uses
/// this to restore its drawer presentation while retaining the audio session.
///
/// Drawer ⊕ window: destroy must succeed before the drawer is restored so both
/// never remain visible. Destroyed is suppressed during the intentional
/// destroy so we emit `huddle-companion-returned` exactly once after teardown.
/// Suppress stays set until Destroyed consumes it (or the next open clears it)
/// so a late Destroyed cannot flip the main app back to the drawer after a
/// subsequent expand.
#[tauri::command]
pub fn close_huddle_companion(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ephemeral_channel_id = state
        .huddle()?
        .ephemeral_channel_id
        .clone()
        .ok_or("no active huddle")?;
    let label = format!("huddle-{ephemeral_channel_id}");
    destroy_huddle_window(&app, &label, true);
    if app.get_webview_window(&label).is_some() {
        // destroy() can leave a zombie on macOS; one more hide+destroy+close pass.
        destroy_huddle_window(&app, &label, true);
    }
    if app.get_webview_window(&label).is_some() {
        SUPPRESS_COMPANION_RETURN.store(false, Ordering::SeqCst);
        return Err("failed to destroy huddle companion window".to_string());
    }
    // Leave SUPPRESS set so a late Destroyed from this teardown does not emit
    // again (and cannot race a later expand). open_huddle_window clears it.
    app.emit("huddle-companion-returned", ())
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Open the active huddle's ephemeral channel in a focused companion window.
/// The main window remains the owner of microphone capture; closing this room
/// must never leave the shared huddle session.
#[tauri::command]
pub async fn open_huddle_window(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ephemeral_channel_id = state
        .huddle()?
        .ephemeral_channel_id
        .clone()
        .ok_or("no active huddle")?;
    let label = format!("huddle-{ephemeral_channel_id}");

    // A prior dock/recreate may have left suppress set; clear so a later close
    // of this companion can restore the drawer.
    clear_suppress_companion_return();

    if let Some(window) = app.get_webview_window(&label) {
        match window.show().and_then(|_| window.set_focus()) {
            Ok(()) => return Ok(()),
            Err(error) => {
                eprintln!(
                    "buzz-desktop: existing huddle companion unusable ({error}); recreating"
                );
                destroy_huddle_window(&app, &label, true);
            }
        }
    }

    WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into()))
        .title("Huddle")
        .inner_size(960.0, 720.0)
        .min_inner_size(720.0, 520.0)
        .build()
        .map_err(|error| error.to_string())?;
    // Recreate's Destroyed may not have run yet; keep suppress only until the
    // replacement is up, then clear so the new companion's close restores drawer.
    clear_suppress_companion_return();
    Ok(())
}
