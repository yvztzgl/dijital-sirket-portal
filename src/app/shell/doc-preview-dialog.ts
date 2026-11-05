import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ApplicationStore } from '../core/application.store';
import { DocPreview } from '../core/doc-preview';
import { saveBytes } from '../core/files';
import { dateTime } from '../core/format';
import { DocItem } from '../core/models';
import { Icon } from '../shared/icon';

/**
 * In-app preview of an application document: the page as it will be issued, with paging through
 * the other documents, download and close. Esc closes, ←/→ move between documents.
 */
@Component({
  selector: 'app-doc-preview-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'key($event)' },
  template: `
    @if (view(); as v) {
      <div class="scrim" (click)="close()"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dp-title">
        <header class="bar">
          <svg width="26" height="32" viewBox="0 0 30 36" aria-hidden="true" class="file">
            <path d="M5 1.5h13.5L27.5 10.5V32a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 32V4A2.5 2.5 0 0 1 5 1.5z" style="fill:var(--bg-FFFFFF);stroke:var(--bd-D6DEEE)" stroke-width="1.2"></path>
            <path d="M18.5 1.5V8a2.5 2.5 0 0 0 2.5 2.5h6.5" fill="none" style="stroke:var(--bd-D6DEEE)" stroke-width="1.2"></path>
            <rect x="0" y="22" width="21" height="10" rx="2" style="fill:var(--bg-D92D20)"></rect>
            <text x="10.5" y="29.4" text-anchor="middle" style="fill:var(--bg-FFFFFF);font:700 6.6px 'IBM Plex Sans',sans-serif">PDF</text>
          </svg>
          <div class="names">
            <span id="dp-title" class="name">{{ v.doc.name }}.pdf</span>
            <span class="meta">{{ v.doc.group }} · {{ v.doc.sizeKb }} KB · e-imzalı</span>
          </div>
          <div class="pager" aria-label="Belgeler arasında gezin">
            <button type="button" class="icon" (click)="step(-1)" [disabled]="!v.hasPrev" aria-label="Önceki belge" title="Önceki (←)"><app-icon name="arrow-left" size="16px" /></button>
            <span class="count">{{ v.index + 1 }} / {{ v.total }}</span>
            <button type="button" class="icon" (click)="step(1)" [disabled]="!v.hasNext" aria-label="Sonraki belge" title="Sonraki (→)"><app-icon name="arrow-right" size="16px" /></button>
          </div>
          <span class="sep" aria-hidden="true"></span>
          <button type="button" class="download" (click)="download()"><app-icon name="download" size="16px" [stroke]="1.9" />İndir</button>
          <button #closeBtn type="button" class="icon" (click)="close()" aria-label="Önizlemeyi kapat" title="Kapat (Esc)"><app-icon name="x" size="18px" /></button>
        </header>

        <div class="stage">
          <!-- Paper stays white in both themes, like the issued PDF. -->
          <article class="paper keep-light" [attr.aria-label]="v.doc.name + ' önizlemesi'">
            <span class="watermark" aria-hidden="true">ÖRNEK</span>
            <div class="doc-head">
              <span class="mono">DŞ</span>
              <span class="org"><b>Dijital Şirket Platformu</b><small>Terminal İstanbul · dijitalsirket.gov.tr</small></span>
              <span class="ref"><small>Başvuru no</small><b>{{ v.appId }}</b></span>
            </div>
            <span class="kicker">{{ v.doc.group }}</span>
            <h2 class="title">{{ v.doc.name }}</h2>
            <dl class="fields">
              @for (f of v.fields; track f[0]) {
                <dt>{{ f[0] }}</dt><dd>{{ f[1] }}</dd>
              }
            </dl>
            <p class="body">
              Bu belge, {{ v.company }} kuruluş başvurusu kapsamında Dijital Şirket Platformu tarafından oluşturulmuş ve
              kurucunun günlük e-imzasıyla imzalanmıştır. İlgili kurumlara elektronik ortamda iletilir; ıslak imza gerekmez.
            </p>
            <p class="body muted">Bu dosya prototipte üretilmiş örnek bir belgedir ve hukuki geçerliliği yoktur.</p>
            <div class="sign">
              <span class="seal" aria-hidden="true"><app-icon name="badge-check" size="22px" [stroke]="1.7" /></span>
              <span class="sign-text">
                <b>Elektronik olarak imzalanmıştır</b>
                <small>{{ v.signer }} · {{ v.signedAt }}</small>
                @if (v.serial) {<small class="serial">Sertifika seri no {{ v.serial }}</small>}
              </span>
            </div>
            <footer class="doc-foot"><span>{{ v.doc.name }}.pdf</span><span>Sayfa 1 / 1</span></footer>
          </article>
        </div>
      </div>
    }
  `,
  styles: `
    :host { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .scrim { position: fixed; inset: 0; z-index: 1100; background: rgba(4, 8, 40, .62); backdrop-filter: blur(3px); animation: fade .16s ease both; }
    .dialog {
      position: fixed; z-index: 1101; inset: 24px; margin: auto; max-width: 980px; display: flex; flex-direction: column;
      background: var(--bg-F4F6FB); border: 1px solid var(--bd-E5E7EB); border-radius: 16px; overflow: hidden;
      box-shadow: 0 30px 80px -30px rgba(4, 8, 40, .7); animation: rise .2s cubic-bezier(.2, .8, .2, 1) both;
    }
    .bar { display: flex; align-items: center; gap: 12px; padding: 12px 14px 12px 18px; background: var(--bg-FFFFFF); border-bottom: 1px solid var(--bd-E5E7EB); }
    .file { flex: none; }
    .names { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .name { font: 600 14.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { font: 400 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pager { display: flex; align-items: center; gap: 2px; }
    .count { min-width: 52px; text-align: center; font: 500 12px/16px 'IBM Plex Mono', monospace; color: var(--fg-5B6478); }
    .sep { width: 1px; height: 24px; background: var(--bd-E5E7EB); }
    .icon {
      width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 9px; background: transparent;
      color: var(--fg-3B4660); cursor: pointer; transition: background .15s, color .15s;
    }
    .icon:hover:not(:disabled) { background: var(--bg-EFF4FF); color: var(--fg-061262); }
    .icon:disabled { opacity: .35; cursor: default; }
    .download {
      display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border: 0; border-radius: 9px;
      background: var(--bg-061262); color: var(--fg-FFFFFF); font: 600 13px/18px 'IBM Plex Sans', sans-serif; cursor: pointer;
    }
    .download:hover { background: var(--bg-0C217E); }
    .stage { flex: 1; min-height: 0; overflow: auto; padding: 28px 24px 36px; display: flex; justify-content: center; }

    .paper {
      position: relative; overflow: hidden; flex: none; width: min(640px, 100%); aspect-ratio: 210 / 297; box-sizing: border-box;
      padding: 44px 48px 36px; display: flex; flex-direction: column; background: var(--bg-FFFFFF); color: var(--fg-1F2A44); border-radius: 4px;
      box-shadow: 0 1px 2px rgba(6, 18, 98, .08), 0 12px 32px -12px rgba(6, 18, 98, .25);
    }
    .watermark {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-28deg); pointer-events: none;
      font: 700 120px/1 'IBM Plex Sans', sans-serif; letter-spacing: .08em; color: rgba(6, 18, 98, .045);
    }
    .doc-head { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 2px solid var(--bd-061262); }
    .mono { width: 34px; height: 34px; flex: none; border-radius: 8px; background: var(--bg-061262); color: var(--fg-FFFFFF); display: grid; place-items: center; font: 700 13px/1 'IBM Plex Sans', sans-serif; }
    .org { flex: 1; display: flex; flex-direction: column; }
    .org b { font: 600 14px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .org small, .ref small { font: 400 11px/15px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .ref { display: flex; flex-direction: column; align-items: flex-end; }
    .ref b { font: 600 12.5px/16px 'IBM Plex Mono', monospace; color: var(--fg-061262); }
    .kicker { margin-top: 30px; font: 600 10.5px/14px 'IBM Plex Sans', sans-serif; letter-spacing: .1em; text-transform: uppercase; color: var(--fg-5B6478); }
    .title { margin: 6px 0 22px; font: 600 26px/32px 'IBM Plex Serif', Georgia, serif; color: var(--fg-061262); }
    .fields { display: grid; grid-template-columns: 150px 1fr; margin: 0; border-top: 1px solid var(--bd-E5E7EB); }
    .fields dt, .fields dd { margin: 0; padding: 9px 0; border-bottom: 1px solid var(--bd-E5E7EB); font: 400 13px/18px 'IBM Plex Sans', sans-serif; }
    .fields dt { color: var(--fg-5B6478); }
    .fields dd { color: var(--fg-1F2A44); font-weight: 500; }
    .body { margin: 22px 0 0; font: 400 13px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); text-wrap: pretty; }
    .body.muted { margin-top: 8px; font-size: 12px; color: var(--fg-8A93A6); }
    .sign { margin-top: auto; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--bd-BBE5C8); background: var(--bg-F7FCF8); border-radius: 10px; }
    .seal { width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--bg-DCF3E3); color: var(--fg-15803D); }
    .sign-text { display: flex; flex-direction: column; }
    .sign-text b { font: 600 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-14532D); }
    .sign-text small { font: 400 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); }
    .sign-text .serial { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--fg-5B6478); }
    .doc-foot { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--bd-E5E7EB); font: 400 10.5px/14px 'IBM Plex Mono', monospace; color: var(--fg-8A93A6); }

    @keyframes fade { from { opacity: 0; } }
    @keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.985); } }
    @media (prefers-reduced-motion: reduce) { .scrim, .dialog { animation: none; } }
    @media (max-width: 640px) {
      .dialog { inset: 0; border-radius: 0; }
      .pager, .sep { display: none; }
      .paper { padding: 28px 24px; aspect-ratio: auto; }
    }
  `,
})
export class DocPreviewDialog {
  private readonly preview = inject(DocPreview);
  private readonly store = inject(ApplicationStore);
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly focused = signal(false);

