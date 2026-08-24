//! Native companion windows for popped-out conversations and playgrounds.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn open_popout_window(
    app: tauri::AppHandle,
    label: String,
    title: String,
) -> Result<(), String> {
    if !label.starts_with("popout-") {
        return Err("invalid popout window label".into());
    }
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(1100.0, 780.0)
        .min_inner_size(720.0, 520.0)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}
