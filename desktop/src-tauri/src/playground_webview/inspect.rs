//! Inspect opens a detached inspector for `playground-{sid}` only.
//! Linux CI cannot compile AppKit; keep presentation policy tests host-free.

use super::{
    apply_bounds, playground_label, PlaygroundBounds, PlaygroundWebviewManager, APP_WEBVIEW_LABEL,
};
use std::time::Duration;
use tauri::{AppHandle, Manager, Webview};

/// How Inspect presents the WebKit inspector relative to the playground stage.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaygroundInspectPresentation {
    /// Standalone inspector window. Must not dock into the stage or main window.
    DetachedWindow,
}

pub fn playground_inspect_presentation() -> PlaygroundInspectPresentation {
    PlaygroundInspectPresentation::DetachedWindow
}

/// Inspect must leave the main window at its pre-inspector size.
pub fn resolved_window_size_after_inspect(before: (u32, u32), after: (u32, u32)) -> (u32, u32) {
    let _ = after;
    before
}

/// After Inspect, the playground page stays in the same stage rectangle.
pub fn resolved_stage_bounds_after_inspect(
    before: &PlaygroundBounds,
    window_before: (u32, u32),
    window_after: (u32, u32),
) -> PlaygroundBounds {
    let _ = (window_before, window_after);
    before.clone()
}

pub fn open_playground_inspector(webview: &Webview) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        open_detached_macos_inspector(webview)
    }
    #[cfg(not(target_os = "macos"))]
    {
        webview.open_devtools();
        Ok(())
    }
}

pub fn restore_main_window_size(app: &AppHandle, before: Option<(u32, u32)>) {
    let Some(before) = before else {
        return;
    };
    let Some(window) = app.get_window(APP_WEBVIEW_LABEL) else {
        return;
    };
    let after = window
        .inner_size()
        .ok()
        .map(|size| (size.width, size.height));
    let keep = match after {
        Some(after) => resolved_window_size_after_inspect(before, after),
        None => before,
    };
    if after != Some(keep) {
        let _ = window.set_size(tauri::PhysicalSize::new(keep.0, keep.1));
    }
}

fn reapply_last_bounds(app: &AppHandle, sid: &str) {
    let Some(manager) = app.try_state::<PlaygroundWebviewManager>() else {
        return;
    };
    let bounds = manager.sessions.lock().ok().and_then(|sessions| {
        sessions
            .get(sid)
            .and_then(|session| session.last_bounds.clone())
    });
    if let Some(bounds) = bounds.as_ref() {
        let _ = apply_bounds(app, sid, bounds);
    }
}

pub fn schedule_inspect_stage_restore(
    app: AppHandle,
    sid: String,
    window_size: Option<(u32, u32)>,
) {
    tauri::async_runtime::spawn(async move {
        for delay_ms in [16_u64, 50, 200, 500] {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            restore_main_window_size(&app, window_size);
            reapply_last_bounds(&app, &sid);
        }
        for _ in 0..80 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if !playground_inspector_is_visible(&app, &sid) {
                restore_main_window_size(&app, window_size);
                reapply_last_bounds(&app, &sid);
                break;
            }
        }
    });
}

pub fn playground_inspector_is_visible(app: &AppHandle, sid: &str) -> bool {
    let Some(webview) = app.get_webview(&playground_label(sid)) else {
        return false;
    };
    inspector_is_visible(&webview)
}

fn inspector_is_visible(webview: &Webview) -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_inspector_is_visible(webview)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = webview;
        false
    }
}

#[cfg(target_os = "macos")]
fn open_detached_macos_inspector(webview: &Webview) -> Result<(), String> {
    webview
        .with_webview(|platform| {
            use objc2::runtime::AnyObject;
            use objc2::sel;
            use objc2_web_kit::WKWebView;

            // SAFETY: inner() is the child WKWebView for this playground label.
            // `_inspector` / `detach` / `show` are WebKit private inspectors
            // (same selectors wry uses for open_devtools). with_webview is
            // already on the AppKit main thread. Detach *before* show so
            // WebKit never reparents the host into a docked split view.
            let view: &WKWebView = unsafe { &*platform.inner().cast::<WKWebView>() };
            unsafe {
                let has_inspector: bool =
                    objc2::msg_send![view, respondsToSelector: sel!(_inspector)];
                if !has_inspector {
                    return;
                }
                let inspector: *mut AnyObject = objc2::msg_send![view, _inspector];
                if inspector.is_null() {
                    return;
                }
                let inspector = &*inspector;
                let detach = sel!(detach);
                let can_detach: bool = objc2::msg_send![inspector, respondsToSelector: detach];
                if can_detach {
                    let (): () = objc2::msg_send![inspector, detach];
                }
                let show = sel!(show);
                if objc2::msg_send![inspector, respondsToSelector: show] {
                    let (): () = objc2::msg_send![inspector, show];
                }
                if can_detach {
                    let (): () = objc2::msg_send![inspector, detach];
                }
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn macos_inspector_is_visible(webview: &Webview) -> bool {
    let visible = std::cell::Cell::new(false);
    let _ = webview.with_webview(|platform| {
        use objc2::runtime::AnyObject;
        use objc2::sel;
        use objc2_web_kit::WKWebView;

        // SAFETY: same child WKWebView / `_inspector` contract as
        // open_detached_macos_inspector. isVisible is the matching query
        // wry uses for is_devtools_open.
        let view: &WKWebView = unsafe { &*platform.inner().cast::<WKWebView>() };
        let is_visible = unsafe {
            let has_inspector: bool = objc2::msg_send![view, respondsToSelector: sel!(_inspector)];
            if !has_inspector {
                false
            } else {
                let inspector: *mut AnyObject = objc2::msg_send![view, _inspector];
                if inspector.is_null() {
                    false
                } else {
                    objc2::msg_send![&*inspector, isVisible]
                }
            }
        };
        visible.set(is_visible);
    });
    visible.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspect_opens_a_detached_window_not_a_docked_split() {
        assert_eq!(
            playground_inspect_presentation(),
            PlaygroundInspectPresentation::DetachedWindow
        );
    }

    #[test]
    fn inspect_does_not_change_main_window_size() {
        assert_eq!(
            resolved_window_size_after_inspect((1280, 800), (1800, 800)),
            (1280, 800)
        );
        assert_eq!(
            resolved_window_size_after_inspect((1024, 640), (1024, 640)),
            (1024, 640)
        );
    }

    #[test]
    fn inspect_does_not_resize_the_playground_stage() {
        let before = PlaygroundBounds {
            x: 120.0,
            y: 80.0,
            width: 640.0,
            height: 480.0,
        };
        let after = resolved_stage_bounds_after_inspect(&before, (1280, 800), (1800, 800));
        assert_eq!(after, before);
        assert_eq!(after.width, 640.0);
        assert_eq!(after.height, 480.0);
        assert_eq!(after.x, 120.0);
        assert_eq!(after.y, 80.0);
    }
}
