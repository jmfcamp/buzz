import { playgroundWebviewLabelForWindow } from "@/features/playground/lib/webview";

export function pinWebviewLabelForWindow(
  pinId: string,
  windowLabel = "main",
): string {
  const cleaned = windowLabel.trim() || "main";
  if (cleaned === "main") return `pin-${pinId}`;
  return `pin-${pinId}--${cleaned}`;
}

export function browserWebviewLabel(input: {
  surface: "playground" | "pin";
  surfaceId: string;
  windowLabel?: string;
}): string {
  if (input.surface === "playground") {
    return playgroundWebviewLabelForWindow(
      input.surfaceId,
      input.windowLabel ?? "main",
    );
  }
  return pinWebviewLabelForWindow(input.surfaceId, input.windowLabel ?? "main");
}
