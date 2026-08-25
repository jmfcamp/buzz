//! Native companion windows for popped-out conversations and playgrounds.

use serde::Serialize;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const POPOUT_WINDOWS_CHANGED: &str = "popout-windows-changed";

#[derive(Serialize)]
pub struct PopoutWindowInfo {
    pub label: String,
    pub title: String,
}

fn show_and_focus(window: tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn emit_popout_windows_changed(app: &tauri::AppHandle) {
    if let Err(error) = app.emit(POPOUT_WINDOWS_CHANGED, ()) {
        eprintln!("buzz-desktop: failed to emit {POPOUT_WINDOWS_CHANGED}: {error}");
    }
}

#[tauri::command]
pub fn list_popout_windows(app: tauri::AppHandle) -> Vec<PopoutWindowInfo> {
    let mut rows: Vec<PopoutWindowInfo> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with("popout-"))
        .map(|(label, window)| PopoutWindowInfo {
            label,
            title: window.title().unwrap_or_default(),
        })
        .collect();
    rows.sort_by(|a, b| a.title.cmp(&b.title).then(a.label.cmp(&b.label)));
    rows
}

#[tauri::command]
pub fn focus_popout_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if !label.starts_with("popout-") {
        return Err("invalid popout window label".into());
    }
    let Some(window) = app.get_webview_window(&label) else {
        return Err("popout window not found".into());
    };
    show_and_focus(window)
}

#[tauri::command]
pub async fn open_popout_window(
    app: tauri::AppHandle,
    label: String,
    title: String,
    fullscreen: Option<bool>,
) -> Result<(), String> {
    if !label.starts_with("popout-") {
        return Err("invalid popout window label".into());
    }
    if let Some(window) = app.get_webview_window(&label) {
        return show_and_focus(window);
    }

    let start_fullscreen = fullscreen.unwrap_or(false);

    let builder =
        WebviewWindowBuilder::new(&app, label.as_str(), WebviewUrl::App("index.html".into()))
            .title(title)
            .inner_size(1100.0, 780.0)
            .min_inner_size(720.0, 520.0);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 25.0));

    #[cfg(target_os = "macos")]
    let builder = if start_fullscreen {
        builder.fullscreen(true)
    } else {
        builder
    };

    #[cfg(not(target_os = "macos"))]
    let builder = if start_fullscreen {
        builder.maximized(true)
    } else {
        builder
    };

    match builder.build() {
        Ok(_) => {
            emit_popout_windows_changed(&app);
            Ok(())
        }
        Err(error) => {
            if let Some(window) = app.get_webview_window(&label) {
                return show_and_focus(window);
            }
            Err(error.to_string())
        }
    }
}
