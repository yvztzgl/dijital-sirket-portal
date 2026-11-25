import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, output, signal, viewChild } from '@angular/core';
import { DECK_FORMAT, DECK_SLIDES, slideThumb } from '../core/deck-format';
import { Icon } from './icon';

type View = 'rules' | 'off' | number;
const ORDER: View[] = ['rules', ...DECK_SLIDES.map((s) => s.no), 'off'];

/**
 * D-1a "Sunum formatı": explains the deck format page by page. The first view gives the general
 * rules and all sixteen pages at a glance; each page view shows the sample page, what to write on
 * it, the rule for each value and what it is used for; the last view lists what is given on screen
 * instead of in the deck. Esc closes, ←/→ move between views.
 */
@Component({
  selector: 'app-deck-format-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'key($event)' },
  template: `
    <div class="scrim" (click)="closed.emit()"></div>
    <div #dlg class="dialog" role="dialog" aria-modal="true" aria-labelledby="df-title" aria-describedby="df-lead" tabindex="-1">
      <header class="head">
        <div class="ht">
          <h2 id="df-title">Sunum formatı</h2>
          <p id="df-lead">Başvuru bilgileri form yerine sunumunuzdan okunur. Sunumunuz aşağıdaki {{ slides.length }} sayfayı bu sırayla içermelidir.</p>
        </div>
        <button type="button" class="icon" (click)="closed.emit()" aria-label="Sunum formatını kapat" title="Kapat (Esc)"><app-icon name="x" size="18px" /></button>
      </header>

      <div class="body">
        <nav #rail class="rail" aria-label="Sunum formatının bölümleri">
          <button type="button" class="ri lone" [class.on]="view() === 'rules'" [attr.aria-current]="view() === 'rules' ? 'page' : null" (click)="go('rules')">Genel kurallar</button>
          @for (g of format.groups; track g.title) {
            <span class="rg">{{ g.title }}</span>
            @for (s of g.slides; track s.no) {
              <button type="button" class="ri" [class.on]="view() === s.no" [attr.aria-current]="view() === s.no ? 'page' : null" (click)="go(s.no)">
                <span class="n">{{ s.no }}</span>{{ s.title }}
              </button>
            }
          }
          <button type="button" class="ri lone" [class.on]="view() === 'off'" [attr.aria-current]="view() === 'off' ? 'page' : null" (click)="go('off')">Sunumdan alınmayanlar</button>
        </nav>

        <div #pane class="pane">
          @switch (true) {
            @case (view() === 'rules') {
              <h3>Genel kurallar</h3>
              <dl class="rules">
                @for (r of format.rules; track r.title) {
                  <div><dt>{{ r.title }}</dt><dd>{{ r.text }}</dd></div>
                }
              </dl>
              <h4>Sayfalar</h4>
              <p class="note">Örnek sunum, kurgusal {{ format.sample.company }} girişimi için bu formatta hazırlanmıştır. Bir sayfanın ayrıntısını görmek için üzerine tıklayınız.</p>
              <ol class="grid">
                @for (s of slides; track s.no) {
                  <li>
                    <button type="button" (click)="go(s.no)" [attr.aria-label]="'Sayfa ' + s.no + ': ' + s.title">
                      <img [src]="thumb(s.no)" alt="" width="960" height="540" loading="lazy" />
                      <span><b>{{ s.no }}</b>{{ s.title }}</span>
                    </button>
                  </li>
                }
              </ol>
            }
            @case (view() === 'off') {
              <h3>Sunumdan alınmayanlar</h3>
              <p class="purpose">Aşağıdaki beyan ve onaylar sunumda yer alsa bile dikkate alınmaz. Her biri, ilgili adımda ekranda ayrıca verilir.</p>
              <ul class="off">
                @for (o of format.notFromDeck; track o.title) {
                  <li><app-icon name="shield" size="17px" [stroke]="1.8" /><span><b>{{ o.title }}</b>{{ o.text }}</span></li>
                }
              </ul>
            }
            @default {
              @if (slide(); as s) {
                <p class="pos">Sayfa {{ s.no }} / {{ slides.length }} · {{ group() }}</p>
                <h3>{{ s.title }}</h3>
                <p class="purpose">{{ s.purpose }}</p>
                <figure class="shot">
                  <img [src]="thumb(s.no)" [alt]="'Örnek sunumun ' + s.no + '. sayfası: ' + s.title" width="960" height="540" />
                  <figcaption>Örnek sunumda bu sayfa. Alt kısımdaki etiket, Terminal AI’ın bu sayfadan okuduğu bilgileri gösterir.</figcaption>
                </figure>
                <h4>Bu sayfada yer alması gerekenler</h4>
                <table class="fields">
                  <thead><tr><th scope="col">Bilgi ve yazım kuralı</th><th scope="col">Örnek sunumda</th><th scope="col">Kullanıldığı yer</th></tr></thead>
                  <tbody>
                    @for (f of s.fields; track f.label) {
                      <tr>
                        <th scope="row"><b>{{ f.label }}</b><small [class.opt]="f.rule.startsWith('İsteğe')">{{ f.rule }}</small></th>
                        <td class="smp">{{ f.sample }}</td>
                        <td class="use">{{ f.use }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          }

          <div class="pager">
            <button type="button" class="pg" (click)="step(-1)" [disabled]="index() === 0"><app-icon name="arrow-left" size="15px" [stroke]="2" />{{ label(index() - 1) }}</button>
            <button type="button" class="pg nx" (click)="step(1)" [disabled]="index() === order.length - 1">{{ label(index() + 1) }}<app-icon name="arrow-right" size="15px" [stroke]="2" /></button>
          </div>
        </div>
      </div>

      <footer class="foot">
        <span class="fv">{{ format.name }} {{ format.version }}</span>
        <a class="dl" [href]="format.sample.pdf" download="ornek-sunum-lumora-analytics.pdf"><app-icon name="download" size="15px" [stroke]="2" />Örnek sunum (PDF)</a>
        <a class="dl strong" [href]="format.sample.pptx" download="ornek-sunum-lumora-analytics.pptx"><app-icon name="download" size="15px" [stroke]="2" />Örnek sunum (PPTX)</a>
      </footer>
    </div>
  `,
  styles: `
    :host { font-family: 'IBM Plex Sans', system-ui, sans-serif; text-align: left; }
    .scrim { position: fixed; inset: 0; z-index: 1100; background: rgba(4, 8, 40, .62); }
    .dialog {
      position: fixed; z-index: 1101; inset: 24px; margin: auto; max-width: 1120px; max-height: 860px; display: flex; flex-direction: column;
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-D6DEEE); border-radius: 16px; overflow: hidden; outline: 0;
    }
    :focus-visible { outline: 2px solid var(--bd-061262); outline-offset: 2px; box-shadow: none; }

    .head { display: flex; align-items: flex-start; gap: 16px; padding: 20px 20px 16px 28px; border-bottom: 1px solid var(--bd-E5E7EB); }
    .ht { flex: 1; min-width: 0; }
    h2 { margin: 0; font: 600 22px/28px 'IBM Plex Sans', sans-serif; letter-spacing: -.01em; color: var(--fg-061262); }
    .ht p { margin: 4px 0 0; max-width: 62em; font: 400 14px/21px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .icon { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--fg-3B4660); cursor: pointer; }
    .icon:hover { background: var(--bg-EFF4FF); color: var(--fg-061262); }

    .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 252px 1fr; }
    .rail { overflow: auto; padding: 14px 12px 20px; border-right: 1px solid var(--bd-E5E7EB); background: var(--bg-F7F9FE); display: flex; flex-direction: column; gap: 1px; }
    .rg { margin: 14px 10px 4px; font: 600 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .ri {
      display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: 8px; background: transparent;
      font: 400 13.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); text-align: left; cursor: pointer;
    }
    .ri:hover { background: var(--bg-EFF4FF); }
    .ri.on { background: var(--bg-061262); color: var(--fg-FFFFFF); font-weight: 500; }
    .ri.lone { font-weight: 500; color: var(--fg-061262); }
    .ri.lone.on { color: var(--fg-FFFFFF); }
    .ri .n { flex: none; width: 20px; text-align: right; font: 500 12px/18px 'IBM Plex Sans', sans-serif; font-variant-numeric: tabular-nums; color: var(--fg-8A93A6); }
    .ri.on .n { color: var(--fg-C7D5F7); }

    .pane { overflow: auto; padding: 24px 32px 28px; display: flex; flex-direction: column; }
    .pos { margin: 0 0 4px; font: 500 12.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    h3 { margin: 0; font: 600 24px/30px 'IBM Plex Sans', sans-serif; letter-spacing: -.01em; color: var(--fg-061262); }
    h4 { margin: 26px 0 10px; font: 600 14px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .purpose { margin: 8px 0 0; max-width: 46em; font: 400 15px/23px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); text-wrap: pretty; }
    .note { margin: -4px 0 12px; font: 400 13px/19px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }

    .shot { margin: 20px 0 0; }
    .shot img { display: block; width: 100%; max-width: 720px; height: auto; aspect-ratio: 16 / 9; border: 1px solid var(--bd-D6DEEE); border-radius: 10px; background: #fff; }
    .shot figcaption { margin-top: 8px; font: 400 12.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }

    .fields { width: 100%; border-collapse: collapse; font: 400 13.5px/19px 'IBM Plex Sans', sans-serif; }
    .fields thead th { padding: 0 12px 8px 0; text-align: left; font: 500 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); border-bottom: 1px solid var(--bd-D6DEEE); }
    .fields td, .fields tbody th { padding: 12px 12px 12px 0; vertical-align: top; text-align: left; border-bottom: 1px solid var(--bd-E5E7EB); }
    .fields tbody th { width: 38%; font-weight: 400; }
    .fields tbody th b { display: block; font-weight: 600; color: var(--fg-1F2A44); }
    .fields tbody th small { display: block; margin-top: 2px; font-size: 12.5px; line-height: 18px; color: var(--fg-5B6478); }
    .fields small.opt { color: var(--fg-8A93A6); }
    .fields .smp { width: 32%; color: var(--fg-061262); font-weight: 500; overflow-wrap: anywhere; }
    .fields .use { color: var(--fg-3B4660); }

    .rules { margin: 14px 0 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; }
    .rules div { padding: 12px 0; border-top: 1px solid var(--bd-E5E7EB); }
    .rules dt { font: 600 13.5px/19px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    .rules dd { margin: 3px 0 0; font: 400 13.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); text-wrap: pretty; }

    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px 12px; }
    .grid button { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
    .grid img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; border: 1px solid var(--bd-D6DEEE); border-radius: 6px; background: #fff; transition: border-color .15s; }
    .grid button:hover img { border-color: var(--bd-061262); }
    .grid span { display: flex; gap: 6px; font: 400 12.5px/17px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    .grid b { font-weight: 600; color: var(--fg-5B6478); font-variant-numeric: tabular-nums; }

    .off { list-style: none; margin: 18px 0 0; padding: 0; max-width: 46em; }
    .off li { display: flex; gap: 12px; padding: 14px 0; border-top: 1px solid var(--bd-E5E7EB); color: var(--fg-061262); }
    .off li app-icon { flex: none; margin-top: 1px; }
    .off span { display: flex; flex-direction: column; gap: 2px; font: 400 13.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); }
    .off b { font-weight: 600; color: var(--fg-1F2A44); }

    .pager { margin-top: auto; padding-top: 28px; display: flex; justify-content: space-between; gap: 12px; }
    .pg {
      display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 14px; border: 1px solid var(--bd-D6DEEE); border-radius: 8px;
      background: var(--bg-FFFFFF); font: 500 13.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); cursor: pointer;
    }
    .pg:hover:not(:disabled) { border-color: var(--bd-B9C7E8); background: var(--bg-F7F9FE); }
    .pg:disabled { visibility: hidden; }

    .foot { display: flex; align-items: center; gap: 10px; padding: 12px 20px 12px 28px; border-top: 1px solid var(--bd-E5E7EB); background: var(--bg-F7F9FE); }
    .fv { flex: 1; font: 400 12.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .dl {
      display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border: 1px solid var(--bd-C9D2E3); border-radius: 8px;
      background: var(--bg-FFFFFF); font: 600 13.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); text-decoration: none; white-space: nowrap;
    }
    .dl:hover { border-color: var(--bd-B9C7E8); }
    .dl.strong { border-color: transparent; background: var(--bg-061262); color: var(--fg-FFFFFF); }
    .dl.strong:hover { background: var(--bg-0C217E); }

    @media (max-width: 820px) {
      .dialog { inset: 0; max-height: none; border-radius: 0; border: 0; }
      .head { padding: 16px 12px 12px 16px; }
      .body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
      .rail { flex-direction: row; overflow-x: auto; overflow-y: hidden; padding: 8px 12px; border-right: 0; border-bottom: 1px solid var(--bd-E5E7EB); }
      .rg { display: none; }
      .ri { width: auto; flex: none; white-space: nowrap; }
      .pane { padding: 18px 16px 20px; }
      .rules { grid-template-columns: 1fr; }
      .fields thead { display: none; }
      .fields tr { display: block; padding: 10px 0; border-bottom: 1px solid var(--bd-E5E7EB); }
      .fields td, .fields tbody th { display: block; width: auto; padding: 2px 0; border: 0; }
      .foot { padding: 10px 16px; }
      .fv { display: none; }
      .dl { flex: 1; justify-content: center; padding: 0 10px; }
    }
  `,
})
export class DeckFormatDialog {
  readonly closed = output<void>();

