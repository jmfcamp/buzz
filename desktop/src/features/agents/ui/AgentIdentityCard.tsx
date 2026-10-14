import { useRef, type ReactNode } from "react";

import { DIRECT_CONTROLS_HINT, useDesktopData } from "@/features/bridge/ui/DesktopData";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { cn } from "@/shared/lib/cn";
import { IdentityInitialsAvatar } from "./IdentityInitialsAvatar";

type AgentIdentityCardProps = {
  actions?: ReactNode;
  ariaLabel: string;
  avatar?: ReactNode;
  avatarUrl?: string | null;
  footerAccessory?: ReactNode;
  dataTestId: string;
  label: string;
  /**
   * Second line under the agent name: the effective description when one
   * resolves (owner-authored — see `lib/agentDescription.ts`),
   * otherwise the model label. Callers compose the fallback.
   */
  subtitle?: string | null;
  onClick: () => void;
  /** Optional badge rendered below the label (e.g. "Restart required"). */
  statusBadge?: ReactNode;
  /** Single-row footer (name bottom-left, status dot bottom-right) laid out BELOW the avatar so the name never overlaps it. */
  statusDot?: "online" | "away" | "offline" | null;
};

export function AgentIdentityCard({
  actions,
  ariaLabel,
  avatar,
  avatarUrl,
  dataTestId,
  footerAccessory,
  label,
  subtitle,
  onClick,
  statusBadge,
  statusDot,
}: AgentIdentityCardProps) {
  const rowFooter = statusDot !== undefined;
  const trimmedAvatarUrl = avatarUrl?.trim() || null;
  const overlayRef = useRef<HTMLButtonElement>(null);
  // Web without Direct: the card still shows (cached/relay data) but its controls (start/stop on the avatar, the ⋯ menu) are off.
  const { web, live } = useDesktopData();
  const controlsOff = web && !live;
  const gate = (node: ReactNode, testId: string) =>
    controlsOff ? (
      <span className="pointer-events-auto inline-flex cursor-not-allowed" title={DIRECT_CONTROLS_HINT} aria-disabled="true" data-testid={testId}>
        <span className="pointer-events-none">{node}</span>
      </span>
    ) : (
      node
    );

  return (
    <div
      className={cn(
        "group relative aspect-[4/5] w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-muted/50 text-left shadow-xs transition-colors hover:border-border hover:bg-muted/65",
      )}
      data-testid={dataTestId}
      // The whole card (avatar included) is one tap target. iOS Safari doesn't reliably pass taps on the avatar image
      // through to the overlay button, so the card itself handles them. Controls on the card (the ⋮ menu, the Start
      // badge, status badges) keep their own taps, and so do clicks from portalled menus (not inside this DOM node).
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target)) return;
        const control = target.closest("button, a, input, select, textarea, [role='menuitem'], [role='menu'], [data-card-control]");
        if (control && control !== overlayRef.current && event.currentTarget.contains(control)) return;
        onClick();
      }}
    >
      <button
        aria-label={ariaLabel}
        className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        ref={overlayRef}
        type="button"
      />

      <div className={cn(
          "pointer-events-none relative z-20 flex h-full w-full min-w-0 flex-col items-center justify-center gap-5 px-4 text-center",
          rowFooter ? "pt-3 pb-11" : "pb-12",
        )}>
        <div className={cn("flex items-center justify-center", rowFooter ? "aspect-square h-auto max-h-24 w-auto max-w-24 min-h-0 flex-1" : "h-24 w-24")}>
          {avatar && controlsOff ? gate(avatar, `${dataTestId}-controls-off`) : avatar ??
            (trimmedAvatarUrl ? (
              <ProfileAvatar
                avatarUrl={trimmedAvatarUrl}
                className="h-full w-full border-[3px] border-background bg-muted shadow-none"
                iconClassName="h-8 w-8"
                label={label}
                shape="squircle"
              />
            ) : (
              <IdentityInitialsAvatar
                className="shadow-none"
                label={label}
                size={96}
              />
            ))}
        </div>
      </div>

      {actions ? (
        <div className="absolute top-3 right-3 z-40" data-card-control="">{actions}</div>
      ) : null}

      {rowFooter ? (
        <div
          className="pointer-events-none absolute right-3 bottom-3 left-3 z-30 flex min-w-0 items-center gap-2 text-left text-sm leading-5"
          data-testid={`${dataTestId}-footer`}
        >
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground tracking-normal">{label}</span>
          <span
            aria-label={statusDot === "online" ? "Online" : statusDot === "away" ? "Away" : "Offline"}
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              statusDot === "online" ? "bg-emerald-500" : statusDot === "away" ? "bg-amber-400" : "bg-muted-foreground/40",
            )}
            data-testid={`${dataTestId}-status-dot`}
            role="img"
            title={subtitle ?? undefined}
          />
        </div>
      ) : (
      <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-30 flex min-w-0 items-end gap-2 text-left text-sm leading-5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="min-w-0 truncate font-semibold text-foreground tracking-normal">
            {label}
          </span>
          {subtitle ? (
            <span className="line-clamp-2 min-w-0 text-xs font-normal text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
          {/* pointer-events-auto: the overlay button above has pointer-events-none
              on this container, but the status badge itself (a sibling of the button
              in z-order) needs hover so the restart diff tooltip can fire. */}
          {statusBadge ? (
            <div className="pointer-events-auto">{statusBadge}</div>
          ) : null}
        </div>
        {footerAccessory ? (
          <div className="shrink-0">{footerAccessory}</div>
        ) : null}
      </div>
      )}
    </div>
  );
}
