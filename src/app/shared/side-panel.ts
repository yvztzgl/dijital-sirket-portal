import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Icon } from './icon';
import { ApplicationStore } from '../core/application.store';
import { Assistant } from '../core/assistant';
import { DocPreview } from '../core/doc-preview';
import { saveBytes } from '../core/files';
import { time } from '../core/format';
import { DocItem } from '../core/models';

export type SidePanelTab = 'ai' | 'docs' | 'log';
export type SidePanelCtx =
  | 'upload'
  | 'scan'
  | 'review'
  | 'aml'
  | 'manual'
  | 'pay'
  | 'sign'
  | 'setup'
  | 'done';

type Bubble = ['b' | 'm', string];

const AI: Record<SidePanelCtx, [string, Bubble[], string[]]> = {
  upload: ['Upload', [['b', 'Merhaba, ben Terminal AI. Kuruluş boyunca yanınızdayım.'], ['b', 'Sunumunuzda şirket adı, faaliyet alanı, kurucu ve iletişim bilgileri varsa formu sizin yerinize doldururum. Eksik kalanları birlikte tamamlarız.']], ['Hangi formatlar kabul ediliyor?', 'Sunumum gizli kalır mı?', 'Neden anonim şirket?']],
  scan: ['Okuma', [['b', 'Sunumunuzu sayfa sayfa okuyorum.'], ['b', 'Bulduğum her değeri kaynak sayfa numarasıyla kaydediyorum; bir sonraki adımda hepsini düzenleyebilirsiniz.']], ['Neyi okuyorsun?', 'Yanlış okursan ne olur?']],
  review: ['İnceleme', [['b', '13 alan buldum. Fon kaynağı ve telefon numarasından emin değilim — sarı işaretli alanları kontrol edin.'], ['m', '62.02 kodunu da eklemeli miyim?'], ['b', 'Danışmanlık hizmeti verecekseniz evet. Sunumunuzun 8. sayfasında “kurumsal danışmanlık” geçiyor; kodu öneri olarak işaretledim.']], ['NACE kodu nedir?', 'Unvan nasıl rezerve edilir?', 'Sermaye neden 250.000 TL?']],
  aml: ['Uygunluk', [['b', 'Kimlik doğrulama yaklaşık 1 dakika sürer.'], ['b', 'Pasaportunuzun fotoğraflı sayfasını kameraya düz tutun; alttaki MRZ satırlarını otomatik okurum.']], ['MRZ nedir?', 'Hangi listeler taranıyor?', 'Verilerim nerede saklanıyor?']],
  manual: ['Uygunluk', [['b', 'Başvurunuz reddedilmedi. Fon kaynağı üçüncü taraf transferi olduğu için uyum ekibi dosyayı elle inceleyecek.'], ['b', 'Bilgi yanlış girildiyse “Sunum bilgilerini düzelt” ile geri dönebilirsiniz.']], ['Manuel inceleme ne kadar sürer?', 'Hangi belgeler istenebilir?']],
  pay: ['Ödeme', [['b', 'Toplam 12.750,00 TL tek seferlik ödenir; kuruluştaki tüm kurum harç ve ücretleri dahildir.'], ['b', 'Sermaye bu tutara dahil değildir; banka hesabı açılınca yatırılır.']], ['Fatura kime kesilir?', 'Sermaye ne zaman yatırılır?', 'İade mümkün mü?']],
  sign: ['e-İmza', [['b', 'Günlük e-imza 24 saat geçerlidir ve yalnızca kuruluş belgeleriniz için kullanılır.'], ['b', 'Görüşmede operatör pasaportunuzu kameraya göstermenizi ve sözlü onay vermenizi isteyecek.']], ['e-İmza nedir?', 'Görüşme kaydediliyor mu?', 'Kameram yoksa?']],
  setup: ['Kuruluş', [['b', 'Vergi dairesi kaydınız açıldı, vergi levhanız hazırlanıyor.'], ['b', 'Sayfayı kapatabilirsiniz. Her kurum adımı tamamlandığında size e-posta göndereceğim.']], ['Mali mühür nedir?', 'IBAN ne zaman gelir?', 'Müşavirim kim?']],
  done: ['Tamamlandı', [['b', 'Tebrikler, şirketiniz kuruldu.'], ['b', 'İlk 30 gün için bir kontrol listesi hazırladım: sermaye yatırımı, ilk e-fatura ve müşavir görüşmesi.']], ['Sermayeyi nasıl yatırırım?', 'İlk e-faturayı nasıl keserim?']],
};

type Actor = 's' | 'u' | 'a' | 'k';
/** Log actor: label, icon, icon colour, badge tint. */
const WHO: Record<Actor, [string, string, string, string]> = {
  s: ['Sistem', 'cpu', 'var(--fg-061262)', 'var(--bg-EFF4FF)'],
  u: ['Siz', 'user', 'var(--fg-3B4660)', 'var(--bg-EEF1F6)'],
  a: ['Terminal AI', 'sparkles', 'var(--fg-6D28D9)', 'var(--bg-F3EEFF)'],
  k: ['Kurum', 'landmark', 'var(--fg-15803D)', 'var(--bg-F0FDF4)'],
};

