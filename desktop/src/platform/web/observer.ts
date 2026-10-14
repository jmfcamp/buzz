import { beginBusy } from "@/shared/lib/backgroundBusy";
import { observerDecryptFailed, observerDecryptStarted, observerDecryptSucceeded } from "@/shared/lib/observerDecryptStatus";
// Web ports of the agent-observer crypto commands (src-tauri/src/commands/identity.rs:
// decrypt_observer_event, build_observer_control_event; crates/buzz-core observer.rs, buzz-sdk builders.rs).
// Frames are NIP-44 v2 between the agent key (event author) and the owner key (the web signer); the page never
// holds a secret key, so crypto goes through the signer's nip44 (cached by the instrumented signer).
import { verifyEvent } from "nostr-tools";
import { getSigner } from "./signer";

type Args = Record<string, any> | undefined;

const KIND_AGENT_OBSERVER_FRAME = 24200;
const NIP44_MIN_CONTENT_LEN = 132;
const NIP44_MAX_CONTENT_LEN = 87_472;
const OBSERVER_MAX_PLAINTEXT_LEN = 65_535;
const HEX64 = /^[0-9a-f]{64}$/;

const contentLooksLikeNip44 = (c: string) =>
  c.length >= NIP44_MIN_CONTENT_LEN && c.length <= NIP44_MAX_CONTENT_LEN;

// Live frames arrive several per second while an agent thinks; each needs a signer decrypt. They go through ONE low-priority
// lane (one at a time) with a short backlog: when the signer (Primal) falls behind, the oldest waiting frames are dropped so
// the panel catches up to the latest state instead of flooding the signer. The paired desktop (Direct) answers in ms.
const OBSERVER_LANE_MAX_BACKLOG = 6;
type Job = { run: () => Promise<string>; resolve: (s: string) => void; reject: (e: unknown) => void };
const lane: Job[] = [];
let laneBusy = false;
function pump() {
  if (laneBusy) return;
  const job = lane.shift();
  if (!job) return;
  laneBusy = true;
  job.run().then(job.resolve, job.reject).finally(() => {
    laneBusy = false;
    pump();
  });
}
export function observerDecryptLane(run: () => Promise<string>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    lane.push({ run, resolve, reject });
    while (lane.length > OBSERVER_LANE_MAX_BACKLOG) lane.shift()?.reject(new Error("stale observer frame skipped (signer busy)"));
    pump();
  });
}

export async function decryptObserverEvent(a: Args): Promise<unknown> {
  let ev: { id: string; pubkey: string; content: string; sig: string; kind: number; tags: string[][]; created_at: number };
  try {
    ev = JSON.parse(a?.eventJson ?? "");
  } catch (e) {
    throw new Error(`invalid event: ${String((e as Error)?.message ?? e)}`);
  }
  if (!ev || typeof ev.content !== "string" || !HEX64.test(String(ev.pubkey))) throw new Error("invalid event: malformed");
  // Defense-in-depth like desktop: verify id + signature before decrypting.
  if (!verifyEvent(ev as never)) throw new Error("observer event has invalid ID or signature");
  if (!contentLooksLikeNip44(ev.content))
    throw new Error(`decrypt observer event failed: invalid NIP-44 ciphertext length: ${ev.content.length}`);
  const n = getSigner().nip44;
  if (!n) throw new Error("Your signer does not support NIP-44 decryption.");
  const done = observerDecryptStarted();
  const busyDone = beginBusy("observer-decrypt");
  let plaintext: string;
  try {
    plaintext = await observerDecryptLane(() => n.decrypt(ev.pubkey, ev.content));
    observerDecryptSucceeded();
  } catch (e) {
    observerDecryptFailed();
    throw e;
  } finally {
    done();
    busyDone();
  }
  if (plaintext.length > OBSERVER_MAX_PLAINTEXT_LEN)
    throw new Error(`decrypt observer event failed: observer plaintext exceeds ${OBSERVER_MAX_PLAINTEXT_LEN} bytes`);
  try {
    return JSON.parse(plaintext);
  } catch (e) {
    throw new Error(`decrypt observer event failed: JSON error: ${String((e as Error)?.message ?? e)}`);
  }
}

export async function buildObserverControlEvent(a: Args): Promise<string> {
  const agent = String(a?.agentPubkey ?? "").trim().toLowerCase();
  if (!HEX64.test(agent)) throw new Error("invalid agent pubkey");
  const s = getSigner();
  if (!s.nip44) throw new Error("Your signer does not support NIP-44 encryption.");
  const plaintext = JSON.stringify(a?.payload ?? null);
  if (plaintext.length > OBSERVER_MAX_PLAINTEXT_LEN) throw new Error("encrypt observer control failed: observer plaintext too large");
  const content = await s.nip44.encrypt(agent, plaintext);
  if (!contentLooksLikeNip44(content)) throw new Error("build observer control failed: observer frame content must be NIP-44 v2 ciphertext");
  const ev = await s.signEvent(
    {
      kind: KIND_AGENT_OBSERVER_FRAME,
      content,
      tags: [["p", agent], ["agent", agent], ["frame", "control"]],
    },
    { priority: 0 },
  );
  return JSON.stringify(ev);
}
