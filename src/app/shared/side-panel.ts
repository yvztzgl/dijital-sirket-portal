import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Bot } from './bot';
import { Icon } from './icon';
import { ApplicationStore } from '../core/application.store';
import { Assistant } from '../core/assistant';
import { DocPreview } from '../core/doc-preview';
import { saveBytes } from '../core/files';
import { time } from '../core/format';
import { DocItem } from '../core/models';

export type SidePanelTab = 'ai' | 'docs' | 'log';
export type SidePanelCtx =
  | 'profile'
  | 'upload'
  | 'scan'
  | 'review'
  | 'title'
  | 'aml'
  | 'declare'
  | 'screen'
  | 'eligible'
  | 'manual'
  | 'pay'
  | 'sign'
  | 'call'
  | 'signed'
  | 'resident'
  | 'setup'
  | 'done';

/** One option of the opening list: icon (see shared/icon.ts), the topic, the question it asks. */
type Opt = [icon: string, title: string, question: string];

const Q = {
  formats: ['file', 'Dosya biçimleri', 'Hangi dosya biçimleri kabul edilir?'],
  read: ['search', 'Okunan bilgiler', 'Sunumdan hangi bilgiler okunur?'],
  fix: ['pencil', 'Düzeltme', 'Okunan bilgiler düzeltilebilir mi?'],
  privacy: ['lock', 'Gizlilik', 'Sunum gizli tutulur mu?'],
  why: ['help', 'Ön bilgiler', 'Ön bilgiler neden isteniyor?'],
  source: ['landmark', 'Sermaye kaynağı', 'Sermaye kaynağı ne demektir?'],
  differ: ['list-checks', 'Farklı bilgiler', 'Ön bilgilerle sunum farklıysa ne olur?'],
  type: ['building', 'Şirket türü', 'Şirket türü neden anonim şirkettir?'],
  nace: ['list-checks', 'Faaliyet kodları', 'NACE kodu nedir?'],
  title: ['search', 'Şirket unvanı', 'Unvan nasıl rezerve edilir?'],
  mrz: ['id-card', 'Pasaport okuma', 'MRZ nedir?'],
  address: ['file', 'Adres belgesi', 'Adres belgesi olarak ne kabul edilir?'],
  lists: ['shield', 'Uygunluk taraması', 'Hangi listeler taranır?'],
  camera: ['video', 'Kamera', 'Kamera çalışmıyorsa ne yapılır?'],
  invoice: ['file', 'Fatura', 'Fatura kime kesilir?'],
  refund: ['card', 'Ücret iadesi', 'Ücret iade edilir mi?'],
  capital: ['landmark', 'Sermaye', 'Asgari sermaye ne kadardır?'],
  review: ['clock', 'İnceleme süresi', 'Manuel inceleme ne kadar sürer?'],
  proof: ['file', 'İstenen belgeler', 'Hangi belgeler istenir?'],
  esign: ['badge-check', 'E-imza', 'E-imza nedir?'],
  record: ['mic', 'Görüşme kaydı', 'Görüşme kaydedilir mi?'],
  seal: ['shield', 'Mali mühür', 'Mali mühür nedir?'],
  iban: ['landmark', 'Banka hesabı', 'IBAN ne zaman bildirilir?'],
  ibanWhere: ['landmark', 'Banka hesabı', 'IBAN nerede görüntülenir?'],
  adviser: ['user', 'Mali müşavir', 'Mali müşavir nasıl atanır?'],
  deposit: ['card', 'Sermaye ödemesi', 'Hesaba ne kadar yatırılmalıdır?'],
} satisfies Record<string, Opt>;

/**
 * What Terminal AI offers on each kind of screen: the step's name and three questions it can answer
 * there, shown as a list under the greeting. Each question must match a pattern in mock-api's
 * ANSWERS. The greeting itself ("Selam …, sana nasıl yardımcı olabilirim?") is the owner's wording.
 */
