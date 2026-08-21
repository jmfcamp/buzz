import {
  saveQueuedAttachmentsForDraft,
  type QueuedMediaAttachment,
} from "@/features/messages/lib/backgroundMediaUploadStore";
import {
  loadDraftEntry,
  persistDraftEntry,
} from "@/features/messages/lib/useDrafts";

import { dismissPlayground } from "./sessions.ts";
import type { PlaygroundConversation } from "./conversation.ts";

export const PLAYGROUND_DRAFT_ATTACHMENT_EVENT =
  "buzz:playground-draft-attachment";

export type PlaygroundScreenshotResult = {
  bytes: number[];
  mime: string;
  filename: string;
};

export function playgroundScreenshotFile(
  result: PlaygroundScreenshotResult,
): File {
  const bytes = Uint8Array.from(result.bytes);
  return new File([bytes], result.filename, { type: result.mime });
}

export function stagePlaygroundScreenshotDraft(input: {
  conversation: PlaygroundConversation;
  file: File;
}): QueuedMediaAttachment {
  const previewUrl =
    input.file.type.startsWith("image/") &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(input.file)
      : undefined;
  const attachment: QueuedMediaAttachment = {
    file: input.file,
    id: Date.now(),
    previewUrl,
    spoilered: false,
  };
  const existing = loadDraftEntry(input.conversation.draftKey);
  if (existing) {
    persistDraftEntry(
      input.conversation.draftKey,
      existing.content,
      input.conversation.channelId,
      existing.pendingImeta,
      existing.spoileredAttachmentUrls,
      existing.mentionRefs ?? [],
    );
  }
  saveQueuedAttachmentsForDraft(input.conversation.draftKey, [attachment]);
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(PLAYGROUND_DRAFT_ATTACHMENT_EVENT, {
          detail: {
            draftKey: input.conversation.draftKey,
            attachments: [attachment],
          },
        }),
      );
    } catch {
      // Node test hosts may lack CustomEvent.
    }
  }
  return attachment;
}

export function dismissAndStagePlaygroundScreenshot(input: {
  conversation: PlaygroundConversation;
  file: File;
}): QueuedMediaAttachment {
  const attachment = stagePlaygroundScreenshotDraft(input);
  dismissPlayground();
  return attachment;
}
