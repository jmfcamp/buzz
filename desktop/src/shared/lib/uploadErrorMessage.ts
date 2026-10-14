/**
 * One calm line for a failed upload. Strips repeated "Upload failed:" prefixes added by
 * lower layers and explains server type rejections in plain words.
 */
export function uploadErrorMessage(raw: string | undefined): string {
  let msg = (raw ?? "").trim();
  while (/^upload failed:\s*/i.test(msg)) msg = msg.replace(/^upload failed:\s*/i, "");
  const disallowed = /disallowed content type:\s*(\S+)/i.exec(msg);
  if (disallowed) {
    const type = disallowed[1];
    return type.startsWith("audio/")
      ? "Couldn't upload this voice note: the server doesn't accept audio files yet."
      : `Couldn't upload this file: the server doesn't accept ${type}.`;
  }
  return msg ? `Couldn't upload: ${msg}` : "Couldn't upload this file.";
}
