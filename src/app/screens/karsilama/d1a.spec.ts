import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApplicationStore } from '../../core/application.store';
import { EvaluationAnswers, EvaluationReference } from '../../core/models';
import { StepPage } from '../../shared/step-page';
import { ScreenD1a } from './d1a';

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

const LIMITS = { deckMaxMb: 25, cvMaxMb: 5, deckMinPages: 3, deckMaxPages: 40, summaryMin: 50, summaryMax: 2000 };

/** Two groups, three activities; `linked: false` is an API built before `groupId`. */
function reference(linked: boolean): EvaluationReference {
  const g = (groupId: number) => (linked ? { groupId } : {});
  return {
    activityGroups: [{ id: 1, label: 'Yazılım ve BT' }, { id: 2, label: 'Finans ve Ödeme Hizmetleri' }],
    activities: [{ id: 3, label: 'Yapay Zekâ Odaklı Yazılım', ...g(1) }, { id: 11, label: 'ERP Yazılımı', ...g(1) }, { id: 40, label: 'Dijital Bankacılık', ...g(2) }],
    businessModels: [], revenueModels: [], productTypes: [], limits: LIMITS,
  };
}

/** Only what D-1a reads from the store; no API behind it. */
function fakeStore(ref: EvaluationReference) {
  return {
    app: signal({ id: 'DS-26-00000001', stage: 'verified', marks: {} }), busy: signal(false), error: signal(null), fieldErrors: signal({ activityId: ['Seçilen faaliyet alanı, seçilen faaliyet grubuna ait değildir.'] }),
    reference: signal(null), evaluationReference: signal(ref), stage: signal('verified'), founderType: signal('foreign'), title: signal(''), fullTitle: signal(''), signedIn: signal(true),
    clearError: () => undefined, loadReference: async () => undefined, loadEvaluationReference: async () => undefined,
  };
}

/** The screen's protected members the test drives, as the template does. */
interface D1aView {
  answers(): EvaluationAnswers;
  activityOptions(): { value: string; label: string }[];
  setChoice(key: 'activityGroupId' | 'activityId', value: string): void;
}

async function screen(linked: boolean) {
  const store = fakeStore(reference(linked));
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApplicationStore, useValue: store }] });
  TestBed.overrideComponent(ScreenD1a, { remove: { imports: [StepPage] }, add: { imports: [FrameStub] } });
  const fixture = TestBed.createComponent(ScreenD1a);
  await fixture.whenStable();
  return { d: fixture.componentInstance as unknown as D1aView, store };
}

const ids = (d: D1aView) => d.activityOptions().map((o) => o.value);

describe('D-1a activity group and activity', () => {
  it('a group narrows the activities, an activity brings its group, another group clears it', async () => {
    const { d, store } = await screen(true);
    expect(ids(d)).toEqual(['3', '11', '40']);

    // No group yet: all activities; picking one fills in its group.
    d.setChoice('activityId', '40');
    expect(d.answers()).toMatchObject({ activityGroupId: 2, activityId: 40 });
    expect(ids(d)).toEqual(['40']);

    // A group that does not hold it clears the activity and its error, and nothing else.
    d.setChoice('activityGroupId', '1');
    expect(d.answers()).toMatchObject({ activityGroupId: 1, activityId: null, summary: '' });
    expect(ids(d)).toEqual(['3', '11']);
    expect(store.fieldErrors()).toEqual({});

    // A group that holds it keeps it.
    d.setChoice('activityId', '11');
    d.setChoice('activityGroupId', '1');
    expect(d.answers()).toMatchObject({ activityGroupId: 1, activityId: 11 });
  });

  it('without groupId from the API nothing is filtered or linked', async () => {
    const { d } = await screen(false);
    d.setChoice('activityGroupId', '2');
    expect(ids(d)).toEqual(['3', '11', '40']);
    d.setChoice('activityId', '3');
    expect(d.answers()).toMatchObject({ activityGroupId: 2, activityId: 3 });
  });
});
