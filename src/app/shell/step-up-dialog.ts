import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { ApplicationStore, STEP_UP_RESEND_MS } from '../core/application.store';
import { clock } from '../core/format';
import { FormError } from '../shared/form-error';
import { Icon } from '../shared/icon';
import { OtpInput } from '../shared/otp-input';

/**
 * The second-factor ("step-up") dialog, rendered once by the app shell. It opens when the API
 * refuses an action with `step_up_required` (`ApplicationStore.withSecondFactor`), asks for the six
 * digits e-mailed to the founder, and closes by itself once they are accepted; the store then
 * repeats the action. Closing it (Vazgeç, Esc, a click outside) ends the action.
 *
 * No code is shown, prefilled or hinted here. In mock mode the dialog opens only from `/screens`,
 * and the mock's code arrives as an Inbox e-mail like its other codes.
 *
 * The look of `ConfirmDialog` (band of dots, medallion), no shadows; built as a fixed overlay like
 * `EdevletDialog` (see the styles for why).
 */
@Component({
  selector: 'app-step-up-dialog',
  imports: [FormError, Icon, OtpInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.stepUp(); as s) {
      <div class="layer" [class.out]="closing()" (keydown.escape)="escape($event)">
        <div class="scrim" (click)="close()"></div>
        <form role="dialog" aria-modal="true" aria-labelledby="su-title" aria-describedby="su-msg" class="card" (submit)="$event.preventDefault(); verify()">
          <div class="band" aria-hidden="true"></div>
          <span class="medal" aria-hidden="true"><app-icon name="mail" size="28px" [stroke]="2.1" /></span>
          <h2 id="su-title">E-posta adresinize gönderilen kodu giriniz</h2>
          <p id="su-msg">{{ s.sentAt === null && s.working ? 'Bu işlem için ek doğrulama gerekir. Kodunuz gönderiliyor…' : 'Bu işlem için ek doğrulama gerekir. E-posta adresinize 6 haneli bir kod gönderdik.' }}</p>
          <div class="otp"><app-otp-input #otp [(value)]="code" (complete)="verify($event)" /></div>
          @if (s.error) {<div class="err"><app-form-error [message]="s.error" /></div>}
          <div class="resend">
            @if (cooldown() > 0) {
              <span>Yeni kodu {{ cooldownLabel() }} sonra isteyebilirsiniz.</span>
            } @else {
              <button type="button" class="link" (click)="resend()" [disabled]="s.working">Kodu yeniden gönder</button>
            }
          </div>
          <div class="actions">
            <button type="button" class="cancel" (click)="close()">Vazgeç</button>
            <button type="submit" class="ok" [disabled]="s.working">{{ checking() ? 'Doğrulanıyor…' : 'Doğrula ve devam et' }}</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: `
    /* Fixed overlay like EdevletDialog, not a modal <dialog>: the top layer would cover the mock's Inbox
       toasts (z-index 950), where the demo code arrives. */
    .layer {
      --tone: #061262; --soft: #EFF4FF; --dot: rgba(6, 18, 98, .28); --line: #C7D5F7;
      position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; padding: 16px;
      font-family: 'IBM Plex Sans', system-ui, sans-serif; animation: su-fade .22s ease both;
    }
    :host-context(html.theme-dark) .layer { --soft: rgba(120, 150, 255, .1); --dot: rgba(169, 188, 255, .3); --line: rgba(169, 188, 255, .3); --tone: #3B5BDB; }
    .scrim { position: absolute; inset: 0; background: rgba(4, 8, 40, .55); backdrop-filter: blur(6px) saturate(1.1); }
    .layer > .card { width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; box-sizing: border-box; animation: su-in .38s cubic-bezier(.2, .85, .25, 1.12) both; }
    .layer.out { animation: su-fade .15s ease reverse both; }
    .card {
      position: relative; display: flex; flex-direction: column; align-items: center; text-align: center;
      padding: 0 26px 24px; border: 1px solid var(--bd-E5E7EB); border-radius: 22px; background: var(--bg-FFFFFF); overflow: hidden;
    }
    .band { position: absolute; inset: 0 0 auto; height: 86px; background: var(--soft); border-bottom: 1px solid var(--line); }
    .band::before {
      content: ''; position: absolute; inset: 0;
      background: radial-gradient(circle, var(--dot) 1.15px, transparent 1.7px) 0 0 / 11px 11px;
      mask-image: radial-gradient(70% 120% at 50% 100%, #000 25%, transparent 80%);
    }
    .medal {
      position: relative; z-index: 1; margin-top: 46px; width: 72px; height: 72px; box-sizing: border-box; display: grid; place-items: center;
      border: 6px solid var(--bg-FFFFFF); border-radius: 50%; background: var(--tone); color: #fff;
    }
    h2 { margin: 14px 0 0; font: 600 19px/26px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); text-wrap: balance; }
    p { margin: 8px 0 0; font: 400 14px/21px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); text-wrap: pretty; }
    .otp { align-self: stretch; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-top: 18px; }
    .err { align-self: stretch; margin-top: 12px; text-align: left; }
    .resend { margin-top: 12px; min-height: 20px; font: 400 13px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .link { border: 0; background: none; padding: 0; font: 600 13px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .link:disabled { opacity: .5; cursor: progress; }
    .actions { align-self: stretch; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    .actions button { flex: 1 1 140px; height: 46px; padding: 0 16px; border-radius: 12px; font: 600 14px/18px 'IBM Plex Sans', sans-serif; cursor: pointer; }
    .actions button:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
    .cancel { border: 1px solid var(--bd-D6DEEE); background: var(--bg-FFFFFF); color: var(--fg-061262); }
    .ok { border: 0; background: var(--tone); color: #fff; }
    .ok:disabled { opacity: .6; cursor: progress; }
    @keyframes su-in { from { opacity: 0; transform: translateY(18px) scale(.95); } }
    @keyframes su-fade { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .layer, .layer.out, .layer > .card { animation: none; } }
  `,
})
export class StepUpDialog {
  protected readonly store = inject(ApplicationStore);
  protected readonly code = signal('');
  protected readonly closing = signal(false);
  private readonly otp = viewChild<OtpInput>('otp');

  /** Time left before another code may be asked for (the server sends none within 60 s of the last). */
  protected readonly cooldown = computed(() => {
    const sentAt = this.store.stepUp()?.sentAt;
    return sentAt == null ? 0 : Math.max(0, sentAt + STEP_UP_RESEND_MS - this.store.now());
  });
  protected readonly cooldownLabel = computed(() => clock(this.cooldown()));
  /** A code is being checked (not sent): what the confirming button says. */
  protected readonly checking = signal(false);

  constructor() {
    // Each time the dialog opens: empty boxes, focus on the first one.
    let wasOpen = false;
    afterRenderEffect(() => {
      const open = !!this.store.stepUp();
      if (open && !wasOpen) {
        this.code.set('');
        this.otp()?.focus();
      }
      wasOpen = open;
    });
    // The question belongs to the page it was asked on, as with ConfirmDialog.
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((e) => {
        if (e instanceof NavigationStart && this.store.stepUp()) this.close();
      });
  }

  protected async verify(code = this.code()) {
    if (this.store.stepUp()?.working) return;
    this.checking.set(true);
    await this.store.verifyStepUpCode(code);
    this.checking.set(false);
    // Refused: empty boxes for the next try. Typing over full boxes would make the input report a
    // "complete" code after the first digit and check a mix of old and new digits (found in the E2E walk).
    if (this.store.stepUp()?.error) {
      this.code.set('');
      this.otp()?.focus();
    }
  }

  protected resend() {
    this.code.set('');
    void this.store.sendStepUpCode();
  }

  /** The closing motion, then the answer: the refused action ends. A timer, so a hidden tab still closes. */
  protected close() {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => {
      this.closing.set(false);
      this.store.cancelStepUp();
    }, 150);
  }

  /** Esc closes here and goes no further, so it does not also close a panel behind the dialog. */
  protected escape(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    this.close();
  }
}
