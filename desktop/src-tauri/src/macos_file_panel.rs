//! macOS file-panel crash guard.
//!
//! Composer attach uses a hidden `<input type="file">`. WKWebView asks Wry's
//! `run_file_upload_panel`, which called `NSOpenPanel::openPanel()`. On macOS
//! 26 Tahoe — especially ad-hoc/unsigned local `.app` builds — that class
//! method can return nil. The typed objc2 binding treats nil as a hard fail
//! (`none_fail`) and the process SIGABRTs before a picker appears.
//!
//! Native `tauri-plugin-dialog` / `rfd` hits the same constructor. Both crates
//! are patched in `vendor/` to retain the raw return and cancel instead of
//! aborting. This module keeps the process a regular activating app so AppKit
//! is willing to present the panel at all (crash reports showed Role:
//! Background).

#[cfg(target_os = "macos")]
pub(crate) fn ensure_regular_activation() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    let _ = app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    NSApplication::activate(&app);
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn ensure_regular_activation() {}

#[cfg(test)]
mod tests {
    const WRY_UI_DELEGATE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/vendor/wry/src/wkwebview/class/wry_web_view_ui_delegate.rs"
    ));
    const RFD_PANEL: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/vendor/rfd/src/backend/macos/file_dialog/panel_ffi.rs"
    ));

    #[test]
    fn patched_wry_cancels_when_nsopenpanel_is_nil() {
        assert!(
            WRY_UI_DELEGATE.contains("Retained::retain(ptr)"),
            "wry must retain +[NSOpenPanel openPanel] without the typed nil panic"
        );
        assert!(
            WRY_UI_DELEGATE.contains("(*handler).call((null_mut(),))"),
            "nil panel must cancel the WebKit upload instead of aborting"
        );
        assert!(
            !WRY_UI_DELEGATE.contains("NSOpenPanel::openPanel(mtm)"),
            "typed NSOpenPanel::openPanel panics on nil"
        );
    }

    #[test]
    fn patched_rfd_does_not_use_typed_open_panel() {
        assert!(
            RFD_PANEL.contains("fn try_open_panel"),
            "rfd must go through a nil-safe open-panel helper"
        );
        assert!(
            !RFD_PANEL.contains("NSOpenPanel::openPanel(mtm)"),
            "typed NSOpenPanel::openPanel panics on nil"
        );
        assert!(
            !RFD_PANEL.contains("NSSavePanel::savePanel(mtm)"),
            "typed NSSavePanel::savePanel panics on nil"
        );
    }
}
