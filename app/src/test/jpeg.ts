// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Small synthetic JPEG builders for the media-policy tests (MEDIA-1..3). No real photos:
// every block is built byte by byte so a test can name exactly what is in the file.

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** One marker segment: FF, marker, 2-byte length (payload + 2), payload. */
export function seg(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...u16(payload.length + 2), ...payload];
}

type Entry = { tag: number; type: 1 | 2 | 3 | 4 | 7; count: number; value: number[] }; // BYTE, ASCII, SHORT, LONG, UNDEFINED

/** A big-endian TIFF IFD at `offset`; values over 4 bytes go after the IFD. Returns its bytes. */
function ifd(entries: Entry[], offset: number): number[] {
  const head = 2 + entries.length * 12 + 4;
  let extra: number[] = [];
  const out: number[] = [...u16(entries.length)];
  for (const e of entries) {
    const count = e.type === 3 || e.type === 4 ? e.count : e.value.length; // ASCII/BYTE/UNDEFINED: byte count
    out.push(...u16(e.tag), ...u16(e.type), ...u32(count));
    if (e.value.length <= 4) out.push(...e.value, ...new Array(4 - e.value.length).fill(0));
    else { out.push(...u32(offset + head + extra.length)); extra = [...extra, ...e.value, ...(e.value.length % 2 ? [0] : [])]; }
  }
  out.push(0, 0, 0, 0);
  return [...out, ...extra];
}

/** APP1 Exif built from IFD0 entries plus optional Exif and GPS sub-IFDs. */
function exifApp1(ifd0: Entry[], exifIfd: Entry[] | null, gpsIfd: Entry[] | null): number[] {
  // Lay out: TIFF header (8) | IFD0 | ExifIFD | GPS IFD. Pointers are patched in after sizing.
  const ptrs: Entry[] = [];
  if (exifIfd) ptrs.push({ tag: 0x8769, type: 4, count: 1, value: u32(0) });
  if (gpsIfd) ptrs.push({ tag: 0x8825, type: 4, count: 1, value: u32(0) });
  const all0 = [...ifd0, ...ptrs].sort((a, b) => a.tag - b.tag);
  const size0 = ifd(all0, 8).length;
  const exifAt = 8 + size0;
  const exifBytes = exifIfd ? ifd(exifIfd, exifAt) : [];
  const gpsAt = exifAt + exifBytes.length;
  const gpsBytes = gpsIfd ? ifd(gpsIfd, gpsAt) : [];
  for (const p of all0) {
    if (p.tag === 0x8769) p.value = u32(exifAt);
    if (p.tag === 0x8825) p.value = u32(gpsAt);
  }
  const tiff = [...ascii('MM'), 0x00, 0x2a, ...u32(8), ...ifd(all0, 8), ...exifBytes, ...gpsBytes];
  return seg(0xe1, [...ascii('Exif'), 0, 0, ...tiff]);
}

const str = (s: string): number[] => [...ascii(s), 0];

export const APP0_JFIF = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
/** APP2 ICC profile (Display P3), as iOS writes it. */
export const APP2_ICC = seg(0xe2, [...str('ICC_PROFILE'), 1, 1, ...ascii('appl mntr RGB XYZ Display P3 desc'), ...new Array(40).fill(0x2a)]);

/** What UIImage.jpegData writes (MEDIA-1): Exif with only ColorSpace and pixel size. */
export const APP1_IOS_EXIF = exifApp1([], [
  { tag: 0xa001, type: 3, count: 1, value: u16(1) },
  { tag: 0xa002, type: 4, count: 1, value: u32(2048) },
  { tag: 0xa003, type: 4, count: 1, value: u32(1536) },
], null);

