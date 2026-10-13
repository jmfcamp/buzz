#!/usr/bin/env bash
# Verify a Hula Buzz .app is properly code signed (Developer ID or ad-hoc).
#
# Usage: verify-macos-signing.sh <path-to-app> <developer-id|adhoc> [--notarized]
#
# Checks:
#   - main executable: Identifier=<CFBundleIdentifier>, Info.plist bound,
#     Sealed Resources version=2, hardened runtime flag
#   - every Mach-O in Contents/MacOS (sidecars) is signed; with developer-id
#     they share the app's TeamIdentifier and carry the runtime flag
#   - codesign --verify --deep --strict passes
#   - --notarized: spctl accepts it as "Notarized Developer ID" and the
#     ticket is stapled
set -euo pipefail

APP="${1:?usage: $0 <app> <developer-id|adhoc> [--notarized]}"
MODE="${2:?mode developer-id|adhoc}"
NOTARIZED="${3:-}"
EXPECTED_ID="${EXPECTED_BUNDLE_ID:-com.huladesk.buzz}"
fail() { echo "::error::$*" >&2; exit 1; }

[[ -d "$APP" ]] || fail "missing app: $APP"
PLIST="$APP/Contents/Info.plist"
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")
[[ "$BUNDLE_ID" == "$EXPECTED_ID" ]] || fail "CFBundleIdentifier=$BUNDLE_ID, expected $EXPECTED_ID"

INFO=$(codesign -dv --verbose=4 "$APP" 2>&1) || fail "app is not signed: $INFO"
echo "$INFO"
grep -q "^Identifier=${EXPECTED_ID}\$" <<<"$INFO" || fail "Identifier is not $EXPECTED_ID (linker-only/ad-hoc binary signature?)"
grep -Eq '^Info\.plist entries=[0-9]+' <<<"$INFO" || fail "Info.plist is not bound to the signature"
grep -q '^Sealed Resources version=2' <<<"$INFO" || fail "Sealed Resources v2 missing (bundle not sealed)"
grep -Eq '^CodeDirectory .*flags=0x[0-9a-f]*\((.*,)?runtime' <<<"$INFO" || fail "hardened runtime flag missing on app"

APP_TEAM=$(sed -n 's/^TeamIdentifier=//p' <<<"$INFO")
if [[ "$MODE" == "developer-id" ]]; then
  grep -q '^Authority=Developer ID Application' <<<"$INFO" || fail "not signed with a Developer ID Application certificate"
  [[ -n "$APP_TEAM" && "$APP_TEAM" != "not set" ]] || fail "TeamIdentifier missing"
  grep -q '^Timestamp=' <<<"$INFO" || fail "secure timestamp missing (required for notarization)"
else
  grep -q '^Signature=adhoc' <<<"$INFO" || fail "expected an ad-hoc bundle signature"
fi

# Every Mach-O in Contents/MacOS (main exe + sidecars).
while IFS= read -r -d '' BIN; do
  file -b "$BIN" | grep -q 'Mach-O' || continue
  BI=$(codesign -dv --verbose=4 "$BIN" 2>&1) || fail "unsigned binary: $BIN"
  codesign --verify --strict "$BIN" || fail "signature invalid: $BIN"
  if [[ "$MODE" == "developer-id" ]]; then
    T=$(sed -n 's/^TeamIdentifier=//p' <<<"$BI")
    [[ "$T" == "$APP_TEAM" ]] || fail "$BIN TeamIdentifier=$T, app=$APP_TEAM"
    grep -Eq 'flags=0x[0-9a-f]*\((.*,)?runtime' <<<"$BI" || fail "hardened runtime missing: $BIN"
  fi
  echo "ok: $(basename "$BIN") ($(sed -n 's/^Identifier=//p' <<<"$BI"))"
done < <(find "$APP/Contents/MacOS" -type f -perm -u+x -print0)

codesign --verify --deep --strict --verbose=2 "$APP" || fail "codesign --verify --deep --strict failed"

if [[ "$NOTARIZED" == "--notarized" ]]; then
  SP=$(spctl -a -vv -t exec "$APP" 2>&1) || fail "spctl rejected: $SP"
  echo "$SP"
  grep -q 'source=Notarized Developer ID' <<<"$SP" || fail "spctl source is not Notarized Developer ID: $SP"
  xcrun stapler validate "$APP" || fail "notarization ticket not stapled to app"
fi
echo "macOS signing verified ($MODE${NOTARIZED:+, notarized})"
