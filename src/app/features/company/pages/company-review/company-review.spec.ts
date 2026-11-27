import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApplicationStore } from '@core/state/application.store';
import { StepPage } from '@layout/step-page';
import { CompanyReviewPage } from './company-review';

/** The page frame without its header, stepper and side panel. */
@Component({ selector: 'app-step-page', template: '<ng-content />' })
class FrameStub {
  readonly step = input<number>();
  readonly part = input<number>();
  readonly parts = input<number>();
  readonly sub = input<string>();
  readonly ctx = input<string>();
  readonly label = input<string>();
  readonly width = input<number>();
}

const APP = {
  id: 'DS-26-00000001',
  stage: 'review',
  marks: {},
  founder: { firstName: 'Ayşe', lastName: 'Kaya', nationality: 'Almanya' },
  company: { brand: 'Lumora', logo: '', nace: [], suggestedNace: [], capital: 250000 },
  contact: { email: 'ayse@example.test', phone: '+49 151 2345 6700', address: 'Hauptstr. 1', postalCode: '10115', country: 'Almanya' },
  funding: 'own-abroad',
};

/** Only what D-1c reads from the store; no API behind it. */
function fakeStore() {
  return {
    app: signal(APP), busy: signal(false), error: signal(null), fieldErrors: signal({}), reference: signal(null), evaluationReference: signal(null),
    stage: signal('review'), founderType: signal('foreign'), title: signal(''), fullTitle: signal(''), signedIn: signal(true),
    clearError: () => undefined, loadReference: async () => undefined, loadEvaluationReference: async () => undefined,
    updateReview: async () => true, submitReview: async () => true,
  };
}

describe('D-1c company form', () => {
  it('opens a left-column editor right under its row, focuses it, and gives focus back on close', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApplicationStore, useValue: fakeStore() }] });
    TestBed.overrideComponent(CompanyReviewPage, { remove: { imports: [StepPage] }, add: { imports: [FrameStub] } });
    const fixture = TestBed.createComponent(CompanyReviewPage);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    // "Faaliyet" is the third row: the left column of the second line.
    const pencil = el.querySelector<HTMLButtonElement>('[aria-label="Faaliyet bilgisini düzelt"]')!;
    const row = pencil.closest('.row')!;
    expect([...el.querySelectorAll('.rows > .row')].indexOf(row)).toBe(2);
    pencil.click();
    await fixture.whenStable();

    const slot = row.nextElementSibling!;
    expect(slot.classList).toContain('slot');
    expect(slot.querySelector('#rv-nace')).not.toBeNull();
    expect(el.querySelectorAll('.slot').length).toBe(1);
    expect(el.querySelector('.rows')!.lastElementChild).not.toBe(slot);
    expect(pencil.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.id).toBe('rv-nace');

    [...slot.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Kapat')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.slot')).toBeNull();
    expect(document.activeElement).toBe(pencil);
    fixture.nativeElement.remove();
  });
});
