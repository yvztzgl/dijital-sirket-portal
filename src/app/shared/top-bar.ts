import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApplicationStore } from '../core/application.store';
import { Assistant } from '../core/assistant';
import { HeaderTools } from './header-tools';
import { Icon } from './icon';

/** Platform header: brand, help / contrast / language tools, and the guest CTA or account menu. */
@Component({
  selector: 'app-top-bar',
  imports: [HeaderTools, Icon, RouterLink],
  templateUrl: './topbar.html',
  host: {
    style: 'display:block',
    '(document:click)': 'outside($event)',
    '(document:keydown.escape)': 'menu.set(false)',
  },
  styles: `
    .bar {
      height: 64px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 24px;
      padding: 0 24px 0 32px; background: var(--bg-FFFFFF); border-bottom: 1px solid var(--bd-E5E7EB); font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; color: inherit; text-decoration: none; }
    .brand:hover { text-decoration: none; }
    .mono { width: 34px; height: 34px; flex: none; border-radius: 8px; background: var(--bg-061262); color: var(--fg-FFFFFF); display: grid; place-items: center; font: 700 13px/1 'IBM Plex Sans', sans-serif; letter-spacing: .02em; }
    .names { display: flex; flex-direction: column; min-width: 0; }
    .name { display: flex; align-items: center; gap: 8px; white-space: nowrap; font: 600 14.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .tag { font: 600 10px/14px 'IBM Plex Sans', sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--fg-061262); padding: 1px 6px; border-radius: 4px; background: var(--bg-EFF4FF); }
    .sub { font: 400 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .right { display: flex; align-items: center; gap: 12px; }
    .divider { width: 1px; height: 28px; background: var(--bg-E5E7EB); }
    .note { font: 500 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); white-space: nowrap; }
    .cta { font: 600 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); padding: 8px 12px; border: 1px solid var(--bd-D6DEEE); border-radius: 9px; white-space: nowrap; text-decoration: none; }
    .cta:hover { background: var(--bg-F7F9FE); text-decoration: none; }
    .account { position: relative; }
    .who {
      display: flex; align-items: center; gap: 10px; height: 44px; padding: 4px 8px 4px 4px; border: 1px solid transparent;
      border-radius: 12px; background: transparent; color: var(--fg-5B6478); cursor: pointer; font-family: inherit;
    }
    .who:hover, .who[aria-expanded='true'] { background: var(--bg-F7F9FE); border-color: var(--bd-E3E9F5); }
    .avatar { width: 34px; height: 34px; flex: none; border-radius: 50%; background: var(--bg-EFF4FF); border: 1px solid var(--bd-C7D5F7); color: var(--fg-061262); display: grid; place-items: center; font: 600 12.5px/1 'IBM Plex Sans', sans-serif; }
    .avatar.lg { width: 40px; height: 40px; font-size: 14px; }
    .who-text { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; text-align: left; }
    .who-name { font: 600 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); white-space: nowrap; }
    .who-id { font: 500 11px/14px 'IBM Plex Mono', monospace; color: var(--fg-5B6478); }
    .email { font: 400 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); overflow: hidden; text-overflow: ellipsis; max-width: 190px; }
    .menu {
      position: absolute; right: 0; top: calc(100% + 8px); z-index: 960; width: 280px; padding: 6px;
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-E5E7EB); border-radius: 12px; box-shadow: 0 16px 40px -16px rgba(6,18,98, .35);
      animation: menuIn .14s cubic-bezier(.2, .8, .2, 1) both;
    }
    .menu-head { display: flex; align-items: center; gap: 10px; padding: 8px 10px 12px; margin-bottom: 4px; border-bottom: 1px solid var(--bd-EEF1F6); }
    .item {
      width: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent;
      font: 500 13.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); text-decoration: none; cursor: pointer; text-align: left;
    }
    .item:hover { background: var(--bg-F7F9FE); text-decoration: none; color: var(--fg-061262); }
    .item app-icon { color: var(--fg-5B6478); }
    .step { margin-left: auto; font: 500 11.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .mono-txt { font-family: 'IBM Plex Mono', monospace; }
    .sep { height: 1px; margin: 4px 0; background: var(--bg-EEF1F6); }
    .danger, .danger app-icon { color: var(--fg-B42318); }
    .danger:hover { background: var(--bg-FEF3F2); color: var(--fg-B42318); }
    @keyframes menuIn { from { opacity: 0; transform: translateY(-4px); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBar {
  readonly guest = input(false, { transform: booleanAttribute });
  readonly guestMode = input<'login' | 'register'>('register');

  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);
  private readonly assistant = inject(Assistant);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly menu = signal(false);
  protected readonly copied = signal(false);

  protected outside(e: Event) {
    if (!this.host.querySelector('.account')?.contains(e.target as Node)) this.menu.set(false);
  }

  protected copyId() {
    void navigator.clipboard?.writeText(this.store.appId());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected logout() {
    this.menu.set(false);
    this.store.logout();
    this.assistant.clear();
    void this.router.navigateByUrl('/login');
  }

  protected readonly vals = computed(() => {
    const g = this.guest();
    const login = this.guestMode() === 'login';
    return {
      guest: g,
      signedIn: !g && this.store.signedIn(),
      guestNote: login ? 'Hesabınız yok mu?' : 'Zaten hesabınız var mı?',
      guestAction: login ? 'Kayıt olun' : 'Giriş yapın',
      guestHref: login ? '/register' : '/login',
    };
  });
}
