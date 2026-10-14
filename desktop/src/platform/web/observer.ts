import { beginBusy } from "@/shared/lib/backgroundBusy";
import { observerDecryptFailed, observerDecryptStarted, observerDecryptSucceeded } from "@/shared/lib/observerDecryptStatus";
// Web ports of the agent-observer crypto commands (src-tauri/src/commands/identity.rs:
// decrypt_observer_event, build_observer_control_event; crates/buzz-core observer.rs, buzz-sdk builders.rs).
// Frames are NIP-44 v2 between the agent key (event author) and the owner key (the web signer); the page never
// holds a secret key, so crypto goes through the signer's nip44 (cached by the instrumented signer).
import { verifyEvent } from "nostr-tools";
import { getSigner } from "./signer";
import { desktopSignerActive, getDirectSigner } from "./signer/directRoute";

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
// One lane PER AGENT: a bot whose frames are slow to decrypt (e.g. falling back to a sleeping Primal) must not starve or
// drop the frames of the user's other agents.
type Lane = { jobs: Job[]; busy: boolean };
const lanes = new Map<string, Lane>();
function pump(l: Lane) {
  if (l.busy) return;
  const job = l.jobs.shift();
  if (!job) return;
  l.busy = true;
  job.run().then(job.resolve, job.reject).finally(() => {
    l.busy = false;
    pump(l);
  });
}
export function observerDecryptLane(run: () => Promise<string>, agent = ""): Promise<string> {
  let l = lanes.get(agent);
  if (!l) lanes.set(agent, (l = { jobs: [], busy: false }));
  const lane = l;
  return new Promise<string>((resolve, reject) => {
    lane.jobs.push({ run, resolve, reject });
    while (lane.jobs.length > OBSERVER_LANE_MAX_BACKLOG) lane.jobs.shift()?.reject(new Error("stale observer frame skipped (signer busy)"));
    pump(lane);
  });
}

// While the paired desktop is live over Direct, observer frames are decrypted there FIRST. When the desktop refuses a peer
// (hula.8 only decrypts frames from its local managed agents; community/Hula bots need the next desktop release) we
// remember that peer for a while and do NOT fall back to the remote signer (Primal sleeps while Direct is live, so every
// frame would wait out its timeouts, trip the breaker and leave the pane on "Waiting for signer" forever).
export const OBSERVER_NEEDS_DESKTOP_UPDATE = "Live activity for this bot shows after the next desktop update.";
const REFUSED_TTL_MS = 5 * 60_000;
const DIRECT_OBSERVER_TIMEOUT_MS = 6_000;
const refusedPeers = new Map<string, number>();
const isRefusal = (e: unknown) =>
  /own data|not offered|unsupported|not_supported/i.test(`${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? e}`) &&
  !/can't encrypt\/decrypt yet/i.test(String((e as Error)?.message ?? e));
async function observerDecrypt(peer: string, ct: string, fallback: () => Promise<string>): Promise<string> {
  const ds = getDirectSigner();
  if (!ds?.crypt || !desktopSignerActive()) return fallback();
  const refusedAt = refusedPeers.get(peer);
  if (refusedAt && Date.now() - refusedAt < REFUSED_TTL_MS) throw new Error(OBSERVER_NEEDS_DESKTOP_UPDATE);
  try {
    return await Promise.race([
      ds.crypt("nip44_decrypt", peer, ct),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("direct crypt timeout")), DIRECT_OBSERVER_TIMEOUT_MS)),
    ]);
  } catch (e) {
    if (isRefusal(e)) {
      refusedPeers.set(peer, Date.now());
      throw new Error(OBSERVER_NEEDS_DESKTOP_UPDATE);
    }
    return fallback();
  }
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
  const agent = String(ev.pubkey).toLowerCase();
  const done = observerDecryptStarted(agent);
  const busyDone = beginBusy("observer-decrypt");
  let plaintext: string;
  try {
    plaintext = await observerDecryptLane(() => observerDecrypt(agent, ev.content, () => n.decrypt(ev.pubkey, ev.content)), agent);
    observerDecryptSucceeded(agent);
  } catch (e) {
    if (String((e as Error)?.message ?? e) !== OBSERVER_NEEDS_DESKTOP_UPDATE) observerDecryptFailed(agent);
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
