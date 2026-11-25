/**
 * QR Code generator, written for the phone hand-off link on the identity step (D-2a) so that the
 * portal needs no third-party package for it. Byte mode, error correction level M, versions 1–10
 * (up to 213 bytes of UTF-8), which is ample for a URL. Follows ISO/IEC 18004: data and
 * Reed–Solomon codewords interleaved, the eight masks scored and the lowest penalty kept.
 * `qrMatrix(text)[row][column]` is true for a dark module; the quiet zone is not included.
 */

/** Level M per version: error-correction codewords per block, then (blocks, data codewords) for the two block groups. */
const BLOCKS: [ec: number, n1: number, d1: number, n2: number, d2: number][] = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];
/** Centres of the alignment patterns per version. */
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Reed–Solomon remainder of `data` for `n` error-correction codewords. */
function errorCodewords(data: number[], n: number): number[] {
  // Generator polynomial (x - a^0)(x - a^1)…(x - a^(n-1)), highest power first, leading 1 dropped.
  const gen = new Array<number>(n).fill(0);
  gen[n - 1] = 1;
  for (let i = 0, root = 1; i < n; i++, root = mul(root, 2)) {
    for (let j = 0; j < n; j++) {
      gen[j] = mul(gen[j], root);
      if (j + 1 < n) gen[j] ^= gen[j + 1];
    }
  }
  const rem = new Array<number>(n).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift()!;
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j], f);
  }
  return rem;
}

const dataCodewords = (v: number) => BLOCKS[v - 1][1] * BLOCKS[v - 1][2] + BLOCKS[v - 1][3] * BLOCKS[v - 1][4];

/** All codewords of the symbol, in the order they are placed. */
function codewords(bytes: Uint8Array, v: number): number[] {
  const total = dataCodewords(v);
  const bits: number[] = [];
  const push = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, total * 8 - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < total; pad ^= 0xec ^ 0x11) data.push(pad);

  const [ec, n1, d1, n2, d2] = BLOCKS[v - 1];
  const blocks: number[][] = [];
  const ecs: number[][] = [];
  for (let i = 0, at = 0; i < n1 + n2; i++) {
    const len = i < n1 ? d1 : d2;
    const block = data.slice(at, at + len);
    at += len;
    blocks.push(block);
    ecs.push(errorCodewords(block, ec));
  }
  const out: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Penalty score of a finished symbol (the four rules of the standard). */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const lines: boolean[][] = [...m, ...m.map((_, x) => m.map((row) => row[x]))];
  const finder = [true, false, true, true, true, false, true];
  for (const line of lines) {
    // Rule 1: five or more modules of one colour in a row.
    for (let i = 0, run = 1; i < n; i++, run++) {
      if (i + 1 === n || line[i + 1] !== line[i]) {
        if (run >= 5) score += run - 2;
        run = 0;
      }
    }
    // Rule 3: a finder-like 1:1:3:1:1 pattern with four light modules on either side.
    for (let i = 0; i + 7 <= n; i++) {
      if (!finder.every((d, k) => line[i + k] === d)) continue;
      const light = (from: number) => [0, 1, 2, 3].every((k) => from + k < 0 || from + k >= n || !line[from + k]);
      if (light(i - 4) || light(i + 7)) score += 40;
    }
  }
  // Rule 2: 2×2 blocks of one colour.
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  // Rule 4: how far the share of dark modules is from one half.
  const dark = m.reduce((a, row) => a + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
  return score;
}

/** The symbol for `text` as rows of modules (true = dark). Throws if the text needs more than version 10. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  while (v <= 10 && bytes.length > dataCodewords(v) - (v < 10 ? 2 : 3)) v++;
  if (v > 10) throw new Error('QR: text too long');
  const n = 17 + 4 * v;
  const mod = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fixed = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    mod[y][x] = dark;
    fixed[y][x] = true;
  };

  // Timing patterns, then the three finders with their separators, then alignment patterns.
  for (let i = 0; i < n; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const al = ALIGN[v - 1];
  for (const cy of al) {
    for (const cx of al) {
      const onFinder = (cx === 6 && cy === 6) || (cx === 6 && cy === n - 7) || (cx === n - 7 && cy === 6);
      if (onFinder) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  /** Format information (level M and the mask), written twice; also reserves those modules. */
  const format = (mask: number) => {
    const data = mask; // level M is 00 in the two leading bits
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true); // the module that is always dark
  };
  format(0);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Data: two-module columns from the right edge, alternately upwards and downwards, skipping the timing column.
  const cw = codewords(bytes, v);
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? n - 1 - vert : vert;
        if (fixed[y][x]) continue;
        if (i < cw.length * 8) mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }

  const flip = (mask: number) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixed[y][x] && MASKS[mask](x, y)) mod[y][x] = !mod[y][x];
  };
  let best = 0;
  let low = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    flip(mask);
    format(mask);
    const p = penalty(mod);
    if (p < low) {
      low = p;
      best = mask;
    }
    flip(mask); // masking is its own inverse
  }
  flip(best);
  format(best);
  return mod;
}

/** One SVG path for the dark modules, in module units, with `quiet` light modules around the symbol. */
export function qrPath(matrix: boolean[][], quiet = 4): { d: string; size: number } {
  let d = '';
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  return { d, size: matrix.length + quiet * 2 };
}
