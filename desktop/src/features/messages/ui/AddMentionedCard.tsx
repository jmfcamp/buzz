import { Button } from "@/shared/ui/button";

type AddMentionedCardProps = {
  open: boolean;
  names: string[];
  channelName: string | null;
  canAdd: boolean;
  error: string | null;
  isPending: boolean;
  onAdd: () => void;
  onDismiss: () => void;
};

/** Hula: calm post-send card offering to add mentioned non-members. */
export function AddMentionedCard({
  open,
  names,
  channelName,
  canAdd,
  error,
  isPending,
  onAdd,
  onDismiss,
}: AddMentionedCardProps) {
  if (!open || names.length === 0) return null;
  const who =
    names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const where = channelName ? `#${channelName}` : "this channel";
  return (
    <div
      className="mx-3 mb-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm"
      data-testid="add-mentioned-card"
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-muted-foreground">
          <span className="font-medium text-foreground">{who}</span>{" "}
          {names.length === 1 ? "isn't" : "aren't"} in {where}.
        </span>
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={isPending}
            onClick={onDismiss}
            size="sm"
            type="button"
            variant="ghost"
          >
            Not now
          </Button>
          {canAdd ? (
            <Button
              disabled={isPending}
              onClick={onAdd}
              size="sm"
              type="button"
            >
              {isPending ? "Adding…" : "Add to channel"}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
