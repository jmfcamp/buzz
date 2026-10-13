// Envelope encryption for synced app data (kind 30078 lanes).
//
// Today every lane blob is NIP-44 encrypted to self, so on web each read/write is a remote-signer round trip. With the
// envelope, one random per-account data key is wrapped ONCE via NIP-44 to self (its own 30078 event,
// d = "buzz-data-key:<keyId>") and lane blobs are NIP-44 v2 encrypted locally with it:
//   content = "benv1:<keyId>:<nip44 v2 payload>"
//
// Compatibility (mixed clients, e.g. desktop hula.6 that only knows plain NIP-44-to-self):
//  - READ: always supported. Anything without the "benv1:" prefix is decrypted the old way, so old data never breaks.
//  - WRITE: envelope only when enabled (localStorage "buzz-app-data-envelope" = "1"). Default OFF, so new blobs stay
//    readable by hula.6 until every client in use has the reader. Turning it off again is safe: we go back to
//    plain NIP-44 on the next write.
//  - Key ids are content-addressed and each key lives under its own d-tag, so two clients creating keys at once never
//    overwrite each other's key: every envelope stays decryptable.
// The data key never leaves this device's memory / the self-encrypted key event; it is not the account key.
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { decrypt as nip44Decrypt, encrypt as nip44Encrypt } from "nostr-tools/nip44";

export const ENVELOPE_PREFIX = "benv1:";
export const KEY_D_PREFIX = "buzz-data-key:";
export const KEY_POINTER_D = "buzz-data-key";
export const ENVELOPE_FLAG = "buzz-app-data-envelope";

export type EnvelopeDeps = {
  pubkey: () => Promise<string>;
  encryptToSelf: (plaintext: string) => Promise<string>;
  decryptFromSelf: (ciphertext: string) => Promise<string>;
  /** Latest own kind-30078 event content with this d-tag, or null. */
  fetchOwn: (pubkey: string, d: string) => Promise<string | null>;
  /** Sign + publish own kind-30078 event with this d-tag. */
  publishOwn: (d: string, content: string) => Promise<void>;
  randomBytes: (n: number) => Uint8Array;
  enabled: () => boolean;
};

export const keyIdOf = (key: Uint8Array) => bytesToHex(sha256(key)).slice(0, 16);

export function isEnvelope(content: string): boolean {
  return content.startsWith(ENVELOPE_PREFIX);
}

export function createEnvelope(deps: EnvelopeDeps) {
  const keys = new Map<string, Promise<Uint8Array>>(); // keyId -> key
  let current: Promise<{ id: string; key: Uint8Array }> | null = null;

  const unwrap = async (wrapped: string, id: string): Promise<Uint8Array> => {
    const key = hexToBytes((await deps.decryptFromSelf(wrapped)).trim());
    if (key.length !== 32 || keyIdOf(key) !== id) throw new Error("data key mismatch");
    return key;
  };

  const loadKey = (id: string): Promise<Uint8Array> => {
    let p = keys.get(id);
    if (!p) {
      p = (async () => {
        const pk = await deps.pubkey();
        const wrapped = await deps.fetchOwn(pk, KEY_D_PREFIX + id);
        if (!wrapped) throw new Error(`data key ${id} not found`);
        return unwrap(wrapped, id);
      })();
      p.catch(() => keys.delete(id)); // retry later on failure
      keys.set(id, p);
    }
    return p;
  };

  const currentKey = () => {
    if (!current) {
      current = (async () => {
        const pk = await deps.pubkey();
        const pointer = await deps.fetchOwn(pk, KEY_POINTER_D);
        if (pointer) {
          const id = pointer.trim();
          if (/^[0-9a-f]{16}$/.test(id)) return { id, key: await loadKey(id) };
        }
        const key = deps.randomBytes(32);
        const id = keyIdOf(key);
        // Key event first, pointer second: a reader can never see a pointer to a missing key.
        await deps.publishOwn(KEY_D_PREFIX + id, await deps.encryptToSelf(bytesToHex(key)));
        await deps.publishOwn(KEY_POINTER_D, id);
        keys.set(id, Promise.resolve(key));
        return { id, key };
      })();
      current.catch(() => {
        current = null;
      });
    }
    return current;
  };

  return {
    async decrypt(content: string): Promise<string> {
      if (!isEnvelope(content)) return deps.decryptFromSelf(content);
      const rest = content.slice(ENVELOPE_PREFIX.length);
      const sep = rest.indexOf(":");
      if (sep !== 16) throw new Error("malformed envelope");
      const key = await loadKey(rest.slice(0, sep));
      return nip44Decrypt(rest.slice(sep + 1), key);
    },
    async encrypt(plaintext: string): Promise<string> {
      if (!deps.enabled()) return deps.encryptToSelf(plaintext);
      const { id, key } = await currentKey();
      return `${ENVELOPE_PREFIX}${id}:${nip44Encrypt(plaintext, key)}`;
    },
  };
}
