// Test fixtures for the video cleaner (VID-*): tiny but structurally real QuickTime / MP4 files, built box by
// box, carrying every kind of metadata a phone writes: iPhone's moov/meta location key, udta ©xyz, make, model and
// software, an XMP uuid box, a timed-metadata track whose samples hold a location, a timecode track, creation dates
// and a Samsung-style trailer after the last box. The "video" and "audio" samples are marked byte runs, so a test can
// check they come through byte-identical at the offsets the sample tables give.

const enc = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

const u32 = (n: number): Uint8Array => new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
const u64 = (n: number): Uint8Array => concat(u32(Math.floor(n / 2 ** 32)), u32(n >>> 0));
const u16 = (n: number): Uint8Array => new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);

/** A box: 32-bit size, 4-char type (latin1, so '©xyz' works), payload. */
export function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  return concat(u32(8 + body.length), enc(type), body);
}
const full = (type: string, version: number, ...payload: Uint8Array[]) => box(type, new Uint8Array([version, 0, 0, 0]), ...payload);

// What must never survive cleaning, anywhere in the file (mdat included).
export const VIDEO_SECRETS = [
  '+35.6895+139.6917', // ISO 6709 location (moov/meta, udta ©xyz, the timed-metadata samples)
  'com.apple.quicktime.location',
  'com.apple.quicktime.make',
  'iPhone 15 Pro', // model
  'Apple', // make
  '17.4.1', // software
  'xmpmeta', // XMP
  'SEFH', // Samsung trailer
  'TIMECODE', // timecode track samples
  'FaceRegion', // a face box in a track's own meta
  'appl', // the vendor in each sample description
  'H.264', // the compressor name
];

export const VIDEO_SAMPLE = enc('VIDEO-FRAME-0001-PICTURE-BYTES-01');
export const AUDIO_SAMPLE = enc('AUDIO-PCM-SAMPLE-SOUND-BYTES');
const META_SAMPLE = enc('\0\0\0\x1alocation+35.6895+139.6917/xx');
const TC_SAMPLE = enc('TIMECODE');

// QuickTime sample descriptions: vendor 'appl' at 12 and (pictures) the compressor name at 42, counted after the header.
const COMPRESSOR = concat(new Uint8Array([5]), enc('H.264'), new Uint8Array(26));
const VISUAL_ENTRY = box('avc1', new Uint8Array(8), u16(0), u16(0), enc('appl'), u32(0), u32(0), u16(1280), u16(720),
  u32(0x00480000), u32(0x00480000), u32(0), u16(1), COMPRESSOR, u16(24), u16(0xffff));
const SOUND_ENTRY = box('mp4a', new Uint8Array(8), u16(0), u16(0), enc('appl'), u16(2), u16(16), u16(0), u16(0), u32(44100 << 16 >>> 0));

/** The creation date written into mvhd, tkhd and mdhd (seconds since 1904). */
export const DATE_1904 = 0xe2a1b3c4;

interface Track { handler: string; samples: Uint8Array[]; co64?: boolean; extra?: Uint8Array[]; mdhdV1?: boolean }

function stbl(t: Track, offsets: number[]): Uint8Array {
  const sizes = t.samples.map((s) => s.length);
  return box('stbl',
    full('stsd', 0, u32(1), t.handler === 'vide' ? VISUAL_ENTRY : t.handler === 'soun' ? SOUND_ENTRY : box('mebx', new Uint8Array(16))),
    full('stts', 0, u32(1), u32(t.samples.length), u32(1)),
    full('stsc', 0, u32(1), u32(1), u32(1), u32(1)), // one sample per chunk
    full('stsz', 0, u32(0), u32(sizes.length), ...sizes.map(u32)),
    t.co64 ? full('co64', 0, u32(offsets.length), ...offsets.map(u64)) : full('stco', 0, u32(offsets.length), ...offsets.map(u32)));
}

function trak(t: Track, id: number, offsets: number[]): Uint8Array {
  const mhd = t.handler === 'vide' ? full('vmhd', 0, new Uint8Array(8)) : t.handler === 'soun' ? full('smhd', 0, new Uint8Array(4)) : full('nmhd', 0);
  const mdhd = t.mdhdV1
    ? full('mdhd', 1, u64(DATE_1904), u64(DATE_1904), u32(600), u64(600), u16(0x55c4), u16(0))
    : full('mdhd', 0, u32(DATE_1904), u32(DATE_1904), u32(600), u32(600), u16(0x55c4), u16(0));
  return box('trak',
    full('tkhd', 0, u32(DATE_1904), u32(DATE_1904), u32(id), u32(0), u32(600), new Uint8Array(60)),
    box('edts', full('elst', 0, u32(1), u32(600), u32(0), u32(0x00010000))),
    box('mdia',
      mdhd,
      full('hdlr', 0, u32(0), enc(t.handler), new Uint8Array(12), enc('Core Media\0')),
      box('minf', mhd, box('dinf', full('dref', 0, u32(1), full('url ', 0))), stbl(t, offsets))),
    ...(t.extra ?? []));
}

