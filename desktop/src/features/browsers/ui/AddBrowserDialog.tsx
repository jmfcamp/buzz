import * as React from "react";

import type { PlaygroundCard } from "@/features/playground/lib/types";
import { Button } from "@/shared/ui/button";
import { ChooserDialogContent } from "@/shared/ui/chooser-dialog-content";
import { Dialog } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

import { buildBrowserSessionCard } from "../lib/addBrowserSession";

export function AddBrowserDialog({
  onOpenChange,
  onSubmit,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (card: PlaygroundCard) => void;
  open: boolean;
}) {
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setUrl("");
    setName("");
    setError(null);
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const card = buildBrowserSessionCard({ url, name });
    if (!card) {
      setError("Enter an http(s) URL.");
      return;
    }
    onSubmit(card);
    onOpenChange(false);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <ChooserDialogContent
        footer={
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              data-testid="browsers-add-submit"
              form="browsers-add-form"
              type="submit"
            >
              Open
            </Button>
          </div>
        }
        title="Add browser"
      >
        <form
          className="space-y-4"
          id="browsers-add-form"
          onSubmit={handleSubmit}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="browsers-add-url">
              URL
            </label>
            <Input
              autoFocus
              data-testid="browsers-add-url"
              id="browsers-add-url"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              value={url}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="browsers-add-name">
              Name{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Input
              data-testid="browsers-add-name"
              id="browsers-add-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Uses the site host when empty"
              value={name}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </ChooserDialogContent>
    </Dialog>
  );
}
