import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../shared/icon';
import { Inbox } from '../core/inbox';

/**
 * Simulated e-mail / SMS notifications (top-right), styled like the 3-D Secure SMS in the design.
 * Each closes itself after a few seconds (longer when it carries a code); hovering pauses the
 * countdown, which the bar along the bottom shows.
 */
@Component({
  selector: 'app-inbox-toasts',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (m of mails(); track m.id) {
        <div class="toast" role="status" [class.leaving]="leaving().has(m.id)">
          <span class="icon" [class.sms]="m.kind === 'sms'"><app-icon [name]="m.kind === 'sms' ? 'sms' : 'mail'" size="16px" /></span>
          <div class="body">
            <div class="top">
              <span class="from">{{ m.kind === 'sms' ? m.from : m.title }}</span>
              <span class="when">{{ m.kind === 'sms' ? 'SMS' : 'E-posta' }} · şimdi</span>
            </div>
            <p>{{ m.body }}</p>
            @if (m.code) {
              <button type="button" class="code" (click)="copy(m.code)" title="Kopyala">{{ m.code }} <app-icon name="copy" size="13px" /></button>
            }
          </div>
          <button type="button" class="x" aria-label="Kapat" (click)="close(m.id)"><app-icon name="x" size="15px" /></button>
          <span class="timer" aria-hidden="true" [style.animation-duration.ms]="m.code ? CODE_MS : MS" (animationend)="close(m.id)"></span>
        </div>
      }
    </div>
  `,
  styles: `
    .stack { position: fixed; top: 76px; right: 20px; z-index: 950; display: flex; flex-direction: column; gap: 10px; width: 340px; pointer-events: none; }
    .toast { position: relative; overflow: hidden; pointer-events: auto; display: flex; gap: 10px; align-items: flex-start; padding: 12px 12px 12px 14px; background: var(--bg-FFFFFF); border: 1px solid var(--bd-E5E7EB); border-radius: 14px; box-shadow: 0 16px 40px -16px rgba(6,18,98, .35); font-family: 'IBM Plex Sans', system-ui, sans-serif; animation: toastIn .25s cubic-bezier(.2, .8, .2, 1) both; }
    .icon { width: 30px; height: 30px; flex: none; border-radius: 8px; background: var(--bg-EFF4FF); color: var(--fg-061262); display: grid; place-items: center; font: 700 13px/1 'IBM Plex Sans', sans-serif; }
    .icon.sms { background: var(--bg-15803D); color: var(--fg-FFFFFF); font-size: 9px; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .top { display: flex; justify-content: space-between; gap: 8px; }
    .from { font: 600 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .when { font: 400 11.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-8A93A6); white-space: nowrap; }
    p { margin: 0; font: 400 12.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); text-wrap: pretty; }
    .code { align-self: flex-start; border: 1px dashed var(--bd-C7D5F7); background: var(--bg-F7F9FE); border-radius: 6px; padding: 2px 8px; font: 600 15px/22px 'IBM Plex Mono', monospace; letter-spacing: .12em; color: var(--fg-061262); cursor: copy; }
    .x { border: 0; background: none; color: var(--fg-8A93A6); font: 400 18px/1 'IBM Plex Sans', sans-serif; cursor: pointer; padding: 0 2px; }
    .timer { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--bg-061262); opacity: .35; transform-origin: left; animation: countdown linear forwards; }
    .toast:hover .timer, .toast:focus-within .timer { animation-play-state: paused; }
    .toast.leaving { animation: toastOut .2s ease forwards; }
    @keyframes toastIn { from { opacity: 0; transform: translateY(-6px); } }
    @keyframes toastOut { to { opacity: 0; transform: translateX(16px); } }
    @keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  `,
})
export class InboxToasts {
  protected readonly inbox = inject(Inbox);
  /** Bank SMS codes are shown inside the 3-D Secure screen itself (as in the design). */
  protected readonly mails = computed(() => this.inbox.messages().filter((m) => m.kind === 'mail'));
  protected readonly MS = 6_000;
  /** Messages with a verification code stay longer so the code can be read and copied. */
  protected readonly CODE_MS = 15_000;
  protected readonly leaving = signal(new Set<number>());

  /** Plays the exit animation, then removes the message. */
  protected close(id: number) {
    if (this.leaving().has(id)) return;
    this.leaving.update((s) => new Set(s).add(id));
    setTimeout(() => {
      this.inbox.dismiss(id);
      this.leaving.update((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, 200);
  }

  protected copy(code: string) {
    void navigator.clipboard?.writeText(code);
  }
}
