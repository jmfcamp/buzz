# Assist reminder OS toast + phone push — deploy plan

## Design
1. **Desktop OS toast**: BestieWakeController fires `sendDesktopNotification` when an Assist list reminder is due (same `needs_action` settings slot as classic Remind-me-later).
2. **Web/PWA OS toast**: `useAssistReminderNotifications` polls Assist lists, toasts, and marks `firedAt`.
3. **Phone push when apps are closed**: dual-write Assist reminders to NIP-ER kind 30300 (`source: "assist-list"`). Relay due scheduler (already running) claims when `not_before` passes, republishes to WS, **and now enqueues a push match**. Web push lease adds class `reminder` (`kinds:[30300], authors:[me]`), gated by the Approvals/`needs_action` toggle. Gateway body: "Reminder due".
4. Kind 30300 is **not** matched at insert time (avoids waking for future-dated reminders at create).

## Client (web deploy OK now)
- Ships OS toasts on desktop + web immediately.
- Dual-write + lease ready; **push only works after relay/gateway deploy**.

## Relay + push gateway (NEEDS JM APPROVAL)
Services: `relay` + `buzz-push-gateway` (class allowlist + body copy).
Migration: `0061_push_reminder_class.sql` (widens class CHECKs).
Also still pending from earlier: **#360 channel class** (merged, not deployed) — can combine or ship separately.

### Suggested deploy order
1. Build images for relay + push-gateway from this branch.
2. Backup `.env`/compose + `pg_dump` (migration).
3. Apply migration / roll gateway then relay with `--no-deps`.
4. Verify NIP-11 advertises `"reminder"` in webpush classes.
5. Hard-refresh PWA so leases re-publish with reminder sub.
6. Keep rollback script pointing at prior images + note to restore class constraint if needed.

## Classic message reminders
Same relay due→push path also wakes for classic Remind-me-later (NIP-ER) once leases include `reminder`.
