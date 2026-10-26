// Turns "is the song playing and audible right now?" (asked about once a second) into reports for record_listen().
// One reporter per song being played. The server is the final judge of how much time counts; this class only makes sure the
// site never reports time that was clearly not listening, and never reports time without a session.
//
//   * A session is opened at the first moment of play. Opening a session credits nothing.
//   * Heard time is reported every 15 seconds while playing, and straight away when playing stops (pause, mute, buffering, end).
//   * Reports go out one at a time, in order. A report that fails is dropped: the number must never come out too high.

import { ListenMeter } from './listen.ts';

export const BEAT_MS = 15_000;

/** Calls record_listen. Resolves to the session id the server answered with, or null when there was none (error, offline). */
export type ListenRpc = (sessionId: string | null, songId: string, seconds: number) => Promise<string | null>;

export class ListenReporter {
  private readonly songId: string;
  private readonly rpc: ListenRpc;
  private readonly clock: () => number;
  private readonly meter: ListenMeter;
  private sessionId: string | null = null;
  private creating = false;
  private wasCounting = false;
  private lastBeat: number;
  private chain: Promise<void> = Promise.resolve();

  constructor(songId: string, rpc: ListenRpc, clock: () => number = () => Date.now()) {
    this.songId = songId;
    this.rpc = rpc;
    this.clock = clock;
    this.meter = new ListenMeter(clock);
    this.lastBeat = clock();
  }

  /** Call about once a second. `counting` is true only while the song is playing, audible and actually advancing. */
  tick(counting: boolean): void {
    if (counting && !this.wasCounting) {
      this.ensureSession();
      this.lastBeat = this.clock();
    }
    this.meter.set(counting);
    const stopped = this.wasCounting && !counting;
    this.wasCounting = counting;
    if (stopped || (counting && this.clock() - this.lastBeat >= BEAT_MS)) this.flush();
  }

  /** Stop counting and report what was heard. Resolves when everything queued so far has been sent. */
  end(): Promise<void> {
    this.meter.set(false);
    this.wasCounting = false;
    this.flush();
    return this.chain;
  }

  /** Resolves when every report queued so far has finished (used by tests). */
  settled(): Promise<void> {
    return this.chain;
  }

  private flush(): void {
    this.lastBeat = this.clock();
    this.report(this.meter.take());
  }

  private ensureSession(): void {
    if (this.sessionId || this.creating) return;
    this.creating = true;
    this.chain = this.chain.then(async () => {
      try {
        this.sessionId = await this.rpc(null, this.songId, 0);
      } catch {
        // Offline or signed out: nothing to report.
      } finally {
        this.creating = false;
      }
    });
  }

  private report(seconds: number): void {
    if (seconds <= 0) return;
    this.chain = this.chain.then(async () => {
      try {
        if (!this.sessionId) {
          this.sessionId = await this.rpc(null, this.songId, 0); // the session was lost: open one, credit nothing for this batch
          return;
        }
        await this.rpc(this.sessionId, this.songId, seconds);
      } catch {
        // Dropped on purpose.
      }
    });
  }
}
