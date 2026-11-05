import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Icon } from '../shared/icon';
import { Select } from '../shared/select';
import { Router } from '@angular/router';
import { ApplicationStore } from '../core/application.store';
import { Assistant } from '../core/assistant';
import { DemoSettings, Speed } from '../core/demo-settings';
import { DEMO_ACCOUNT } from '../core/mock-api';
import { SCREENS } from '../screens/screens';
import { DemoNav } from './demo-nav';

/** Prototype controls: simulation speed, forced scenarios, jump to any screen, reset. */
@Component({
  selector: 'app-demo-panel',
  imports: [Icon, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.docked]': 'docked()' },
  template: `
    <div class="panel" role="dialog" aria-label="Demo kontrolleri">
      <div class="head">
        <span>Demo kontrolleri</span>
        <button type="button" class="x" aria-label="Kapat" (click)="closed.emit()"><app-icon name="x" size="16px" /></button>
      </div>

      <div class="group">
        <span class="label">Simülasyon hızı</span>
        <div class="seg" role="radiogroup">
          @for (s of speeds; track s.v) {
            <button type="button" role="radio" [attr.aria-checked]="demo.speed() === s.v" [class.on]="demo.speed() === s.v" (click)="demo.set({ speed: s.v })">{{ s.t }}</button>
          }
        </div>
      </div>

      <div class="group">
        <span class="label">Senaryolar</span>
        <label><input type="checkbox" [checked]="demo.state().forceConflict" (change)="demo.set({ forceConflict: !demo.state().forceConflict })" /> İlk unvan sorgusu MERSİS’te reddedilsin</label>
        <label><input type="checkbox" [checked]="demo.state().forceManual" (change)="demo.set({ forceManual: !demo.state().forceManual })" /> Uygunluk manuel incelemeye düşsün</label>
        <span class="hint">Doğal tetikleyiciler: “Acme Bulut Bilişim” unvanı · fon kaynağı “Üçüncü taraf transferi” · kayıtta “T.C. vatandaşı”.</span>
      </div>

      <div class="group">
        <span class="label">Ekrana atla (demo kurucuyla)</span>
        <app-select compact label="Ekrana atla" [placeholder]="nav.jumping() ? 'Hazırlanıyor…' : 'Ekran seçin…'" [options]="screenOptions" [disabled]="nav.jumping()" [value]="''" (valueChange)="jump($event)" />
        <span class="hint">Demo hesap: {{ demoEmail }} · {{ demoPassword }}</span>
      </div>

      <div class="actions">
        <span class="who">{{ store.signedIn() ? store.fullName() + ' · ' + store.appId() : 'Oturum yok' }}</span>
        <button type="button" class="danger" (click)="reset()">Tüm verileri sıfırla</button>
      </div>
    </div>
  `,
  styles: `
    .panel { position: fixed; left: 16px; bottom: 64px; z-index: 1001; width: 320px; background: var(--bg-FFFFFF); border: 1px solid var(--bd-E5E7EB); border-radius: 14px; box-shadow: 0 24px 60px -24px rgba(6,18,98, .45); font-family: 'IBM Plex Sans', system-ui, sans-serif; overflow: hidden; }
    /* Opened from the header pill: drop down under it instead of floating bottom-left. */
    :host(.docked) .panel { position: absolute; left: auto; right: 0; bottom: auto; top: calc(100% + 8px); z-index: 1001; text-align: left; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--bg-061262); color: var(--fg-FFFFFF); font: 600 13.5px/18px 'IBM Plex Sans', sans-serif; }
    .x { border: 0; background: none; color: var(--fg-C9D4F0); font: 400 20px/1 'IBM Plex Sans', sans-serif; cursor: pointer; }
    .group { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--bd-EEF1F6); }
    .label { font: 600 10.5px/14px 'IBM Plex Sans', sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--fg-5B6478); }
    .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 3px; background: var(--bg-F1F4FA); border-radius: 9px; }
    .seg button { border: 0; border-radius: 7px; padding: 6px; background: transparent; color: var(--fg-5B6478); font: 600 12.5px/16px 'IBM Plex Sans', sans-serif; cursor: pointer; }
    .seg button.on { background: var(--bg-FFFFFF); color: var(--fg-061262); box-shadow: 0 1px 2px rgba(6,18,98, .12); }
    label { display: flex; gap: 8px; align-items: flex-start; font: 400 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); cursor: pointer; }
    input[type=checkbox] { margin: 2px 0 0; accent-color: var(--bg-061262); }
    .hint { font: 400 11.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; }
    .who { font: 500 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .danger { flex: none; border: 1px solid var(--bd-FBD5D1); background: var(--bg-FEF3F2); color: var(--fg-912018); border-radius: 8px; padding: 6px 10px; font: 600 12px/16px 'IBM Plex Sans', sans-serif; cursor: pointer; }
  `,
})
export class DemoPanel {
  /** Anchored under the header pill rather than fixed to the viewport corner. */
  readonly docked = input(false);
  readonly closed = output<void>();
  protected readonly demo = inject(DemoSettings);
  protected readonly store = inject(ApplicationStore);
  protected readonly nav = inject(DemoNav);
  private readonly router = inject(Router);
  private readonly assistant = inject(Assistant);

  protected readonly speeds: { v: Speed; t: string }[] = [
    { v: 1, t: '1×' },
    { v: 4, t: '4×' },
    { v: 1000, t: 'Anında' },
  ];
  protected readonly screens = SCREENS;
  protected readonly screenOptions = SCREENS.map((s) => ({ value: s.id, label: `${s.code} · ${s.title}`, hint: '/' + s.path }));
  protected readonly demoEmail = DEMO_ACCOUNT.email;
  protected readonly demoPassword = DEMO_ACCOUNT.password;

  protected jump(id: string) {
    if (id) void this.nav.open(id);
  }

  protected reset() {
    if (!confirm('Tüm hesaplar ve başvurular bu tarayıcıdan silinsin mi?')) return;
    this.store.resetAll();
    this.assistant.clear();
    void this.router.navigateByUrl('/');
    this.closed.emit();
  }
}
