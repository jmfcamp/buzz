// Lazy NIP-44 self-decrypt for rarely used synced lanes (project sidebar membership, reminders).
// On web every decrypt is a remote-signer round trip, so these wait until the app has been up for a while
// (LAZY_AFTER_MS) instead of competing with boot. Desktop decrypts locally and is unaffected.
import { nip44DecryptFromSelf } from "@/shared/api/tauri";

export const LAZY_AFTER_MS = 20_000;
const startedAt = Date.now();

function isWeb(): boolean {
  try {
    return import.meta.env?.VITE_BUZZ_PLATFORM === "web";
  } catch {
    return false;
  }
}

export function lazyDelayMs(now = Date.now(), web = isWeb()): number {
  return web ? Math.max(0, startedAt + LAZY_AFTER_MS - now) : 0;
}

export async function lazyDecryptFromSelf(ciphertext: string): Promise<string> {
  const wait = lazyDelayMs();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return nip44DecryptFromSelf(ciphertext);
}
