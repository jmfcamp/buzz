import * as React from "react";
import { toast } from "sonner";

import { HuddleAttachment } from "@/features/huddle/components/HuddleAttachment";
import { hasLinkPreviewSuppression } from "@/features/messages/lib/formatTimelineMessages";
import { resolveSnapshotSharedBy } from "@/features/messages/lib/snapshotSharedBy";
import { useMessageEmoji } from "@/features/messages/lib/useMessageEmoji";
import { parseWaveMessageContent } from "@/features/messages/lib/waveMessage";
import type { TimelineMessage } from "@/features/messages/types";
import { getConfigNudgeAuthorPubkey } from "@/features/messages/ui/configNudgeAuthPubkey";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { editMessage } from "@/shared/api/tauri";
import {
  KIND_HUDDLE_STARTED,
  KIND_STREAM_MESSAGE_DIFF,
} from "@/shared/constants/kinds";
import { useChannelNavigation } from "@/shared/context/ChannelNavigationContext";
import { cn } from "@/shared/lib/cn";
import { resolveMentionProps } from "@/shared/lib/resolveMentionNames";
import { parseImetaTags } from "@/shared/ui/markdown/parseImeta";
import type { VideoReviewContext } from "@/shared/ui/VideoPlayer";
import { VideoReviewCommentMarkdown } from "@/shared/ui/VideoReviewCommentMarkdown";
import { useMessageAgentAddressPrefix } from "./MessageAgentAddressPrefix";
import { WaveMessageAttachment } from "./WaveMessageAttachment";

const DiffMessage = React.lazy(() => import("./DiffMessage"));
const DiffMessageExpanded = React.lazy(() => import("./DiffMessageExpanded"));

const EMOJI_ONLY_CLASS_NAME =
  "text-4xl leading-tight [&_p]:leading-tight [&_img[data-custom-emoji]]:h-[1.45em] [&_img[data-custom-emoji]]:align-middle [&_button:has(img[data-custom-emoji])]:align-middle";

/**
 * Channel and Inbox share this body. Kind-specific cards (huddle invite,
 * diff, wave) and markdown cards (link preview, snapshot, config nudge)
 * render here so a surface cannot drop them by rendering raw markdown.
 */
