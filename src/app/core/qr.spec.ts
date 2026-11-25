import { qrMatrix, qrPath } from './qr';

describe('QR code', () => {
  // Checked on 2026-11-17 by decoding codes of 1 to 213 bytes (versions 1–10) with an independent
  // reader (jsQR); this snapshot of one of them guards the generator against later edits.
  it('draws the same symbol for a known text', () => {
    const rows = qrMatrix('https://x.io').map((r) => r.map((b) => (b ? '#' : '.')).join(''));
    expect(rows).toEqual([
      '#######.#####.#######',
      '#.....#..##.#.#.....#',
      '#.###.#..####.#.###.#',
      '#.###.#.#.....#.###.#',
      '#.###.#.#####.#.###.#',
      '#.....#.#.#.#.#.....#',
      '#######.#.#.#.#######',
      '........#.#..........',
      '#...#.####..######..#',
      '###.#...#.#.#...###..',
      '.#..#.####..######.#.',
      '.#.#.#.##..###.......',
      '.#.#.##.#.##...###.#.',
      '........#...##..####.',
      '#######.##.#...###.#.',
      '#.....#..#..#..#.....',
      '#.###.#.#.##.#..##...',
      '#.###.#..#.....##.###',
      '#.###.#..#....####...',
      '#.....#...#..#.......',
      '#######.#....#...#..#',
    ]);
  });

  it('grows with the text and refuses what does not fit', () => {
    expect(qrMatrix('a').length).toBe(21);
    expect(qrMatrix('x'.repeat(62)).length).toBe(33); // version 4
    expect(qrMatrix('x'.repeat(63)).length).toBe(37); // version 5
    expect(qrMatrix('x'.repeat(213)).length).toBe(57); // version 10
    expect(() => qrMatrix('x'.repeat(214))).toThrow();
  });

  it('turns the symbol into one path with a quiet zone', () => {
    const p = qrPath(qrMatrix('a'));
    expect(p.size).toBe(29);
    expect(p.d.startsWith('M4 4h7v1h-7z')).toBe(true);
  });
});
