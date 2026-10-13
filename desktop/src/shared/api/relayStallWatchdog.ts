/**
 * Passive liveness watchdog for the relay WebSocket.
 *
 * This intentionally does not write to the socket. tauri-plugin-websocket
 * 2.4.2 holds a global connection-manager mutex while awaiting `send()`, so a
 * watchdog probe sent into a half-open TCP path can block future reconnects
 * from registering. Instead we rely on inbound relay traffic (including the
 * relay's heartbeat pings) as the liveness signal.
 */
export type RelayStallWatchdogConfig = {
  intervalMs: number;
  idleTimeoutMs: number;
  /** Optional active probe (web only: browsers never surface the relay's WS ping frames to JS, so a quiet but healthy
   *  socket looks idle). Called once the socket has been quiet for half the idle timeout; any reply counts as inbound. */
  probe?: () => void;
  /** Called once when a stall is detected. The watchdog stops itself first. */
  onStall: (error: Error) => void;
  /** Optional override for tests. */
  now?: () => number;
};

export class RelayStallWatchdog {
  private readonly intervalMs: number;
  private readonly idleTimeoutMs: number;
  private readonly onStall: (error: Error) => void;
  private readonly now: () => number;

  private intervalHandle: number | null = null;
  private lastInboundAt = 0;
  private lastCheckAt = 0;
  private probedAt = 0;
  private readonly probe?: () => void;

  constructor(config: RelayStallWatchdogConfig) {
    this.intervalMs = config.intervalMs;
    this.idleTimeoutMs = config.idleTimeoutMs;
    this.onStall = config.onStall;
    this.now = config.now ?? (() => Date.now());
    this.probe = config.probe;
  }

  /** Idempotent. Safe to call from `connect()` completion. */
  start(): void {
    this.lastInboundAt = this.now();
    if (this.intervalHandle !== null) {
      return;
    }
    this.intervalHandle = window.setInterval(
      () => this.checkIdle(),
      this.intervalMs,
    );
  }

  /** Idempotent. Clears the passive idle check interval. */
  stop(): void {
    if (this.intervalHandle !== null) {
      window.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.lastInboundAt = 0;
  }

  /** Record any inbound WS frame as proof the socket is still alive. */
  recordInbound(): void {
    if (this.intervalHandle === null) {
      return;
    }
    this.lastInboundAt = this.now();
  }

  private checkIdle(): void {
    const now = this.now();
    const sinceCheck = this.lastCheckAt ? now - this.lastCheckAt : 0;
    this.lastCheckAt = now;
    if (this.lastInboundAt === 0) {
      this.lastInboundAt = now;
      return;
    }
    // The page was suspended (iOS background/lock freezes timers): the quiet time is ours, not the relay's. Give the
    // socket a fresh window (and a probe) instead of declaring a stall the moment timers resume.
    if (sinceCheck > this.intervalMs * 3 || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
      this.lastInboundAt = now;
      this.probedAt = 0;
      if (sinceCheck > this.intervalMs * 3) this.probe?.();
      return;
    }
    if (this.probe && now - this.lastInboundAt >= this.idleTimeoutMs / 2 && this.probedAt < this.lastInboundAt) {
      this.probedAt = now;
      this.probe();
    }

    if (now - this.lastInboundAt < this.idleTimeoutMs) {
      return;
    }

    this.stop();
    this.onStall(new Error("Relay socket stalled — no inbound frames."));
  }
}
