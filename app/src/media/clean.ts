// Pure-TS JPEG metadata cleaner and verifier (SPEC-MEDIA 1.3, MEDIA-1/2/3). No native code, so it
// runs in Expo Go, on Android and on the web.
//
// cleanImage copies a JPEG segment by segment. It keeps SOI, APP0 JFIF (without a thumbnail), the
// image tables (DQT, SOFn, DHT, DAC, DRI), every scan and EOI. A metadata segment (APPn, COM)
// survives only if EVERY field group it carries is `keep` in the policy; with the default policy
// that is only the APP2 ICC colour profile. Unknown segments are always dropped, and anything after
// EOI (MPF secondary images, vendor trailers) is cut off.
//
// verifyClean parses the result again and fails closed with ApiError('META_<GROUP>') if any group
// that isn't `keep` is still present. A file it can't parse fails with 'EXIF'. Error messages
// never carry bytes or field values (CLAUDE.md rule 2).
import { ApiError, type ApiErrorCode } from '../api/HearthApi';
import { MEDIA_POLICY, type FieldGroup, type MediaPolicy } from './policy';

/** Order in which a surviving group is reported: the most sensitive first. */
const PRIORITY: FieldGroup[] = ['location', 'faces', 'makernote', 'camera', 'software', 'datetime', 'orientation', 'xmp', 'icc', 'other'];

// Markers that are image structure, never metadata: SOF0-15 (minus DHT C4, JPG C8, DAC CC, which are
// listed on their own), DHT, DAC, DQT, DRI.
const STRUCTURE = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf, 0xc4, 0xcc, 0xdb, 0xdd]);
const SOS = 0xda;
const EOI = 0xd9;

const fail = (): never => { throw new ApiError('EXIF', 'unreadable image'); };

const startsWith = (p: Uint8Array, s: string): boolean => {
  if (p.length < s.length) return false;
  for (let i = 0; i < s.length; i++) if (p[i] !== s.charCodeAt(i)) return false;
  return true;
};

function includes(p: Uint8Array, s: string): boolean {
  const first = s.charCodeAt(0);
  outer: for (let i = 0; i + s.length <= p.length; i++) {
    if (p[i] !== first) continue;
    for (let j = 1; j < s.length; j++) if (p[i + j] !== s.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

interface Part { marker: number; /** whole segment incl. FF marker and length, or the scan's entropy bytes */ bytes: Uint8Array; payload: Uint8Array }

/** Splits a JPEG into marker segments and entropy-coded data. Throws 'EXIF' on anything malformed. */
function parse(b: Uint8Array): { parts: Part[]; trailing: boolean } {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) fail();
  const parts: Part[] = [];
  let i = 2;
  for (;;) {
    if (i + 1 >= b.length || b[i] !== 0xff) fail();
    const marker = b[i + 1]!;
    if (marker === 0xff) { i += 1; continue; } // fill byte before a marker
    if (marker === EOI) return { parts, trailing: i + 2 < b.length };
    if (i + 4 > b.length) fail();
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2 || i + 2 + len > b.length) fail();
    parts.push({ marker, bytes: b.subarray(i, i + 2 + len), payload: b.subarray(i + 4, i + 2 + len) });
    i += 2 + len;
    if (marker !== SOS) continue;
    // Entropy-coded data runs to the next marker that isn't a stuffed 00 or a restart (D0-D7).
    const start = i;
    while (i + 1 < b.length) {
      if (b[i] === 0xff) {
        const n = b[i + 1]!;
        if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7) && n !== 0xff) break;
      }
      i += 1;
    }
    if (i + 1 >= b.length) fail(); // no EOI
    parts.push({ marker: -1, bytes: b.subarray(start, i), payload: b.subarray(start, i) });
  }
}

// --- Exif (TIFF) field groups -------------------------------------------------------------------
const DATETIME_TAGS = new Set([0x0132, 0x9003, 0x9004, 0x9010, 0x9011, 0x9012, 0x9290, 0x9291, 0x9292]);
const CAMERA_TAGS = new Set([
  0x010f, 0x0110, // Make, Model
  0x829a, 0x829d, 0x8822, 0x8824, 0x8827, 0x8828, 0x8830, 0x8831, 0x8832, 0x8833, 0x8834, 0x8835, // exposure, ISO
  0x9201, 0x9202, 0x9203, 0x9204, 0x9205, 0x9206, 0x9207, 0x9208, 0x9209, 0x920a, // shutter, aperture, flash, focal
  0xa20e, 0xa20f, 0xa210, 0xa215, 0xa217, 0xa300, 0xa301, 0xa302,
  0xa401, 0xa402, 0xa403, 0xa404, 0xa405, 0xa406, 0xa407, 0xa408, 0xa409, 0xa40a, 0xa40b, 0xa40c,
  0xa420, 0xa430, 0xa431, 0xa432, 0xa433, 0xa434, 0xa435, // ImageUniqueID, owner, body serial, lens, lens serial
]);
const SOFTWARE_TAGS = new Set([0x0131, 0x013c]);
const FACES_TAGS = new Set([0x9214]); // SubjectArea
const POINTERS = new Set([0x8769, 0x8825, 0xa005]);

function exifTagGroup(ifd: 'ifd0' | 'exif' | 'gps' | 'interop' | 'ifd1', tag: number): FieldGroup {
  if (ifd === 'gps') return 'location';
  if (ifd === 'ifd1') return 'other'; // embedded thumbnail
  if (tag === 0x0112) return 'orientation';
  if (tag === 0x927c) return 'makernote';
  if (DATETIME_TAGS.has(tag)) return 'datetime';
  if (CAMERA_TAGS.has(tag)) return 'camera';
  if (SOFTWARE_TAGS.has(tag)) return 'software';
  if (FACES_TAGS.has(tag)) return 'faces';
  return 'other';
}

