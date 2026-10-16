/**
 * The relay rejects every mutation on an archived channel — including the
 * kind:9008 delete — with "channel is archived". The only mutation it lets
 * through is kind:9002 `archived=false` (unarchive). So deleting an archived
 * channel is: unarchive, then delete. If the delete then fails we try to
 * re-archive so the channel is left in its original state, and surface an
 * error that says exactly what state it ended in.
 */
export type DeleteArchivedChannelDeps = {
  deleteChannel: (channelId: string) => Promise<void>;
  unarchiveChannel: (channelId: string) => Promise<void>;
  archiveChannel: (channelId: string) => Promise<void>;
};

export function isChannelArchivedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /channel is archived/i.test(message);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function deleteChannelUnarchivingIfNeeded(
  channelId: string,
  knownArchived: boolean,
  deps: DeleteArchivedChannelDeps,
): Promise<void> {
  if (!knownArchived) {
    try {
      await deps.deleteChannel(channelId);
      return;
    } catch (error) {
      // Our cached archived flag can be stale; fall through only when the
      // relay told us the channel is archived.
      if (!isChannelArchivedError(error)) throw error;
    }
  }

  try {
    await deps.unarchiveChannel(channelId);
  } catch (error) {
    throw new Error(
      `Could not unarchive the channel before deleting it: ${errorText(error)}. The channel is unchanged (still archived).`,
    );
  }

  try {
    await deps.deleteChannel(channelId);
  } catch (deleteError) {
    try {
      await deps.archiveChannel(channelId);
    } catch (rearchiveError) {
      throw new Error(
        `Delete failed after unarchiving: ${errorText(deleteError)}. Re-archiving also failed (${errorText(rearchiveError)}), so the channel is now UNARCHIVED — archive or delete it again.`,
      );
    }
    throw new Error(
      `Delete failed after unarchiving: ${errorText(deleteError)}. The channel was re-archived and is unchanged.`,
    );
  }
}