/** An original's full Exif (MEDIA-2): make, model, software, serial, MakerNote with Live content ID, GPS. */
export const APP1_FULL_EXIF = exifApp1([
  { tag: 0x010f, type: 2, count: 6, value: str('Apple') },
  { tag: 0x0110, type: 2, count: 18, value: str('iPhone 15 Pro Max') },
  { tag: 0x0112, type: 3, count: 1, value: u16(6) },
  { tag: 0x0131, type: 2, count: 9, value: str('iOS 26.0') },
], [
  { tag: 0x9003, type: 2, count: 20, value: str('2026:10:19 09:41:00') },
  { tag: 0x927c, type: 7, count: 34, value: [...str('Apple iOS'), ...ascii('CONTENTID-5F1E2D3C-LIVE'), 0, 0] },
  { tag: 0xa431, type: 2, count: 13, value: str('SERIALC39XYZ') },
], [
  { tag: 0x0001, type: 2, count: 2, value: str('N') },
  { tag: 0x0002, type: 2, count: 16, value: str('GPSLAT38.3498N') },
]);

export const APP1_XMP_FACES = seg(0xe1, [...str('http://ns.adobe.com/xap/1.0/'),
  ...ascii('<x:xmpmeta><mwg-rs:Regions>FACEBOX Mia</mwg-rs:Regions><photoshop:City>XMPCITY Charleston</photoshop:City></x:xmpmeta>')]);
export const APP13_IPTC = seg(0xed, [...str('Photoshop 3.0'), ...ascii('8BIM'), 0x04, 0x04, ...ascii('IPTCPLACE Charleston WV')]);
export const COM = seg(0xfe, ascii('COMMENT Mia at the park'));
export const APP15_UNKNOWN = seg(0xef, ascii('UNKNOWNAPP15 vendor blob'));

/** Strings that must never survive cleaning under the default policy (checked on raw bytes). */
export const SECRETS = ['Apple', 'iPhone', 'iOS 26', 'SERIALC39XYZ', 'CONTENTID', 'GPSLAT', 'FACEBOX', 'XMPCITY', 'IPTCPLACE', 'COMMENT Mia', 'UNKNOWNAPP15'];

/** Image tables and scan: DQT, SOF0, DHT, SOS, entropy data (with a stuffed FF00), EOI. */
export function imageData(width = 2048, height = 1536, scanBytes = 64): number[] {
  const dqt = seg(0xdb, [0x00, ...new Array(64).fill(1)]);
  const sof = seg(0xc0, [8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const dht = seg(0xc4, [0x00, 0, 1, ...new Array(14).fill(0), 0x00]);
  const sos = seg(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);
  const scan = new Array(scanBytes).fill(0).map((_, i) => (i * 37 + 11) & 0xfe);
  scan[10] = 0xff; scan[11] = 0x00; // byte stuffing inside the scan
  return [...dqt, ...sof, ...dht, ...sos, ...scan, 0xff, 0xd9];
}

export function jpeg(...blocks: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...blocks.flat()]);
}

/** iOS expo-image-manipulator output: JFIF, Exif (ColorSpace + size), ICC, image. */
export function iosReencode(width = 2048, height = 1536, scanBytes = 64): Uint8Array {
  return jpeg(APP0_JFIF, APP1_IOS_EXIF, APP2_ICC, imageData(width, height, scanBytes));
}

/** Every kind of metadata block at once (MEDIA-2). */
export function everything(): Uint8Array {
  return jpeg(APP0_JFIF, APP1_FULL_EXIF, APP1_XMP_FACES, APP2_ICC, APP13_IPTC, APP15_UNKNOWN, COM, imageData());
}

export interface Segment { marker: number; payload: Uint8Array }

/** Segments before the scan, and the bytes from SOS to the end. Throws on a malformed file. */
export function segments(b: Uint8Array): { head: Segment[]; scan: Uint8Array } {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG');
  const head: Segment[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error(`bad marker at ${i}`);
    const marker = b[i + 1]!;
    if (marker === 0xda) return { head, scan: b.subarray(i) };
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    head.push({ marker, payload: b.subarray(i + 4, i + 2 + len) });
    i += 2 + len;
  }
  throw new Error('no scan');
}

export function contains(b: Uint8Array, s: string): boolean {
  const n = ascii(s);
  outer: for (let i = 0; i + n.length <= b.length; i++) {
    for (let j = 0; j < n.length; j++) if (b[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

export const startsWith = (p: Uint8Array, s: string): boolean => String.fromCharCode(...p.subarray(0, s.length)) === s;
