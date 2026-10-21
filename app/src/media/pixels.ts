// R15 photo helpers (SPEC-PHOTO-HELPERS): plain arithmetic on a small grayscale picture, on the phone.
// No trained model. dHash finds near-duplicates; the variance of the Laplacian scores sharpness.
// Nothing computed here is sent or stored (HELP-R2).

export interface Gray { width: number; height: number; data: Uint8Array }

/** Mean of each cell when the picture is shrunk to w×h (area average). */
function shrink(g: Gray, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    const y0 = Math.floor((cy * g.height) / h), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * g.height) / h));
    for (let cx = 0; cx < w; cx++) {
      const x0 = Math.floor((cx * g.width) / w), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * g.width) / w));
      let s = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += g.data[y * g.width + x]!;
      out[cy * w + cx] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** 64-bit difference hash: shrink to 9×8, one bit per horizontal neighbour pair (left brighter). */
export function dHash64(g: Gray): Uint8Array {
  const s = shrink(g, 9, 8);
  const out = new Uint8Array(8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) if (s[y * 9 + x]! > s[y * 9 + x + 1]!) out[y]! |= 1 << x;
  }
  return out;
}

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) for (let v = a[i]! ^ b[i]!; v; v &= v - 1) d++;
  return d;
}

/** Variance of the 4-neighbour Laplacian. Higher is sharper. */
export function sharpness(g: Gray): number {
  const { width: w, height: h, data: d } = g;
  let n = 0, sum = 0, sq = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = d[i - 1]! + d[i + 1]! + d[i - w]! + d[i + w]! - 4 * d[i]!;
      n++; sum += l; sq += l * l;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}

/** Mean brightness, 0..1. */
export function meanLuma(g: Gray): number {
  let s = 0;
  for (let i = 0; i < g.data.length; i++) s += g.data[i]!;
  return g.data.length ? s / g.data.length / 255 : 0;
}

/** HELP-BLUR-2: a dark photo (mean under 15%) is never called blurry. */
export const isDark = (g: Gray) => meanLuma(g) < 0.15;

/** HELP-DUP-3: at most this many differing bits counts as "almost the same". */
export const NEAR_DUPLICATE_BITS = 6;

/** Groups of near-duplicates (by index). In each, the sharpest is kept and the rest are set aside. */
export function nearDuplicateGroups(items: { hash: Uint8Array; sharpness: number }[]): { keep: number; setAside: number[] }[] {
  const parent = items.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hamming(items[i]!.hash, items[j]!.hash) <= NEAR_DUPLICATE_BITS) parent[root(j)] = root(i);
    }
  }
  const byRoot = new Map<number, number[]>();
  items.forEach((_, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), i]));
  const groups: { keep: number; setAside: number[] }[] = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    const keep = members.reduce((a, b) => (items[b]!.sharpness > items[a]!.sharpness ? b : a));
    groups.push({ keep, setAside: members.filter((i) => i !== keep) });
  }
  return groups;
}