export interface Mp4Options {
  /** 'qt  ' (iPhone .mov) or 'isom' / 'mp42' (Android, transcoded). */
  brand?: string;
  /** moov before mdat ("fast start"), as Android cameras and web exports write it. */
  moovFirst?: boolean;
  /** Bytes after the last box (Samsung writes an SEF trailer there). */
  trailer?: Uint8Array;
  /** Use 64-bit chunk offsets in the metadata track. */
  co64?: boolean;
  /** Use a version-1 (64-bit dates) mvhd and mdhd. */
  v1?: boolean;
  /** Leave the phone's metadata out: just the A/V tracks, zero dates, nothing to strip. */
  bare?: boolean;
  /** Extra boxes appended inside moov. */
  moovExtra?: Uint8Array[];
}

/** An iPhone-like movie (or Android-like with options). Sample offsets are real. */
export function movie(o: Mp4Options = {}): Uint8Array {
  const tracks: Track[] = [
    { handler: 'vide', samples: [VIDEO_SAMPLE, VIDEO_SAMPLE], mdhdV1: o.v1,
      extra: o.bare ? [] : [box('meta', full('hdlr', 0, u32(0), enc('mdta'), new Uint8Array(12), enc('\0')), box('keys', enc('FaceRegion')))] },
    { handler: 'soun', samples: [AUDIO_SAMPLE] },
    ...(o.bare ? [] : [
      { handler: 'meta', samples: [META_SAMPLE, META_SAMPLE], co64: o.co64 },
      { handler: 'tmcd', samples: [TC_SAMPLE] },
    ]),
  ];
  const ftyp = box('ftyp', enc(o.brand ?? 'qt  '), u32(0), enc(o.brand ?? 'qt  '));
  const wide = box('wide');
  const payload = concat(...tracks.flatMap((t) => t.samples));
  const mdatHeader = 8;

  const mvhd = o.v1
    ? full('mvhd', 1, u64(o.bare ? 0 : DATE_1904), u64(o.bare ? 0 : DATE_1904), u32(600), u64(600), new Uint8Array(80))
    : full('mvhd', 0, u32(o.bare ? 0 : DATE_1904), u32(o.bare ? 0 : DATE_1904), u32(600), u32(600), new Uint8Array(80));
  const metaBoxes = o.bare ? [] : [
    box('udta', box('©xyz', u16(18), u16(0x15c7), enc('+35.6895+139.6917/')), box('©mak', u16(5), u16(0), enc('Apple')),
        box('©mod', u16(13), u16(0), enc('iPhone 15 Pro')), box('©swr', u16(6), u16(0), enc('17.4.1'))),
    box('meta', full('hdlr', 0, u32(0), enc('mdta'), new Uint8Array(12), enc('\0')),
        full('keys', 0, u32(2), box('mdta', enc('com.apple.quicktime.location.ISO6709')), box('mdta', enc('com.apple.quicktime.make'))),
        box('ilst', box('\0\0\0\x01', box('data', u32(1), u32(0), enc('+35.6895+139.6917+040.000/'))))),
    box('uuid', enc('BE7ACFCB97A942E89C71999491E3AFAC'), enc('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>')),
  ];
  const buildMoov = (base: number) => {
    let at = base;
    const offs = tracks.map((t) => t.samples.map((s) => { const o2 = at; at += s.length; return o2; }));
    return box('moov', mvhd, ...tracks.map((t, i) => trak(t, i + 1, offs[i]!)), ...metaBoxes, ...(o.moovExtra ?? []));
  };
  const moovSize = buildMoov(0).length;
  const head = concat(ftyp, wide);
  const out = o.moovFirst
    ? concat(head, buildMoov(head.length + moovSize + mdatHeader), box('mdat', payload))
    : concat(head, box('mdat', payload), buildMoov(head.length + mdatHeader));
  return o.trailer ? concat(out, o.trailer) : out;
}

/** Samsung's SEF trailer: not a box, just appended bytes ending in "SEFT". */
export const SAMSUNG_TRAILER = concat(enc('SEFH'), u32(0x6b), enc('location +35.6895+139.6917 '), enc('SEFT'));

export function contains(b: Uint8Array, s: string): boolean {
  const n = enc(s);
  outer: for (let i = 0; i + n.length <= b.length; i++) {
    for (let j = 0; j < n.length; j++) if (b[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** Top-level box types, in order. */
export function topLevel(b: Uint8Array): string[] {
  const out: string[] = [];
  let i = 0;
  while (i + 8 <= b.length) {
    const size = ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
    out.push(String.fromCharCode(...b.subarray(i + 4, i + 8)));
    if (size < 8) break;
    i += size;
  }
  return out;
}

/** Offsets of every occurrence of a byte run. */
export function indexesOf(b: Uint8Array, needle: Uint8Array): number[] {
  const out: number[] = [];
  outer: for (let i = 0; i + needle.length <= b.length; i++) {
    for (let j = 0; j < needle.length; j++) if (b[i + j] !== needle[j]) continue outer;
    out.push(i);
  }
  return out;
}
