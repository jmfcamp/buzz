//! Native companion windows for popped-out conversations and playgrounds.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn show_and_focus(window: tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

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
        return show_and_focus(window);
    }

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

    match builder.build() {
        Ok(_) => Ok(()),
        Err(error) => {
            if let Some(window) = app.get_webview_window(&label) {
                return show_and_focus(window);
            }
            Err(error.to_string())
        }
    }
}