/** Right-hand "Başvuru Dosyanız" panel: Terminal AI chat, the application's documents and audit log. */
@Component({
  selector: 'app-side-panel',
  imports: [Icon],
  templateUrl: './sidepanel.html',
  styles: `
    /* Terminal AI: thinking indicator and streamed replies. */
    .thinking {
      align-self: flex-start; display: flex; align-items: center; gap: 9px; padding: 8px 12px 8px 8px;
      background: var(--bg-F1F5FF); border-radius: 4px 12px 12px 12px; animation: msgIn .25s ease both;
    }
    /* Terminal AI's face: bobs gently, eyes glance side to side and blink while it thinks. */
    .bot { flex: none; animation: bob 1.4s ease-in-out infinite; }
    .bot .eyes { transform-box: fill-box; transform-origin: center; animation: look 2.4s ease-in-out infinite, blink 2.4s ease-in-out infinite; }
    .dots { display: flex; gap: 3px; }
    .dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--bg-061262); opacity: .35; animation: dot 1.1s ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: .15s; }
    .dots i:nth-child(3) { animation-delay: .3s; }
    .status {
      font: 500 12.5px/18px 'IBM Plex Sans', sans-serif; color: transparent; white-space: nowrap;
      background: linear-gradient(90deg, var(--fg-5B6478) 0%, var(--fg-5B6478) 35%, var(--fg-061262) 50%, var(--fg-5B6478) 65%, var(--fg-5B6478) 100%);
      background-size: 250% 100%; -webkit-background-clip: text; background-clip: text;
      animation: shimmer 1.6s linear infinite, statusIn .3s ease both;
    }
    .bot-msg { animation: msgIn .25s ease both; }
    .caret {
      display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: -2px; border-radius: 2px;
      background: var(--bg-061262); animation: caret .9s steps(1) infinite;
    }
    @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
    @keyframes look { 0%, 20% { translate: 0 0; } 30%, 45% { translate: -1.5px 0; } 55%, 70% { translate: 1.5px 0; } 80%, 100% { translate: 0 0; } }
    @keyframes blink { 0%, 86%, 100% { scale: 1 1; } 90% { scale: 1 .15; } }
    @keyframes dot { 0%, 100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-4px); opacity: 1; } }
    @keyframes shimmer { from { background-position: 100% 0; } to { background-position: -150% 0; } }
    @keyframes statusIn { from { opacity: 0; transform: translateY(3px); } }
    @keyframes msgIn { from { opacity: 0; transform: translateY(4px); } }
    @keyframes caret { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .bot, .bot .eyes, .dots i, .status, .bot-msg, .thinking, .caret { animation: none; }
      .status { color: var(--fg-5B6478); background: none; }
    }

    .doc-actions { display: flex; gap: 2px; flex: none; }
    .doc-btn {
      width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 8px;
      background: transparent; color: var(--fg-5B6478); cursor: pointer; transition: background .15s, color .15s;
    }
    .doc-btn:hover { background: var(--bg-EFF4FF); color: var(--fg-061262); }

    .timeline { list-style: none; margin: 0; flex: 1; min-height: 0; overflow: auto; padding: 14px 18px 16px; display: flex; flex-direction: column; }
    .empty { padding: 28px 12px; text-align: center; font: 400 13px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .event { position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 12px; padding-bottom: 14px; }
    /* Rail joining each badge to the next event. */
    .event:not(.last)::before {
      content: ''; position: absolute; left: 12.5px; top: 30px; bottom: 2px; width: 1px; background: var(--bd-E5E7EB);
    }
    .badge { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; }
    .body { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-top: 3px; }
    .text { font: 500 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); text-wrap: pretty; overflow-wrap: anywhere; }
    .meta { display: flex; align-items: center; gap: 6px; font: 400 11.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-8A93A6); }
    .who { font-weight: 600; color: var(--fg-5B6478); }
    .meta time { font: 500 11px/16px 'IBM Plex Mono', monospace; }
    .meta time::before { content: '·'; margin-right: 6px; font-family: 'IBM Plex Sans', sans-serif; }
  `,
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanel {
  readonly tab = input<SidePanelTab>('ai');
  readonly ctx = input<SidePanelCtx>('review');
  readonly height = input('780px');
  readonly radius = input('14px');

  protected readonly store = inject(ApplicationStore);
  protected readonly assistant = inject(Assistant);
  private readonly docPreview = inject(DocPreview);
  /** Tab chosen by the user; starts at the `tab` input and follows it when it changes. */
  protected readonly activeTab = signal<SidePanelTab>('ai');
  protected readonly draft = signal('');

  private readonly chat = viewChild<ElementRef<HTMLElement>>('chat');

  constructor() {
    effect(() => this.activeTab.set(this.tab()));
    // Keep the newest chat message in view.
    afterRenderEffect(() => {
      const v = this.vals();
      const el = this.chat()?.nativeElement;
      if (el && (v.bubbles.length || v.thinking || v.status)) el.scrollTop = el.scrollHeight;
    });
    // Anything that asks Terminal AI (chips, AI cards) brings the chat into view.
    effect(() => {
      if (this.assistant.focus()) this.activeTab.set('ai');
    });
  }

  protected send(text = this.draft()) {
    if (!text.trim()) return;
    this.draft.set('');
    void this.assistant.ask(text);
  }

  protected preview(d: DocItem) {
    this.docPreview.open(d);
  }

  protected download(d: DocItem) {
    saveBytes(this.store.documentPdf(d), `${d.name}.pdf`, 'application/pdf');
  }

  /** The review intro reflects what was actually flagged in the deck. */
  private introBubbles(ctx: SidePanelCtx, base: Bubble[]): Bubble[] {
    if (ctx !== 'review') return base;
    const marks = this.store.app()?.marks ?? {};
    const n = (this.store.scan()?.total ?? 13);
    const flagged = [marks['funding'] === 'check' && 'fon kaynağı', marks['phone'] === 'check' && 'telefon numarası'].filter(Boolean);
    const first: Bubble = flagged.length
      ? ['b', `${n} alan buldum. ${flagged.join(' ve ').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))} konusunda emin değilim — sarı işaretli alanları kontrol edin.`]
      : ['b', `${n} alan buldum ve hepsini sunumunuzdan net okudum. Unvan önerimi kontrol edip devam edebilirsiniz.`];
    return flagged.length ? [first, ...base.slice(1)] : [first];
  }

  protected readonly vals = computed(() => {
    const tab = this.activeTab();
    const ctx = this.ctx();
    const a = AI[ctx] ?? AI.review;
    const allDocs = this.store.docs();
    const settingUp = this.store.stage() === 'setup';

    const groups: { title: string; n: number; docs: { doc: DocItem; name: string; meta: string; metaColor: string; bg: string }[] }[] = [];
    allDocs.forEach((d, i) => {
      let grp = groups.find((x) => x.title === d.group);
      if (!grp) {
        grp = { title: d.group, n: 0, docs: [] };
        groups.push(grp);
      }
      const fresh = settingUp && i === allDocs.length - 1;
      grp.docs.push({
        doc: d,
        name: d.name + '.pdf',
        meta: fresh ? 'Az önce oluşturuldu · imzalanıyor…' : 'PDF · ' + d.sizeKb + ' KB · e-imzalı',
        metaColor: fresh ? 'var(--fg-061262)' : 'var(--fg-5B6478)',
        bg: fresh ? 'var(--bg-F7F9FE)' : 'transparent',
      });
    });
    groups.reverse();
    groups.forEach((g) => (g.n = g.docs.length));

    const all = this.store.logs();
    const logs = all.map((l, i) => {
      const [who, icon, ink, tint] = WHO[l.who];
      return { t: time(l.at), iso: new Date(l.at).toISOString(), text: l.text, who, icon, ink, tint, last: i === all.length - 1 };
    });

    const mk = (id: SidePanelTab, label: string, count: number | null) => {
      const active = tab === id;
      return {
        id,
        label,
        active,
        count,
        hasCount: count !== null,
        bg: active ? 'var(--bg-FFFFFF)' : 'transparent',
        color: active ? 'var(--fg-061262)' : 'var(--fg-5B6478)',
        shadow: active ? '0 1px 2px rgba(6,18,98,.12)' : 'none',
        countBg: active ? 'var(--bg-061262)' : 'var(--bg-DDE3EE)',
        countColor: active ? 'var(--fg-FFFFFF)' : 'var(--fg-3B4660)',
      };
    };

    return {
      height: this.height(),
      radius: this.radius(),
      tabs: [mk('ai', 'Terminal AI', null), mk('docs', 'Belgeler', allDocs.length), mk('log', 'Kayıt', logs.length)],
      isAi: tab === 'ai',
      isDocs: tab === 'docs',
      isLog: tab === 'log',
      ctxLabel: a[0],
      bubbles: [
        ...this.introBubbles(ctx, a[1]).map(([w, text]) => ({ bot: w === 'b', me: w === 'm', text, streaming: false })),
        ...this.assistant.thread().map((m) => ({ bot: !m.me, me: m.me, text: m.text, streaming: !!m.streaming })),
      ],
      thinking: this.assistant.thinking(),
      status: this.assistant.status(),
      chips: a[2],
      groups,
      noDocs: allDocs.length === 0,
      logs,
    };
  });
}