/** Groups in an Exif APP1 payload ("Exif\0\0" + TIFF). Unreadable structure counts as `other`. */
function exifGroups(payload: Uint8Array, out: Set<FieldGroup>): void {
  const t = payload.subarray(6);
  if (t.length < 8) { out.add('other'); return; }
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) { out.add('other'); return; }
  const u16 = (o: number) => (le ? t[o]! | (t[o + 1]! << 8) : (t[o]! << 8) | t[o + 1]!);
  const u32 = (o: number) => (le ? (t[o]! | (t[o + 1]! << 8) | (t[o + 2]! << 16)) + t[o + 3]! * 2 ** 24 : t[o]! * 2 ** 24 + ((t[o + 1]! << 16) | (t[o + 2]! << 8) | t[o + 3]!));
  const seen = new Set<number>();
  const walk = (off: number, kind: 'ifd0' | 'exif' | 'gps' | 'interop' | 'ifd1'): void => {
    if (off < 8 || off + 2 > t.length || seen.has(off)) { if (off !== 0) out.add('other'); return; }
    seen.add(off);
    const n = u16(off);
    if (off + 2 + n * 12 + 4 > t.length) { out.add('other'); return; }
    for (let k = 0; k < n; k++) {
      const e = off + 2 + k * 12;
      const tag = u16(e);
      if (POINTERS.has(tag) && kind !== 'gps') {
        walk(u32(e + 8), tag === 0x8769 ? 'exif' : tag === 0x8825 ? 'gps' : 'interop');
        if (tag === 0x8825) out.add('location'); // a GPS pointer alone is location
      } else {
        out.add(exifTagGroup(kind, tag));
      }
    }
    if (kind === 'ifd0') { const next = u32(off + 2 + n * 12); if (next) walk(next, 'ifd1'); }
  };
  walk(u32(4), 'ifd0');
}

/** Field groups carried by one metadata segment. */
function segmentGroups(marker: number, p: Uint8Array): Set<FieldGroup> {
  const g = new Set<FieldGroup>();
  if (marker === 0xe1 && startsWith(p, 'Exif\0\0')) {
    exifGroups(p, g);
  } else if (marker === 0xe1 && (startsWith(p, 'http://ns.adobe.com/xap/1.0/\0') || startsWith(p, 'http://ns.adobe.com/xmp/extension/\0'))) {
    g.add('xmp');
    if (['GPS', 'photoshop:City', 'photoshop:State', 'photoshop:Country', 'Iptc4xmpCore:Location', 'LocationCreated', 'LocationShown'].some((s) => includes(p, s))) g.add('location');
    if (['mwg-rs:Regions', 'MP:RegionInfo', 'MPRI:Regions'].some((s) => includes(p, s))) g.add('faces');
  } else if (marker === 0xe2 && startsWith(p, 'ICC_PROFILE\0')) {
    g.add('icc');
  } else {
    g.add('other'); // IPTC (APP13), COM, MPF, unknown APPn, non-JFIF APP0
    if (marker === 0xed) {
      // IPTC place records 2:90 city, 2:92 sublocation, 2:95 province, 2:101 country
      for (let i = 0; i + 2 < p.length; i++) if (p[i] === 0x1c && p[i + 1] === 0x02 && [0x5a, 0x5c, 0x5f, 0x65].includes(p[i + 2]!)) { g.add('location'); break; }
    }
  }
  return g;
}

/** APP0 JFIF with no embedded thumbnail: structure, always kept. */
const isPlainJfif = (marker: number, p: Uint8Array) => marker === 0xe0 && startsWith(p, 'JFIF\0') && p.length >= 14 && p[12] === 0 && p[13] === 0;

const isMetadata = (marker: number) => (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;

/** Copy of the JPEG with every segment the policy doesn't keep removed (MEDIA-1, MEDIA-2). */
export function cleanImage(bytes: Uint8Array, policy: MediaPolicy = MEDIA_POLICY): Uint8Array {
  const { parts } = parse(bytes);
  const keep: Uint8Array[] = [];
  for (const part of parts) {
    if (part.marker === -1 || part.marker === SOS || STRUCTURE.has(part.marker) || isPlainJfif(part.marker, part.payload)) { keep.push(part.bytes); continue; }
    if (!isMetadata(part.marker)) continue; // unknown marker: drop
    const groups = segmentGroups(part.marker, part.payload);
    if ([...groups].every((g) => policy.fields[g] === 'keep')) keep.push(part.bytes);
  }
  const size = 4 + keep.reduce((n, k) => n + k.length, 0);
  const out = new Uint8Array(size);
  out[0] = 0xff; out[1] = 0xd8;
  let at = 2;
  for (const k of keep) { out.set(k, at); at += k.length; }
  out[at] = 0xff; out[at + 1] = EOI;
  return out;
}

/** Fails closed with META_<GROUP> if any group that isn't `keep` is still in the file (MEDIA-3). */
export function verifyClean(bytes: Uint8Array, policy: MediaPolicy = MEDIA_POLICY): void {
  const { parts, trailing } = parse(bytes);
  const found = new Set<FieldGroup>();
  if (trailing) found.add('other');
  for (const part of parts) {
    if (part.marker === -1 || part.marker === SOS || STRUCTURE.has(part.marker) || isPlainJfif(part.marker, part.payload)) continue;
    for (const g of isMetadata(part.marker) ? segmentGroups(part.marker, part.payload) : ['other' as const]) found.add(g);
  }
  const bad = PRIORITY.find((g) => found.has(g) && policy.fields[g] !== 'keep');
  if (bad) throw new ApiError(`META_${bad.toUpperCase()}` as ApiErrorCode, 'metadata survived cleaning');
}
