import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { Confirm, ConfirmOptions } from '@core/services/confirm';
import { Icon } from '@ui/icon';

/**
 * The portal's confirmation dialog (see `Confirm`), rendered once by the app shell.
 * A native `<dialog>` opened with `showModal()`, so the page behind is inert, focus stays inside
 * and the browser restores focus when it closes. Esc and a click outside cancel. For a `danger`
 * question focus starts on the cancel button, so Enter never confirms by accident.
 *
 * Look: a tone-coloured band of dots (the portal's dot-engraving motif) with a medallion on its
 * edge that rings once when the dialog opens. No shadows, by the owner's rule.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg [attr.data-tone]="confirm.current()?.tone ?? 'info'" [class.out]="closing()" aria-labelledby="cd-title" aria-describedby="cd-msg"
      (click)="clicked($event)" (keydown.escape)="escape($event)" (cancel)="$event.preventDefault(); close(false)">
      @if (confirm.current(); as o) {
        <div class="card">
          <div class="band" aria-hidden="true"></div>
          <span class="medal" aria-hidden="true"><i></i><i></i><app-icon [name]="icon(o)" size="28px" [stroke]="2.1" /></span>
          <h2 id="cd-title">{{ o.title }}</h2>
          <p id="cd-msg">{{ o.message }}</p>
          @if (o.details; as d) {
            <div class="details">
              <b>{{ d.label }}</b>
              <ul>
                @for (it of d.items; track it) {<li><app-icon [name]="o.tone === 'danger' ? 'x' : 'check'" size="13px" [stroke]="2.6" />{{ it }}</li>}
              </ul>
            </div>
          }
          <div class="actions">
            <button #cancelBtn type="button" class="cancel" (click)="close(false)">{{ o.cancel ?? 'Vazgeç' }}</button>
            <button #okBtn type="button" class="ok" (click)="close(true)">{{ o.confirm }}</button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog {
      --tone: #061262; --ink: #061262; --soft: #EFF4FF; --dot: rgba(6, 18, 98, .28); --line: #C7D5F7;
      width: min(420px, calc(100vw - 32px)); max-width: none; max-height: calc(100dvh - 32px);
      padding: 0; border: 0; background: transparent; color: inherit; overflow: visible;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
    dialog[data-tone='danger'] { --tone: #D92D20; --ink: #B42318; --soft: #FEF3F2; --dot: rgba(217, 45, 32, .32); --line: #FECDCA; }
    dialog[data-tone='warn'] { --tone: #B45309; --ink: #78350F; --soft: #FFFBEB; --dot: rgba(180, 83, 9, .32); --line: #FDE68A; }
    :host-context(html.theme-dark) dialog { --ink: #A9BCFF; --soft: rgba(120, 150, 255, .1); --dot: rgba(169, 188, 255, .3); --line: rgba(169, 188, 255, .3); --tone: #3B5BDB; }
    :host-context(html.theme-dark) dialog[data-tone='danger'] { --tone: #D92D20; --ink: #FDA29B; --soft: rgba(217, 45, 32, .14); --dot: rgba(253, 162, 155, .32); --line: rgba(253, 162, 155, .3); }
    :host-context(html.theme-dark) dialog[data-tone='warn'] { --tone: #B45309; --ink: #FCD34D; --soft: rgba(180, 83, 9, .16); --dot: rgba(252, 211, 77, .3); --line: rgba(252, 211, 77, .3); }

    dialog::backdrop { background: rgba(4, 8, 40, .55); backdrop-filter: blur(6px) saturate(1.1); }
    dialog[open] { animation: cd-in .38s cubic-bezier(.2, .85, .25, 1.12) both; }
    dialog[open]::backdrop { animation: cd-fade .22s ease both; }
    dialog.out { animation: cd-out .15s ease-in both; }
    dialog.out::backdrop { animation: cd-fade .15s ease reverse both; }

    .card {
      position: relative; display: flex; flex-direction: column; align-items: center; text-align: center;
      padding: 0 26px 24px; border: 1px solid var(--bd-E5E7EB); border-radius: 22px; background: var(--bg-FFFFFF); overflow: hidden;
    }
    /* Dots thickest under the medallion and fading out towards the top corners. */
    .band { position: absolute; inset: 0 0 auto; height: 86px; background: var(--soft); border-bottom: 1px solid var(--line); }
    .band::before {
      content: ''; position: absolute; inset: 0;
      background: radial-gradient(circle, var(--dot) 1.15px, transparent 1.7px) 0 0 / 11px 11px;
      mask-image: radial-gradient(70% 120% at 50% 100%, #000 25%, transparent 80%);
    }
    .medal {
      position: relative; z-index: 1; margin-top: 46px; width: 72px; height: 72px; box-sizing: border-box; display: grid; place-items: center;
      border: 6px solid var(--bg-FFFFFF); border-radius: 50%; background: var(--tone); color: #fff;
      animation: cd-pop .55s cubic-bezier(.3, 1.5, .5, 1) .06s both;
    }
    .medal i { position: absolute; inset: -6px; border: 2px solid var(--tone); border-radius: 50%; opacity: 0; animation: cd-ring 1.3s ease-out .28s 2 both; }
    .medal i + i { animation-delay: .62s; }

    h2 { margin: 14px 0 0; font: 600 19px/26px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); text-wrap: balance; animation: cd-up .4s ease .08s both; }
    p { margin: 8px 0 0; font: 400 14px/21px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); text-wrap: pretty; animation: cd-up .4s ease .12s both; }

    .details {
      align-self: stretch; margin-top: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; text-align: left;
      border: 1px solid var(--line); border-radius: 14px; background: var(--soft); animation: cd-up .4s ease .16s both;
    }
    .details b { font: 600 12.5px/16px 'IBM Plex Sans', sans-serif; color: var(--ink); }
    .details ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .details li { display: flex; align-items: center; gap: 9px; font: 500 13.5px/19px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    .details li app-icon { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: var(--bg-FFFFFF); color: var(--ink); }

    .actions { align-self: stretch; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; animation: cd-up .4s ease .2s both; }
    .actions button {
      flex: 1 1 140px; height: 46px; padding: 0 16px; border-radius: 12px; font: 600 14px/18px 'IBM Plex Sans', sans-serif; cursor: pointer;
      transition: background-color .15s, border-color .15s, filter .15s, transform .1s;
    }
    .actions button:active { transform: scale(.98); }
    .actions button:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
    .cancel { border: 1px solid var(--bd-D6DEEE); background: var(--bg-FFFFFF); color: var(--fg-061262); }
    .cancel:hover { background: var(--bg-F7F9FE); border-color: var(--bd-5B6478); }
    .ok { border: 0; background: var(--tone); color: #fff; }
    .ok:hover { filter: brightness(.9); }

    @keyframes cd-in { from { opacity: 0; transform: translateY(18px) scale(.95); } }
    @keyframes cd-out { to { opacity: 0; transform: translateY(8px) scale(.97); } }
    @keyframes cd-fade { from { opacity: 0; } }
    @keyframes cd-up { from { opacity: 0; transform: translateY(6px); } }
    @keyframes cd-pop { from { opacity: 0; transform: scale(.3) rotate(-30deg); } }
    @keyframes cd-ring { from { opacity: .55; transform: scale(1); } to { opacity: 0; transform: scale(1.75); } }

    @media (prefers-reduced-motion: reduce) {
      dialog[open], dialog[open]::backdrop, dialog.out, dialog.out::backdrop, .medal, h2, p, .details, .actions { animation: none; }
      .medal i { display: none; }
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(Confirm);
  protected readonly closing = signal(false);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly cancelBtn = viewChild<ElementRef<HTMLButtonElement>>('cancelBtn');
  private readonly okBtn = viewChild<ElementRef<HTMLButtonElement>>('okBtn');

  constructor() {
    // Open once the question is on the page; start focus on the safe button for a danger question.
    afterRenderEffect(() => {
      const o = this.confirm.current();
      const d = this.dlg().nativeElement;
      if (!o || d.open) return;
      d.showModal();
      (o.tone === 'danger' ? this.cancelBtn() : this.okBtn())?.nativeElement.focus();
    });
    // A question belongs to the page it was asked on. If the page moves on underneath it (a timed
    // step finishing, say the video call ending by itself), the question is cancelled.
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((e) => {
        if (e instanceof NavigationStart && this.confirm.current()) this.close(false);
      });
  }

  protected icon(o: ConfirmOptions) {
    return o.icon ?? (o.tone === 'info' || !o.tone ? 'info' : 'alert');
  }

  /** The closing motion, then the answer. A timer, not animationend, so a hidden tab still closes. */
  protected close(ok: boolean) {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => {
      this.dlg().nativeElement.close();
      this.closing.set(false);
      this.confirm.answer(ok);
    }, 150);
  }

  /** A click on the backdrop lands on the <dialog> itself (the card fills it). Clicks never reach
   *  the page's outside-click handlers, so a menu behind the dialog stays open. */
  protected clicked(e: MouseEvent) {
    e.stopPropagation();
    if (e.target === this.dlg().nativeElement) this.close(false);
  }

  /** Esc cancels here and goes no further, so it does not also close a panel behind the dialog. */
  protected escape(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    this.close(false);
  }
}
