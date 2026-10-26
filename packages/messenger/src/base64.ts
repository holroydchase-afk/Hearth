// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
//
// Pure base64 (no atob/btoa: Hermes support for binary strings varies by version).
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < ALPHA.length; i++) t[ALPHA.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62; // tolerate base64url
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

export function toBase64(b: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!;
    out += ALPHA[n >> 18]! + ALPHA[(n >> 12) & 63]! + ALPHA[(n >> 6) & 63]! + ALPHA[n & 63]!;
  }
  const rest = b.length - i;
  if (rest === 1) {
    const n = b[i]! << 16;
    out += ALPHA[n >> 18]! + ALPHA[(n >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8);
    out += ALPHA[n >> 18]! + ALPHA[(n >> 12) & 63]! + ALPHA[(n >> 6) & 63]! + '=';
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[\s=]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = LOOKUP[clean.charCodeAt(i)]!;
    if (v < 0) throw new Error('invalid base64');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}
