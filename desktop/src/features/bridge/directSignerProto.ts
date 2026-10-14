// Shared protocol for "desktop as signer over Direct" (web device <-> desktop). Pure; used by both sides.
// The web never holds the account key: it holds a per-device keypair (approved once on the desktop) and signs each
// request digest with it. The account key never leaves the desktop, and nothing secret travels over Direct.
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export type SignReqEvent = { kind: number; created_at: number; tags: string[][]; content: string };

/** Kinds the desktop signs for an approved device without asking. Everything else needs an approval on the desktop. */
export const AUTO_SIGN_KINDS: ReadonlySet<number> = new Set([
  9, // stream message
  40002, // stream message v2
  40003, // message edit
  40008, // message diff
  45001, // forum post
  45003, // forum comment
  7, // reaction
  30078, // app data (read markers, synced settings)
  22242, // relay auth
  27235, // HTTP auth (NIP-98)
]);

/** Low-risk kinds newer desktops also sign without asking (ephemeral presence/typing, media upload auth, observer
 *  control frames to your own agents). Only sent to desktops that advertise SIGNER_CAP_SIGN_ANY: older desktops would
 *  prompt for every typing indicator. */
export const AUTO_SIGN_KINDS_V2: ReadonlySet<number> = new Set([...AUTO_SIGN_KINDS, 20001, 20002, 24242, 24200]);
/** Desktop signs any kind for an approved device: AUTO_SIGN_KINDS_V2 silently, everything else after a prompt there. */
export const SIGNER_CAP_SIGN_ANY = "sign-any";
/** Kinds that always stay with the remote signer (session handshake is NIP-46 itself, not events). */
export const isAutoSignKind = (kind: number, caps?: readonly string[]) =>
  (caps?.includes(SIGNER_CAP_SIGN_ANY) ? AUTO_SIGN_KINDS_V2 : AUTO_SIGN_KINDS).has(kind);

export function signDigest(sessionNonce: string, seq: number, ev: SignReqEvent): Uint8Array {
  const body = JSON.stringify([ev.kind, ev.created_at, ev.tags, ev.content]);
  return sha256(utf8ToBytes(`buzz-direct-sign\n${sessionNonce}\n${seq}\n${body}`));
}

/** Capabilities a desktop advertises in signer.hello (older desktops send none: sign only). */
export const SIGNER_CAP_NIP44 = "nip44";
export type CryptOp = "nip44_encrypt" | "nip44_decrypt";

/** Device signature over an encrypt/decrypt request: binds op, peer and the exact text to this connection + seq. */
export function cryptDigest(sessionNonce: string, seq: number, op: CryptOp, peer: string, text: string): Uint8Array {
  const body = JSON.stringify([op, peer, bytesToHex(sha256(utf8ToBytes(text)))]);
  return sha256(utf8ToBytes(`buzz-direct-crypt\n${sessionNonce}\n${seq}\n${body}`));
}

export function unpairDigest(sessionNonce: string, devicePubkey: string): Uint8Array {
  return sha256(utf8ToBytes(`buzz-direct-unpair\n${sessionNonce}\n${devicePubkey}`));
}

/** Device signature that opens a Direct connection (instead of an account-key kind-22242 via the remote signer). */
export function connectDigest(challengeNonce: string, desktopId: string, connId: string, devicePubkey: string): Uint8Array {
  return sha256(utf8ToBytes(`buzz-direct-connect\n${challengeNonce}\n${desktopId}\n${connId}\n${devicePubkey}`));
}

export function pairDigest(sessionNonce: string, devicePubkey: string): Uint8Array {
  return sha256(utf8ToBytes(`buzz-direct-pair\n${sessionNonce}\n${devicePubkey}`));
}

export const signWithDevice = (digest: Uint8Array, deviceSecretHex: string) =>
  bytesToHex(schnorr.sign(digest, hexToBytes(deviceSecretHex)));

export function verifyDevice(digest: Uint8Array, sigHex: string, devicePubkey: string): boolean {
  try {
    return schnorr.verify(hexToBytes(sigHex), digest, hexToBytes(devicePubkey));
  } catch {
    return false;
  }
}

export const devicePubkeyOf = (secretHex: string) => bytesToHex(schnorr.getPublicKey(hexToBytes(secretHex)));
