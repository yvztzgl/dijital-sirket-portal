import { Application, FEES } from '@core/models/models';
import { feeLines, feeTotal } from './fees';

const app = (extra: Partial<Application>) => extra as Application;
const server = [
  { code: 'a', label: 'A', amount: 100 },
  { code: 'b', label: 'B', amount: 50.5 },
];

describe('fees', () => {
  it('feeLines: the server\'s lines, else the portal\'s', () => {
    expect(feeLines(app({ fees: server }))).toBe(server);
    expect(feeLines(app({}))).toBe(FEES);
    expect(feeLines(null)).toBe(FEES);
  });

  it('feeTotal: the started payment\'s amount, else the sum of the lines', () => {
    expect(feeTotal(app({ fees: server }))).toBe(150.5);
    expect(feeTotal(null)).toBe(12_750);
    expect(feeTotal(app({ fees: server, payment: { holder: '', last4: '', amount: 99 } }))).toBe(99);
  });
});
