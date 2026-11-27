import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApplicationStore } from '@core/state/application.store';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { Stage } from '@core/models/models';
import { DemoBar } from './demo-bar';

describe('DemoBar', () => {
  function render(available: boolean, stage: Stage) {
    TestBed.configureTestingModule({
      providers: [
        { provide: DemoServerApi, useValue: { available: computed(() => available) } },
        { provide: ApplicationStore, useValue: { stage: signal(stage), checkServerNow: () => Promise.resolve() } },
      ],
    });
    const fixture = TestBed.createComponent(DemoBar);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders nothing when demo mode is not available', () => {
    const el = render(false, 'titleChecking');
    expect(el.querySelector('section')).toBeNull();
  });

  it('shows the stage’s buttons when available', () => {
    const el = render(true, 'titleChecking');
    expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Rezerve et', 'Reddet']);
  });
});