  /** Documents in the side panel's order: newest group first. */
  private readonly order = computed(() => {
    const groups = new Map<string, DocItem[]>();
    for (const d of this.store.docs()) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
    return [...groups.values()].reverse().flat();
  });

  protected readonly view = computed(() => {
    const doc = this.preview.current();
    if (!doc) return null;
    const docs = this.order();
    const index = Math.max(0, docs.findIndex((d) => d.name === doc.name && d.group === doc.group));
    const app = this.store.app();
    const sig = app?.signature;
    const company = this.store.fullTitle() || 'şirket';
    return {
      doc,
      index,
      total: docs.length,
      hasPrev: index > 0,
      hasNext: index < docs.length - 1,
      appId: this.store.appId(),
      company,
      fields: [
        ['Şirket unvanı', this.store.fullTitle() || '—'],
        ['Kurucu', this.store.fullName() || '—'],
        ['Belge grubu', doc.group],
        ['Oluşturulma', dateTime(doc.at)],
        ['Başvuru no', this.store.appId()],
      ] as [string, string][],
      signer: sig?.holder ?? this.store.fullName(),
      signedAt: dateTime(doc.at),
      serial: sig?.serial ?? '',
    };
  });

  constructor() {
    // Lock page scroll and move focus into the dialog while it is open.
    effect(() => {
      const open = !!this.preview.current();
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (!open) this.focused.set(false);
    });
    afterRenderEffect(() => {
      const btn = this.closeBtn()?.nativeElement;
      if (btn && !this.focused()) {
        btn.focus();
        this.focused.set(true);
      }
    });
  }

  protected close() {
    this.preview.close();
  }

  protected step(dir: 1 | -1) {
    const v = this.view();
    if (!v) return;
    const next = this.order()[v.index + dir];
    if (next) this.preview.current.set(next);
  }

  protected download() {
    const d = this.preview.current();
    if (d) saveBytes(this.store.documentPdf(d), `${d.name}.pdf`, 'application/pdf');
  }

  protected key(e: KeyboardEvent) {
    if (!this.preview.current()) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'Tab') this.trapFocus(e);
  }

  /** Keep Tab inside the dialog. */
  private trapFocus(e: KeyboardEvent) {
    const root = this.closeBtn()?.nativeElement.closest('.dialog');
    const items = root ? [...root.querySelectorAll<HTMLElement>('button:not(:disabled)')] : [];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
}
