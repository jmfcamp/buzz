import assert from "node:assert/strict";
import test from "node:test";
import { BANNER_SILENCE_MS, ESCALATE_WAIT_MS, RETURN_GRACE_MS, isRevokedAnswer, signerHealth } from "./signerHealth.ts";

test("only a user-initiated timeout with no reply since escalates; background never does; success clears", () => {
  signerHealth.reset();
  for (let i = 0; i < 10; i++) signerHealth.timeout({ background: true, startedAt: Date.now() });
  assert.equal(signerHealth.get().state, "slow");
  assert.equal(signerHealth.blocksBackground(), false);
  signerHealth.success();
  const started = Date.now() + 1; // started after the last reply
  signerHealth.timeout({ startedAt: started });
  assert.deepEqual([signerHealth.get().state, signerHealth.get().reason], ["unresponsive", "timeout"]);
  signerHealth.success(); // any later reply clears it
  assert.equal(signerHealth.get().state, "ok");
  // the signer answered something after this request started: not "unresponsive"
  signerHealth.timeout({ startedAt: Date.now() - 1 });
  assert.equal(signerHealth.get().state, "ok");
});

test("never while hidden, never within the return grace, never for requests started while hidden", () => {
  signerHealth.reset();
  signerHealth.setVisible(false);
  signerHealth.timeout({ startedAt: 0 });
  assert.equal(signerHealth.get().state, "ok");
  const hiddenStart = Date.now() - 1;
  signerHealth.setVisible(true);
  signerHealth.timeout({ startedAt: 0 });
  assert.equal(signerHealth.get().state, "ok", "within grace");
  const realNow = Date.now;
  Date.now = () => realNow() + RETURN_GRACE_MS + 1;
  try {
    signerHealth.timeout({ startedAt: hiddenStart });
    assert.equal(signerHealth.get().state, "ok", "request started while hidden");
  } finally {
    Date.now = realNow;
  }
  signerHealth.reset();
});

test("answers: revoked/unauthorized => unresponsive(revoked); a user 'no' counts as alive", () => {
  signerHealth.reset();
  signerHealth.error("User rejected the request");
  assert.equal(signerHealth.get().state, "ok");
  signerHealth.error("unauthorized: session revoked");
  assert.deepEqual([signerHealth.get().state, signerHealth.get().reason], ["unresponsive", "revoked"]);
  for (const m of ["not connected", "No such session", "unknown client", "Session expired"]) assert.equal(isRevokedAnswer(m), true, m);
  for (const m of ["user denied", "rejected by user", "invalid event kind", ""]) assert.equal(isRevokedAnswer(m), false, m);
});

test("escalation, probe failure, reconnecting and no-session", () => {
  signerHealth.reset();
  assert.ok(ESCALATE_WAIT_MS >= 10_000);
  const realNow = Date.now;
  Date.now = () => realNow() + BANNER_SILENCE_MS + RETURN_GRACE_MS + 1;
  try {
    signerHealth.setSignerKind("nip46");
    signerHealth.escalate(); // NIP-46: a long wait alone never escalates (pending counts background/abandoned work)
    assert.equal(signerHealth.get().state, "ok");
    signerHealth.setSignerKind("nip07");
    signerHealth.escalate();
    assert.deepEqual([signerHealth.get().state, signerHealth.get().reason], ["unresponsive", "long-wait"]);
  } finally {
    Date.now = realNow;
    signerHealth.setSignerKind(null);
  }
  signerHealth.reset();
  signerHealth.reconnecting(true);
  assert.equal(signerHealth.get().state, "reconnecting");
  signerHealth.reconnecting(false);
  assert.equal(signerHealth.get().state, "ok");
  signerHealth.probeFailed();
  signerHealth.reconnecting(true);
  signerHealth.reconnecting(false);
  assert.equal(signerHealth.get().state, "unresponsive");
  signerHealth.noSession();
  assert.equal(signerHealth.get().state, "no-session");
  assert.equal(signerHealth.blocksBackground(), true);
  let n = 0;
  const off = signerHealth.subscribe(() => n++);
  signerHealth.success();
  signerHealth.success(); // no change, no event
  off();
  assert.equal(n, 1);
});

test("background timeouts never escalate; hidden page pauses counting and resume starts clean", () => {
  signerHealth.reset();
  for (let i = 0; i < 10; i++) signerHealth.timeout({ background: true });
  assert.equal(signerHealth.get().state, "slow");
  signerHealth.reset();
  signerHealth.setVisible(false);
  for (let i = 0; i < 10; i++) signerHealth.timeout();
  assert.equal(signerHealth.get().state, "ok");
  signerHealth.timeout();
  signerHealth.setVisible(true);
  assert.equal(signerHealth.get().state, "ok");
  signerHealth.error("unauthorized: session revoked");
  signerHealth.setVisible(false);
  signerHealth.setVisible(true);
  assert.equal(signerHealth.get().reason, "revoked");
  signerHealth.reset();
});
