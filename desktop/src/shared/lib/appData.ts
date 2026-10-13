// App-wide envelope instance for synced app data lanes. See appDataEnvelope.ts for the format and compatibility rules.
import { relayClient } from "@/shared/api/relayClient";
import {
  nip44DecryptFromSelf,
  nip44EncryptToSelf,
  signRelayEvent,
} from "@/shared/api/tauri";
import { getIdentity } from "@/shared/api/tauriIdentity";
import { createEnvelope, ENVELOPE_FLAG } from "./appDataEnvelope";

const envelope = createEnvelope({
  pubkey: async () => (await getIdentity()).pubkey,
  encryptToSelf: nip44EncryptToSelf,
  decryptFromSelf: nip44DecryptFromSelf,
  fetchOwn: async (pubkey, d) => {
    const events = await relayClient.fetchEvents({
      kinds: [30078],
      authors: [pubkey],
      "#d": [d],
      limit: 1,
    });
    const ev = events.find((e) => e.pubkey === pubkey);
    return ev ? ev.content : null;
  },
  publishOwn: async (d, content) => {
    const event = await signRelayEvent({
      kind: 30078,
      content,
      tags: [["d", d]],
    });
    await relayClient.publishEvent(
      event,
      "Timed out publishing data key.",
      "Failed to publish data key.",
    );
  },
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  enabled: () => {
    try {
      return localStorage.getItem(ENVELOPE_FLAG) === "1";
    } catch {
      return false;
    }
  },
});

/** Decrypt a synced app-data blob: envelope ("benv1:") or legacy NIP-44-to-self. */
export const decryptAppData = (content: string) => envelope.decrypt(content);
/** Encrypt a synced app-data blob (envelope when enabled, else legacy NIP-44-to-self). */
export const encryptAppData = (plaintext: string) => envelope.encrypt(plaintext);