  protected readonly format = DECK_FORMAT;
  protected readonly slides = DECK_SLIDES;
  protected readonly order = ORDER;
  protected readonly thumb = slideThumb;
  protected readonly view = signal<View>('rules');
  protected readonly index = computed(() => ORDER.indexOf(this.view()));
  protected readonly slide = computed(() => DECK_SLIDES.find((s) => s.no === this.view()));
  protected readonly group = computed(() => DECK_FORMAT.groups.find((g) => g.slides.some((s) => s.no === this.view()))?.title ?? '');

  private readonly dlg = viewChild.required<ElementRef<HTMLElement>>('dlg');
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');
  private readonly rail = viewChild.required<ElementRef<HTMLElement>>('rail');
  private readonly injector = inject(Injector);

  constructor() {
    afterNextRender(() => this.dlg().nativeElement.focus());
  }

  protected label(i: number) {
    const v = ORDER[i];
    if (v === undefined) return '';
    if (v === 'rules') return 'Genel kurallar';
    if (v === 'off') return 'Sunumdan alınmayanlar';
    return `${v}. ${DECK_SLIDES.find((s) => s.no === v)?.title}`;
  }

  protected go(v: View) {
    this.view.set(v);
    this.pane().nativeElement.scrollTop = 0;
    // Keep the chosen item visible in the list when moving with the pager or the arrow keys.
    afterNextRender(() => this.rail().nativeElement.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), { injector: this.injector });
  }

  protected step(d: number) {
    const v = ORDER[this.index() + d];
    if (v !== undefined) this.go(v);
  }

  protected key(e: KeyboardEvent) {
    if (e.key === 'Escape') this.closed.emit();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      this.step(e.key === 'ArrowRight' ? 1 : -1);
    }
  }
}