const AI: Record<SidePanelCtx, { step: string; opts: Opt[] }> = {
  profile: { step: 'Ön bilgiler', opts: [Q.why, Q.source, Q.nace] },
  upload: { step: 'Sunum', opts: [Q.formats, Q.read, Q.privacy] },
  scan: { step: 'Sunum', opts: [Q.read, Q.fix, Q.privacy] },
  review: { step: 'Sunum', opts: [Q.differ, Q.nace, Q.title] },
  title: { step: 'Sunum', opts: [Q.title, Q.type, Q.nace] },
  aml: { step: 'Kimlik', opts: [Q.mrz, Q.lists, Q.camera] },
  declare: { step: 'Kimlik', opts: [Q.address, Q.lists, Q.review] },
  screen: { step: 'Kimlik', opts: [Q.lists, Q.review, Q.invoice] },
  eligible: { step: 'Kimlik', opts: [Q.lists, Q.invoice, Q.refund] },
  manual: { step: 'Kimlik', opts: [Q.review, Q.proof, Q.lists] },
  pay: { step: 'Ödeme', opts: [Q.invoice, Q.refund, Q.capital] },
  sign: { step: 'İmza', opts: [Q.esign, Q.record, Q.camera] },
  call: { step: 'İmza', opts: [Q.record, Q.esign, Q.camera] },
  signed: { step: 'İmza', opts: [Q.esign, Q.seal, Q.iban] },
  resident: { step: 'İmza', opts: [Q.esign, Q.seal, Q.iban] },
  setup: { step: 'Kuruluş', opts: [Q.seal, Q.iban, Q.adviser] },
  done: { step: 'Kuruluş', opts: [Q.adviser, Q.ibanWhere, Q.deposit] },
};

type Actor = 's' | 'u' | 'a' | 'k';
/** Log actor: label, icon, icon colour, badge tint. */
const WHO: Record<Actor, [string, string, string, string]> = {
  s: ['Sistem', 'cpu', 'var(--fg-061262)', 'var(--bg-EFF4FF)'],
  u: ['Siz', 'user', 'var(--fg-3B4660)', 'var(--bg-EEF1F6)'],
  a: ['Terminal AI', 'sparkles', 'var(--fg-6D28D9)', 'var(--bg-F3EEFF)'],
  k: ['Kurum', 'landmark', 'var(--fg-15803D)', 'var(--bg-F0FDF4)'],
};

/**
 * The panel docked beside every wizard step. It is Terminal AI first: a greeting with the questions
 * it can answer on this step, then the conversation. The application's documents and its log
 * are two further views, reached from the two buttons in the panel's header.
 * Look settled with the owner on 2026-11-17: no title bar, no speech bubbles for the AI, the
 * message box as the main element, no box-shadow.
 */
