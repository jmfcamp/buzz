# Community sections

Admin-defined channel groupings that members **opt into**. Distinct from
personal custom sections (`kind:30078` / `d=channel-sections`).

## Product

1. Admins configure sections in **Settings → Community sections**.
2. Each section lists channel ids (same list for every member).
3. Every member sees the catalog and can **Subscribe** (toggle).
4. Subscribed sections appear on the left nav; unsubscribed ones do not.

## Data model

### Catalog (community-scoped, admin-authored)

| Field | Value |
| --- | --- |
| Kind | `30625` (`KIND_COMMUNITY_SECTIONS`) |
| d-tag | `buzz:community-sections` |
| Auth | Owner/admin only (relay ingest) |
| Scope | Tenant-global NIP-33 replaceable |

```json
{
  "version": 1,
  "sections": [
    {
      "id": "uuid",
      "name": "Engineering",
      "icon": "optional",
      "order": 0,
      "channelIds": ["channel-id-1", "channel-id-2"]
    }
  ]
}
```

Local mirror: `buzz-community-sections.v1:<relayUrl>`.

### Subscriptions (per member, client-local for MVP)

| Field | Value |
| --- | --- |
| Storage | `buzz-community-section-subs.v1:<pubkey>:<relayUrl>` |
| Shape | `{ "version": 1, "subscribed": { "<sectionId>": true } }` |

Cross-device sync (NIP-78 encrypted preference, similar to project sidebar
membership) is a deliberate follow-up — not in this MVP.

## UI

- **Settings → Communities → Community sections**: catalog + subscribe switch
  for everyone; create/edit/delete for owner/admin.
- **Left nav**: subscribed community sections render via `SidebarSection`
  above personal custom sections. Those channel ids are excluded from the
  personal-section / Channels buckets while subscribed.

## Files

- `crates/buzz-core/src/community_sections.rs` — payload validation
- `crates/buzz-core/src/kind.rs` — `KIND_COMMUNITY_SECTIONS = 30625`
- `crates/buzz-relay/src/handlers/ingest.rs` — authorize + UsersWrite
- `desktop/src/features/community-sections/**` — catalog, subs, hooks, settings
- `desktop/src/features/sidebar/ui/AppSidebar.tsx` — nav rendering
- `desktop/src/features/settings/ui/SettingsPanels.tsx` / `SettingsView.tsx`

## Next steps

1. Encrypt-and-sync subscriptions across devices (30078 preference blob).
2. Optional default-subscribe for newly created sections.
3. Drag-reorder community sections in admin UI (order field already exists).
4. Hide channels the member cannot access from the section list.
5. E2E: admin publish → member subscribe → section appears in sidebar.
