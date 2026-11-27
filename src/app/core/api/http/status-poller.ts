/**
 * How often to ask the server while it works on something: often at first, when the deck reader
 * usually answers, then less, because a check done by people can take hours.
 * Every 2 s for the first 30 s, every 5 s until 5 minutes, then every 15 s.
 */
export function pollDelay(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 2_000;
  if (elapsedMs < 5 * 60_000) return 5_000;
  return 15_000;
}

/** The part of `document` the poller needs; a stand-in in tests. */
export interface PageVisibility {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Runs `tick` again and again at `pollDelay` pace while started. No timers run while the tab is
 * hidden; when it becomes visible again `tick` runs at once. One tick at a time: the next delay
 * starts when a tick has finished. The pace starts over on each `start`.
 *
 * It only schedules. What a tick does (read the status, read the application if it changed) and
 * what an error means (signed out, so stop) are the caller's (ApplicationStore); an error a tick
 * lets through is ignored here and the next tick runs as planned.
 */
export class StatusPoller {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private startedAt = 0;
  private running = false;
  private ticking = false;

  constructor(
    private readonly tick: () => Promise<void>,
    private readonly page: PageVisibility | null = typeof document === 'undefined' ? null : document,
    private readonly now: () => number = () => Date.now(),
    /** The wait before each tick, from the time since `start`; the phone page passes a fixed, slower one. */
    private readonly delay: (elapsedMs: number) => number = pollDelay,
  ) {}

  get active() {
    return this.running;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.now();
    this.page?.addEventListener('visibilitychange', this.onVisibility);
    this.schedule();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.page?.removeEventListener('visibilitychange', this.onVisibility);
  }

  private hidden() {
    return this.page?.visibilityState === 'hidden';
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.running || this.hidden()) return;
    this.timer = setTimeout(() => void this.run(), this.delay(this.now() - this.startedAt));
  }

  private async run() {
    if (!this.running || this.ticking) return;
    this.ticking = true;
    try {
      await this.tick();
    } catch {
      // The caller reports its own errors; polling simply goes on.
    } finally {
      this.ticking = false;
      this.schedule();
    }
  }

  private readonly onVisibility = () => {
    if (this.hidden()) {
      clearTimeout(this.timer);
      this.timer = undefined;
    } else {
      void this.run();
    }
  };
}
