import { PageVisibility, pollDelay, StatusPoller } from './status-poller';

/** A page whose visibility the test switches. */
class FakePage implements PageVisibility {
  visibilityState: DocumentVisibilityState = 'visible';
  private listeners = new Set<() => void>();
  addEventListener(_: 'visibilitychange', listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_: 'visibilitychange', listener: () => void) {
    this.listeners.delete(listener);
  }
  set(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.listeners.forEach((l) => l());
  }
  get listening() {
    return this.listeners.size;
  }
}

describe('StatusPoller', () => {
  let page: FakePage;
  let ticks: number;
  let poller: StatusPoller;

  beforeEach(() => {
    vi.useFakeTimers();
    page = new FakePage();
    ticks = 0;
    poller = new StatusPoller(async () => void ticks++, page, () => Date.now());
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
  });

  it('paces itself: every 2 s for 30 s, every 5 s until 5 minutes, then every 15 s', () => {
    expect([0, 29_999, 30_000, 299_999, 300_000, 3_600_000].map(pollDelay)).toEqual([2_000, 2_000, 5_000, 5_000, 15_000, 15_000]);
  });

  it('ticks at that pace once started, and not before', async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ticks).toBe(0);
    poller.start();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(ticks).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(ticks).toBe(1);
    await vi.advanceTimersByTimeAsync(28_000); // 30 s since the start: 15 ticks at 2 s
    expect(ticks).toBe(15);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(ticks).toBe(16);
    await vi.advanceTimersByTimeAsync(270_000 - 5_000); // to 5 minutes: 2-second ticks are over
    const atFive = ticks;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(ticks - atFive).toBeLessThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ticks - atFive).toBeLessThanOrEqual(6);
  });

  it('stops, and starts again with the fast pace', async () => {
    poller.start();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(ticks).toBe(2);
    poller.stop();
    expect(poller.active).toBe(false);
    expect(page.listening).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ticks).toBe(2);
    poller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ticks).toBe(3);
  });

  it('pauses while the tab is hidden and ticks at once when it is shown again', async () => {
    poller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ticks).toBe(1);
    page.set('hidden');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ticks).toBe(1);
    page.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(ticks).toBe(2);
    // The pace counts from the start, not from the return: 2 minutes in, every 5 s.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(ticks).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(ticks).toBe(3);
  });

  it('keeps going after a failed tick, and never runs two ticks at once', async () => {
    let running = 0;
    let most = 0;
    let calls = 0;
    poller = new StatusPoller(async () => {
      calls++;
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      running--;
      if (calls === 1) throw new Error('network');
    }, page);
    poller.start();
    await vi.advanceTimersByTimeAsync(2_000); // first tick starts, takes 3 s
    page.set('hidden');
    page.set('visible'); // asks for a tick while one runs: ignored
    await vi.advanceTimersByTimeAsync(3_000 + 2_000 + 3_000);
    expect(calls).toBe(2);
    expect(most).toBe(1);
  });
});
