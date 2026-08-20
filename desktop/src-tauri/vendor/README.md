# Vendored desktop patches

Pinned copies of crates.io `wry` 0.55.1 and `rfd` 0.16.0 with a nil-safe
`NSOpenPanel` / `NSSavePanel` constructor.

`+[NSOpenPanel openPanel]` can return nil (macOS 26 Tahoe, ad-hoc/unsigned
local `.app` builds, code-signature mismatch after an in-place replace).
The typed `objc2-app-kit` binding treats that as a programming error and
aborts the process. Composer attach goes through Wry's WKWebView upload
panel; `pick_and_upload_*` goes through rfd.

The patches retain the raw Objective-C return, cancel the picker when it
is nil, and promote the app to `NSApplicationActivationPolicyRegular`
before asking AppKit for the panel.

Replace with a crates.io bump when tauri-apps/wry#1716 (or equivalent) is
released and rfd does the same.