export function MessageBody({
  canRemoveLinkPreviews = false,
  channelId = null,
  huddleMemberPubkeys,
  huddleMemberPubkeysPending = false,
  isKnownAgentPubkey,
  markdownClassName,
  message,
  profiles,
  searchQuery,
  videoReviewCommentRootId,
  videoReviewContext,
}: {
  canRemoveLinkPreviews?: boolean;
  channelId?: string | null;
  huddleMemberPubkeys?: readonly string[];
  huddleMemberPubkeysPending?: boolean;
  isKnownAgentPubkey: (pubkey: string) => boolean;
  markdownClassName: string;
  message: TimelineMessage;
  profiles?: UserProfileLookup;
  searchQuery?: string;
  videoReviewCommentRootId?: string;
  videoReviewContext?: VideoReviewContext;
}) {
  const [expandedDiffId, setExpandedDiffId] = React.useState<string | null>(
    null,
  );
  const linkPreviewsSuppressed = hasLinkPreviewSuppression(message.tags);
  const removeLinkPreviewsForEveryone =
    canRemoveLinkPreviews &&
    channelId &&
    !message.pending &&
    !linkPreviewsSuppressed
      ? async () => {
          const tags = message.tags ?? [];
          try {
            await editMessage(
              channelId,
              message.id,
              message.body,
              tags.filter((tag) => tag[0] === "imeta"),
              tags.filter((tag) => tag[0] === "emoji"),
              undefined,
              true,
              tags.filter((tag) => tag[0] === "mention"),
            );
          } catch (error) {
            toast.error(
              `Failed to remove previews: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
          }
        }
      : undefined;
  const { mentionNames, mentionPubkeysByName } = React.useMemo(
    () => resolveMentionProps(message.tags, profiles, message.body),
    [profiles, message.tags, message.body],
  );
  const agentMentionPubkeysByName = React.useMemo(() => {
    if (!mentionPubkeysByName) {
      return undefined;
    }
    const values: Record<string, string> = {};
    for (const [name, pubkey] of Object.entries(mentionPubkeysByName)) {
      if (isKnownAgentPubkey(pubkey)) {
        values[name] = pubkey;
      }
    }
    return Object.keys(values).length > 0 ? values : undefined;
  }, [isKnownAgentPubkey, mentionPubkeysByName]);
  const agentAddressPrefix = useMessageAgentAddressPrefix({
    profiles,
    body: message.body,
    tags: message.tags,
    mentionNames,
    mentionPubkeysByName,
    isKnownAgentPubkey,
  });
  const imetaByUrl = React.useMemo(
    () => (message.tags ? parseImetaTags(message.tags) : undefined),
    [message.tags],
  );
  const snapshotSharedBy = React.useMemo(
    () =>
      resolveSnapshotSharedBy(
        { signerPubkey: message.signerPubkey },
        profiles,
      ),
    [message.signerPubkey, profiles],
  );
  const { customEmoji, emojiOnly } = useMessageEmoji(message.body, message.tags);
  const { nonDmChannelNames: channelNames } = useChannelNavigation();
  const getTag = (name: string) =>
    message.tags?.find((tag) => tag[0] === name)?.[1];

  let body: React.ReactNode;
  switch (message.kind) {
    case KIND_STREAM_MESSAGE_DIFF:
      body = (
        <React.Suspense
          fallback={
            <div className="p-3 text-sm text-muted-foreground">
              Loading diff…
            </div>
          }
        >
          <DiffMessage
            commitSha={getTag("commit")}
            content={message.body}
            description={getTag("description")}
            filePath={getTag("file")}
            onExpand={() => {
              setExpandedDiffId(message.id);
            }}
            repoUrl={getTag("repo")}
            searchQuery={searchQuery}
            truncated={getTag("truncated") === "true"}
          />
        </React.Suspense>
      );
      break;
    case KIND_HUDDLE_STARTED:
      body = (
        <HuddleAttachment
          channelId={channelId}
          className="mt-2"
          message={message}
        />
      );
      break;
    default: {
      const waveMessage = parseWaveMessageContent(message.body);
      body = waveMessage ? (
        <WaveMessageAttachment
          channelId={channelId}
          fallbackText={waveMessage.fallbackText}
          huddleMemberPubkeys={huddleMemberPubkeys}
          huddleMemberPubkeysPending={huddleMemberPubkeysPending}
          searchQuery={searchQuery}
        />
      ) : (
        <VideoReviewCommentMarkdown
          channelNames={channelNames}
          className={cn(
            markdownClassName,
            emojiOnly && EMOJI_ONLY_CLASS_NAME,
          )}
          configNudgeAuthorPubkey={getConfigNudgeAuthorPubkey(
            message,
            isKnownAgentPubkey,
          )}
          content={message.body}
          messageId={message.id}
          linkPreviewsSuppressed={linkPreviewsSuppressed}
          linkPreviewTags={message.tags}
          leadingInlineContent={agentAddressPrefix}
          onRemoveLinkPreviewsForEveryone={removeLinkPreviewsForEveryone}
          customEmoji={customEmoji}
          imetaByUrl={imetaByUrl}
          agentMentionPubkeysByName={agentMentionPubkeysByName}
          mentionNames={mentionNames}
          mentionPubkeysByName={mentionPubkeysByName}
          searchQuery={searchQuery}
          snapshotSharedBy={snapshotSharedBy}
          videoReviewCommentRootId={videoReviewCommentRootId}
          videoReviewContext={videoReviewContext}
        />
      );
    }
  }

  return (
    <>
      {body}
      {expandedDiffId === message.id ? (
        <React.Suspense
          fallback={
            <div className="p-3 text-sm text-muted-foreground">
              Loading diff viewer…
            </div>
          }
        >
          <DiffMessageExpanded
            content={message.body}
            filePath={getTag("file")}
            onClose={() => {
              setExpandedDiffId(null);
            }}
          />
        </React.Suspense>
      ) : null}
    </>
  );
}