@Component({
  selector: 'app-side-panel',
  imports: [Bot, Icon],
  templateUrl: './sidepanel.html',
  styles: `
    :host { display: block; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .panel { box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; padding: 12px 14px; background: var(--bg-FFFFFF); border: 1px solid var(--bd-D6DEEE); overflow: hidden; }

    .head { display: flex; align-items: center; gap: 9px; padding-left: 4px; min-height: 40px; }
    /* Terminal AI's face (bot.ts): at rest it floats and blinks, while an answer is on its way it looks around. */
    .mark { margin-right: 1px; }
    .name { white-space: nowrap; font: 600 14.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .step { white-space: nowrap; padding: 3px 9px; border-radius: 999px; background: var(--bg-EFF4FF); color: var(--fg-0C217E); font: 500 12px/16px 'IBM Plex Sans', sans-serif; }
    .step.id { font: 500 11.5px/16px 'IBM Plex Mono', monospace; background: none; color: var(--fg-5B6478); padding: 0; }
    .grow { flex: 1; }
    .tool {
      position: relative; flex: none; display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 11px;
      background: transparent; color: var(--fg-5B6478); cursor: pointer; transition: background-color .15s, color .15s;
    }
    .tool:hover, .tool.on { background: var(--bg-EFF4FF); color: var(--fg-061262); }
    .tool .n {
      position: absolute; right: 1px; top: 1px; min-width: 16px; height: 16px; box-sizing: border-box; padding: 0 4px; border-radius: 999px;
      background: var(--bg-061262); color: var(--fg-FFFFFF); font: 600 10px/16px 'IBM Plex Mono', monospace; text-align: center;
    }
    :focus-visible { box-shadow: none; outline: 2px solid var(--bd-061262); outline-offset: 2px; }

    /* ------------------------------------------------------------------ Terminal AI */
    .chat { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 8px 6px 4px; }
    .hello { margin: 0; font: 600 20px/1.3 'IBM Plex Sans', sans-serif; letter-spacing: -.015em; color: var(--fg-061262); text-wrap: balance; }
    .hello span { color: var(--fg-5B6478); }
    /* The options under the greeting: each row asks its question. */
    .opts { padding: 4px 14px; border-radius: 16px; background: var(--bg-F7F9FE); }
    .opts h3 { margin: 0; padding: 10px 0 5px; font: 600 12.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .opts ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .opts li + li { border-top: 1px solid var(--bd-E3E9F5); }
    .opts button {
      display: flex; align-items: center; gap: 12px; box-sizing: border-box; width: calc(100% + 20px); margin: 3px -10px; padding: 8px 10px;
      border: 0; border-radius: 11px; background: transparent; text-align: left; cursor: pointer; transition: background-color .15s;
    }
    .opts button:hover:not([disabled]) { background: var(--bg-EFF4FF); }
    .opts button[disabled] { cursor: default; opacity: .6; }
    .opts .ico { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; background: var(--bg-FFFFFF); color: var(--fg-0C217E); }
    .opts .t { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .opts b { font: 600 13.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .opts small { font: 400 12.5px/17px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .opts .go { flex: none; color: var(--fg-8A93A6); transition: color .15s, transform .15s; }
    .opts button:hover:not([disabled]) .go { color: var(--fg-061262); transform: translateX(2px); }
    /* The AI speaks in plain text on the panel; only the founder's words sit in a pill. */
    .ai { margin: 0; font: 400 14.5px/1.55 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); text-wrap: pretty; animation: msgIn .3s ease both; }
    .me { margin: 0; align-self: flex-end; max-width: 86%; padding: 9px 14px; border-radius: 18px; background: var(--bg-EFF4FF); font: 400 14.5px/1.45 'IBM Plex Sans', sans-serif; color: var(--fg-061262); overflow-wrap: anywhere; }

    .thinking { align-self: flex-start; display: flex; align-items: center; gap: 9px; animation: msgIn .25s ease both; }
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
    .caret {
      display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: -2px; border-radius: 2px;
      background: var(--bg-061262); animation: caret .9s steps(1) infinite;
    }

    .foot { display: flex; flex-direction: column; gap: 10px; }
    /* The message box is the panel's main element: a thin navy-to-blue edge instead of a shadow. */
    .composer {
      display: flex; align-items: flex-end; gap: 8px; padding: 10px 10px 10px 14px; border-radius: 20px; border: 1.5px solid transparent;
      background: linear-gradient(var(--bg-FFFFFF), var(--bg-FFFFFF)) padding-box, linear-gradient(120deg, var(--bd-061262) 0%, var(--fg-9DB6FF) 55%, var(--bd-C7D5F7) 100%) border-box;
    }
    .composer textarea {
      flex: 1; min-width: 0; height: 44px; padding: 2px 0 0; border: 0; outline: 0; resize: none; background: transparent;
      color: var(--fg-1F2A44); font: 400 14.5px/1.45 'IBM Plex Sans', sans-serif;
    }
    .composer textarea:focus-visible { outline: 0; }
    .send { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--bg-061262); color: var(--fg-FFFFFF); cursor: pointer; }
    .send[disabled] { opacity: .5; cursor: default; }
    .hint { margin: 0; text-align: center; font: 400 11.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }

    @keyframes dot { 0%, 100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-4px); opacity: 1; } }
    @keyframes shimmer { from { background-position: 100% 0; } to { background-position: -150% 0; } }
    @keyframes statusIn { from { opacity: 0; transform: translateY(3px); } }
    @keyframes msgIn { from { opacity: 0; transform: translateY(4px); } }
    @keyframes caret { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .dots i, .status, .ai, .thinking, .caret { animation: none !important; }
      .opts .go { transition: none; }
      .status { color: var(--fg-5B6478); background: none; }
    }

    /* ---------------------------------------------------------------- documents, log */
    .list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: 0 2px; }
    .group { padding: 10px 6px 4px; display: flex; align-items: center; justify-content: space-between; font: 600 12.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); }
    .group .c { font: 500 11px/14px 'IBM Plex Mono', monospace; color: var(--fg-5B6478); }
    .doc { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 10px; }
    .doc.fresh { background: var(--bg-F7F9FE); }
    .doc .t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .doc .nm { font: 500 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .doc .mt { font: 400 11.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .doc.fresh .mt { color: var(--fg-061262); }
    .doc-actions { display: flex; gap: 2px; flex: none; }
    .doc-btn {
      width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 8px;
      background: transparent; color: var(--fg-5B6478); cursor: pointer; transition: background .15s, color .15s;
    }
    .doc-btn:hover { background: var(--bg-EFF4FF); color: var(--fg-061262); }

    .timeline { list-style: none; margin: 0; flex: 1; min-height: 0; overflow: auto; padding: 8px 6px 4px; display: flex; flex-direction: column; }
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanel {
  readonly tab = input<SidePanelTab>('ai');
  readonly ctx = input<SidePanelCtx>('review');
  readonly height = input('780px');
  readonly radius = input('20px');

  protected readonly store = inject(ApplicationStore);
  protected readonly assistant = inject(Assistant);
  private readonly docPreview = inject(DocPreview);
  /** View chosen by the user; starts at the `tab` input and follows it when it changes. */
  protected readonly activeTab = signal<SidePanelTab>('ai');
  protected readonly draft = signal('');

  private readonly chat = viewChild<ElementRef<HTMLElement>>('chat');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');

  constructor() {
    effect(() => this.activeTab.set(this.tab()));
    // The AI suggestion card (on screens that still have one) offers this screen's questions too.
    effect(() => this.assistant.suggestions.set((AI[this.ctx()] ?? AI.review).opts.map((o) => o[2])));
    // Keep the newest chat message in view.
    afterRenderEffect(() => {
      const v = this.vals();
      const el = this.chat()?.nativeElement;
      if (el && (v.messages.length || v.thinking || v.status)) el.scrollTop = el.scrollHeight;
    });
    // Anything that asks Terminal AI (chips, AI cards) brings the conversation into view.
    effect(() => {
      if (this.assistant.focus()) this.activeTab.set('ai');
    });
    // A screen asked for the documents or the log ("Belgeleri görüntüle").
    const shown = untracked(this.assistant.panel).n;
    effect(() => {
      const p = this.assistant.panel();
      if (p.n !== shown) this.activeTab.set(p.tab);
    });
    // A question asked from elsewhere on the page is answered here: pulse the panel's edge so the eye follows.
    const asked = untracked(this.assistant.focus);
    effect(() => {
      if (this.assistant.focus() !== asked) this.flash();
    });
    // "Write your own question" on an AI card: open the conversation and put the cursor in the message box.
    let composed = untracked(this.assistant.compose);
    afterRenderEffect(() => {
      const n = this.assistant.compose();
      const field = this.field()?.nativeElement;
      if (n === composed) return;
      this.activeTab.set('ai');
      if (!field) return; // the box is rendered once the conversation is showing; this runs again then
      composed = n;
      field.focus();
      this.flash();
    });
  }

  private flash() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.panel()?.nativeElement.animate([{ borderColor: 'var(--bd-061262)' }, { borderColor: 'var(--bd-D6DEEE)' }], { duration: 900, easing: 'ease-out' });
  }

  /** The header's Belgeler / İşlem kaydı buttons: open that view, or go back to the conversation. */
  protected toggle(tab: SidePanelTab) {
    this.activeTab.set(this.activeTab() === tab ? 'ai' : tab);
  }

  protected send(text = this.draft()) {
    if (!text.trim()) return;
    this.draft.set('');
    void this.assistant.ask(text);
  }

  protected onKey(e: Event) {
    const k = e as KeyboardEvent;
    if (k.key !== 'Enter' || k.shiftKey) return;
    k.preventDefault();
    this.send();
  }

  protected preview(d: DocItem) {
    this.docPreview.open(d);
  }

  protected download(d: DocItem) {
    saveBytes(this.store.documentPdf(d), `${d.name}.pdf`, 'application/pdf');
  }

  protected readonly vals = computed(() => {
    const tab = this.activeTab();
    const a = AI[this.ctx()] ?? AI.review;
    const allDocs = this.store.docs();
    const settingUp = this.store.stage() === 'setup';

    const groups: { title: string; n: number; docs: { doc: DocItem; name: string; meta: string; fresh: boolean }[] }[] = [];
    allDocs.forEach((d, i) => {
      let grp = groups.find((x) => x.title === d.group);
      if (!grp) {
        grp = { title: d.group, n: 0, docs: [] };
        groups.push(grp);
      }
      const fresh = settingUp && i === allDocs.length - 1;
      grp.docs.push({ doc: d, name: d.name + '.pdf', meta: fresh ? 'Az önce oluşturuldu, imzalanıyor…' : `PDF, ${d.sizeKb} KB, e-imzalı`, fresh });
    });
    groups.reverse();
    groups.forEach((g) => (g.n = g.docs.length));

    const all = this.store.logs();
    const logs = all.map((l, i) => {
      const [who, icon, ink, tint] = WHO[l.who];
      return { t: time(l.at), iso: new Date(l.at).toISOString(), text: l.text, who, icon, ink, tint, last: i === all.length - 1 };
    });

    return {
      height: this.height(),
      radius: this.radius(),
      isAi: tab === 'ai',
      isDocs: tab === 'docs',
      isLog: tab === 'log',
      step: a.step,
      name: this.store.fullName(),
      opts: a.opts.map(([icon, t, q]) => ({ icon, t, q })),
      messages: this.assistant.thread().map((m) => ({ me: m.me, text: m.text, streaming: !!m.streaming })),
      thinking: this.assistant.thinking(),
      status: this.assistant.status(),
      groups,
      docCount: allDocs.length,
      noDocs: allDocs.length === 0,
      logs,
    };
  });
}
