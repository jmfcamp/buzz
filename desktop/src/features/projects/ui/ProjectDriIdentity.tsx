import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { resolveUserLabel } from "@/features/profile/lib/identity";
import { UserProfilePopover } from "@/features/profile/ui/UserProfilePopover";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { UserAvatar } from "@/shared/ui/UserAvatar";

/**
 * DRI label plus avatar only. The name stays in the accessible label.
 * Hover says "Directly Responsible Individual".
 * Clicking the avatar opens the existing profile panel.
 */
export function ProjectDriIdentity({
  profiles,
  pubkey,
}: {
  profiles?: UserProfileLookup;
  pubkey: string;
}) {
  const normalized = normalizePubkey(pubkey);
  const profile = profiles?.[normalized] ?? profiles?.[pubkey];
  const name = resolveUserLabel({
    preferResolvedSelfLabel: true,
    profiles,
    pubkey: normalized,
  });
  const isAgent = profile?.isAgent === true;

  return (
    <span
      className="flex min-w-0 shrink items-center gap-1.5 text-xs font-normal text-muted-foreground"
      data-testid="project-dri"
      title="Directly Responsible Individual"
    >
      <span className="shrink-0">DRI</span>
      <UserProfilePopover
        pubkey={normalized}
        triggerAriaLabel={`DRI ${name}`}
        triggerClassName="shrink-0"
        triggerElement="span"
        triggerTestId="project-dri-profile"
      >
        <UserAvatar
          avatarUrl={profile?.avatarUrl ?? null}
          displayName={name}
          shape={isAgent ? "squircle" : "circle"}
          size="xs"
        />
      </UserProfilePopover>
    </span>
  );
}
