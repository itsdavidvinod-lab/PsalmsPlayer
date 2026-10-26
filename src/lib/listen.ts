// Counts how long a song has really been playing, so listener numbers reflect listening and not page opens.
// No dependencies. The clock is passed in so the rules can be tested without waiting.
//
// Rules: time only counts while the player is playing AND audible (not muted, volume above zero). A single step is
// capped, so a laptop that sleeps for hours does not turn into hours of listening. The server applies its own,
// stricter limits and is the final judge; this class only avoids reporting time that clearly was not listening.

export const MAX_STEP_MS = 120_000;

export class ListenMeter {
  private counting = false;
  private last = 0;
  private pendingMs = 0;

  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** Tell the meter whether the song is playing and audible right now. Safe to call as often as you like. */
  set(counting: boolean): void {
    this.accumulate();
    if (counting && !this.counting) this.last = this.now();
    this.counting = counting;
  }

  /** Whole seconds counted since the last call. The remainder stays for next time. */
  take(): number {
    this.accumulate();
    const whole = Math.floor(this.pendingMs / 1000);
    this.pendingMs -= whole * 1000;
    return whole;
  }

  private accumulate(): void {
    if (!this.counting) return;
    const t = this.now();
    this.pendingMs += Math.min(Math.max(0, t - this.last), MAX_STEP_MS);
    this.last = t;
  }
}
