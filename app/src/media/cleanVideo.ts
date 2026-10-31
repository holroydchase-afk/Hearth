// Pure-TS QuickTime / MP4 metadata cleaner and verifier (FLAG-7; SPEC-MEDIA 3.3, section "Video"). No native code
// and no re-encode, so it runs in Expo Go, on Android and on the web.
//
// A phone video is a tree of boxes: ftyp, moov (the tables and the metadata) and mdat (the samples). iPhone writes
// the location in moov/meta (com.apple.quicktime.location.ISO6709) and moov/udta/©xyz; Android writes udta/©xyz,
// Samsung adds a trailer after the last box; GoPro and drones write GPS as timed-metadata or subtitle tracks.
//
// cleanVideo copies the file and keeps only what playback needs: ftyp; in moov the movie header and the picture
// (vide) and sound (soun) tracks, each down to its header, edit list, media header, handler, media info and sample
// tables; the vendor code and compressor name in each sample description are zeroed. Every other box (udta, meta, uuid/XMP, loci, anything unknown) is turned into a `free` box of the SAME
// size with its contents zeroed, so no sample offset moves and nothing is rewritten. A track that isn't picture or
// sound (timed metadata, timecode, text) is freed the same way and its samples in mdat are zeroed, found through
// its own sample tables. Creation and change dates in mvhd, tkhd and mdhd are zeroed (the policy's datetime is
// `extract`: the date comes from the picker, never from the file). Bytes after the last box are zeroed.
//
// verifyVideoClean walks the result again and fails closed with ApiError('META_<GROUP>') if anything outside that
// list is left: location first, then dates, then software names, then anything else. A file it can't parse fails with 'EXIF', in both
// functions. Error messages never carry bytes or values (CLAUDE.md rule 2).
import { ApiError } from '../api/HearthApi';

const fail = (): never => { throw new ApiError('EXIF', 'unreadable video'); };

const TOP_KEEP = new Set(['ftyp', 'moov', 'mdat']);
const PADDING = new Set(['free', 'skip', 'wide']);
const MOOV_KEEP = new Set(['mvhd', 'trak', 'mvex', 'iods']);
const TRAK_KEEP = new Set(['tkhd', 'edts', 'mdia', 'tref']);
const MDIA_KEEP = new Set(['mdhd', 'hdlr', 'minf']);
const MINF_KEEP = new Set(['vmhd', 'smhd', 'hdlr', 'dinf', 'stbl']);
const STBL_KEEP = new Set(['stsd', 'stts', 'ctts', 'cslg', 'stss', 'stps', 'stsc', 'stsz', 'stz2', 'stco', 'co64', 'sdtp', 'sbgp', 'sgpd', 'subs', 'saiz', 'saio']);
/** Containers walked into; every other kept box is kept whole. */
const CHILDREN: Record<string, Set<string>> = { moov: MOOV_KEEP, trak: TRAK_KEEP, mdia: MDIA_KEEP, minf: MINF_KEEP, stbl: STBL_KEEP };
const AV = new Set(['vide', 'soun']);
const DATED = new Set(['mvhd', 'tkhd', 'mdhd']);
/** Box types that can carry a location (or anything else) if they survive. */
const LOCATION_BOXES = new Set(['udta', 'meta', 'uuid', 'loci', '©xyz', 'keys', 'ilst', 'XMP_']);
const LOCATION_MARKERS = ['ISO6709', 'location', '©xyz', 'loci'];

interface Box { type: string; start: number; body: number; end: number }

const u32 = (b: Uint8Array, i: number): number => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u64 = (b: Uint8Array, i: number): number => u32(b, i) * 2 ** 32 + u32(b, i + 4);
const type4 = (b: Uint8Array, i: number): string => String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);

/** The box at `at`, or null if what's there isn't a box that fits before `end`. */
function readBox(b: Uint8Array, at: number, end: number): Box | null {
  if (end - at < 8) return null;
  let size = u32(b, at);
  let body = at + 8;
  if (size === 1) {
    if (end - at < 16) return null;
    size = u64(b, at + 8);
    body = at + 16;
  } else if (size === 0) {
    size = end - at; // to the end of the parent
  }
  if (size < body - at || at + size > end) return null;
  return { type: type4(b, at + 4), start: at, body, end: at + size };
}

function children(b: Uint8Array, parent: Box): Box[] {
  const out: Box[] = [];
  for (let i = parent.body; i < parent.end;) {
    const c = readBox(b, i, parent.end) ?? fail();
    out.push(c);
    i = c.end;
  }
  return out;
}

/** Turns a box into a zero-filled `free` box of the same size (header size fields kept). */
function free(b: Uint8Array, x: Box): void {
  b[x.start + 4] = 0x66; b[x.start + 5] = 0x72; b[x.start + 6] = 0x65; b[x.start + 7] = 0x65; // 'free'
  b.fill(0, x.body, x.end);
}

function topBoxes(b: Uint8Array): { boxes: Box[]; tail: number } {
  const boxes: Box[] = [];
  let i = 0;
  while (i < b.length) {
    // A size-0 box runs to the end of the file; one with an all-zero type is a trailer we already zeroed.
    const x = b.length - i >= 8 && u32(b, i) === 0 && u32(b, i + 4) === 0 ? null : readBox(b, i, b.length);
    if (!x) {
      // Not a box: a vendor trailer (Samsung SEF) or junk. A cut-short mdat or moov is a broken file, not a trailer.
      const t = b.length - i >= 8 ? type4(b, i + 4) : '';
      if (t === 'mdat' || t === 'moov') fail();
      break;
    }
    boxes.push(x);
    i = x.end;
  }
  return { boxes, tail: i };
}

function handlerOf(b: Uint8Array, trak: Box): string | null {
  const mdia = children(b, trak).find((c) => c.type === 'mdia');
  const hdlr = mdia && children(b, mdia).find((c) => c.type === 'hdlr');
  return hdlr && hdlr.end - hdlr.body >= 12 ? type4(b, hdlr.body + 8) : null;
}

function find(b: Uint8Array, parent: Box, path: string[]): Box | undefined {
  let cur: Box | undefined = parent;
  for (const t of path) cur = cur && children(b, cur).find((c) => c.type === t);
  return cur;
}

/** Zeroes every sample of a track in mdat, found through its own tables; fails closed if a table is unreadable. */
function zeroSamples(b: Uint8Array, trak: Box): void {
  const stbl = find(b, trak, ['mdia', 'minf', 'stbl']);
  if (!stbl) return; // no sample tables: no samples
  const kids = children(b, stbl);
  const get = (t: string) => kids.find((c) => c.type === t);
  const stsc = get('stsc'); const stsz = get('stsz'); const stco = get('stco'); const co64 = get('co64');
  const chunkBox = stco ?? co64;
  if (!stsc || !stsz || !chunkBox) {
    if (!stsc && !stsz && !chunkBox) return;
    return fail(); // includes stz2 (compact sizes), which phones don't write for these tracks
  }
  const need = (x: Box, n: number) => { if (x.body + n > x.end) fail(); };
  need(chunkBox, 8);
  const chunks = u32(b, chunkBox.body + 4);
  const width = stco ? 4 : 8;
  need(chunkBox, 8 + chunks * width);
  const chunkOffset = (c: number) => (stco ? u32(b, chunkBox.body + 8 + c * 4) : u64(b, chunkBox.body + 8 + c * 8));
  need(stsz, 12);
  const fixed = u32(b, stsz.body + 4);
  const count = u32(b, stsz.body + 8);
  if (!fixed) need(stsz, 12 + count * 4);
  const sizeOf = (s: number) => (fixed || u32(b, stsz.body + 12 + s * 4));
  need(stsc, 8);
  const runs = u32(b, stsc.body + 4);
  need(stsc, 8 + runs * 12);
  let sample = 0;
  for (let r = 0; r < runs; r++) {
    const first = u32(b, stsc.body + 8 + r * 12) - 1;
    const per = u32(b, stsc.body + 12 + r * 12);
    const last = r + 1 < runs ? u32(b, stsc.body + 8 + (r + 1) * 12) - 1 : chunks;
    if (first < 0 || last > chunks || last < first) fail();
    for (let c = first; c < last && sample < count; c++) {
      let at = chunkOffset(c);
      for (let k = 0; k < per && sample < count; k++, sample++) {
        const n = sizeOf(sample);
        if (at + n > b.length) fail();
        b.fill(0, at, at + n);
        at += n;
      }
    }
  }
  if (sample < count) fail();
}

function zeroDates(b: Uint8Array, x: Box): void {
  const v = b[x.body];
  const n = v === 1 ? 16 : 8;
  if (x.body + 4 + n > x.end) fail();
  b.fill(0, x.body + 4, x.body + 4 + n);
}

/** The sample entries in an stsd box. */
function sampleEntries(b: Uint8Array, stsd: Box): Box[] {
  if (stsd.body + 8 > stsd.end) fail();
  const out: Box[] = [];
  const n = u32(b, stsd.body + 4);
  for (let i = stsd.body + 8, k = 0; k < n; k++) {
    const e = readBox(b, i, stsd.end) ?? fail();
    out.push(e);
    i = e.end;
  }
  return out;
}

// In a sample entry, counted from the end of its 8-byte header: QuickTime's 4-byte vendor ('appl', 'FFMP') at 12, and for pictures
// the 32-byte compressor name at 42 ("H.264", "Lavc60 libx264"). Both name the software that wrote the file.
const VENDOR = [12, 16] as const;
const COMPRESSOR = [42, 74] as const;

function softwareRanges(b: Uint8Array, stsd: Box, handler: string): [number, number][] {
  const out: [number, number][] = [];
  for (const e of sampleEntries(b, stsd)) {
    const at = e.body;
    if (e.end - at >= VENDOR[1]) out.push([at + VENDOR[0], at + VENDOR[1]]);
    if (handler === 'vide' && e.end - at >= COMPRESSOR[1]) out.push([at + COMPRESSOR[0], at + COMPRESSOR[1]]);
  }
  return out;
}

function cleanContainer(b: Uint8Array, parent: Box, handler = ''): void {
  const keep = CHILDREN[parent.type]!;
  for (const c of children(b, parent)) {
    if (PADDING.has(c.type)) { if (c.type !== 'wide') free(b, c); continue; }
    if (!keep.has(c.type)) { free(b, c); continue; }
    if (c.type === 'trak' && !AV.has(handlerOf(b, c) ?? '')) {
      zeroSamples(b, c);
      free(b, c);
      continue;
    }
    if (DATED.has(c.type)) zeroDates(b, c);
    if (c.type === 'stsd') for (const [from, to] of softwareRanges(b, c, handler)) b.fill(0, from, to);
    if (CHILDREN[c.type]) cleanContainer(b, c, c.type === 'trak' ? handlerOf(b, c)! : handler);
  }
}

/** A cleaned copy of a QuickTime / MP4 file. Throws ApiError('EXIF') if it can't be read. Never changes `src`. */
export function cleanVideo(src: Uint8Array): Uint8Array {
  const b = src.slice();
  const { boxes, tail } = topBoxes(b);
  const moovs = boxes.filter((x) => x.type === 'moov');
  if (moovs.length !== 1) fail();
  for (const x of boxes) {
    if (x.type === 'moov') cleanContainer(b, x);
    else if (!TOP_KEEP.has(x.type) && x.type !== 'wide') free(b, x);
  }
  b.fill(0, tail);
  return b;
}

type Group = 'location' | 'datetime' | 'software' | 'other';

function includes(b: Uint8Array, from: number, to: number, s: string): boolean {
  const first = s.charCodeAt(0);
  outer: for (let i = from; i + s.length <= to; i++) {
    if (b[i] !== first) continue;
    for (let j = 1; j < s.length; j++) if (b[i + j] !== s.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

function check(b: Uint8Array, parent: Box, found: Set<Group>, handler = ''): void {
  const keep = CHILDREN[parent.type]!;
  for (const c of children(b, parent)) {
    if (PADDING.has(c.type)) {
      if (c.type === 'free' && b.subarray(c.body, c.end).some((x) => x !== 0)) found.add('other');
      continue;
    }
    if (!keep.has(c.type)) { found.add(LOCATION_BOXES.has(c.type) ? 'location' : 'other'); continue; }
    if (c.type === 'trak' && !AV.has(handlerOf(b, c) ?? '')) { found.add('location'); continue; }
    if (DATED.has(c.type)) {
      const n = b[c.body] === 1 ? 16 : 8;
      if (b.subarray(c.body + 4, Math.min(c.end, c.body + 4 + n)).some((x) => x !== 0)) found.add('datetime');
    }
    if (c.type === 'stsd' && softwareRanges(b, c, handler).some(([from, to]) => b.subarray(from, to).some((x) => x !== 0))) found.add('software');
    if (CHILDREN[c.type]) check(b, c, found, c.type === 'trak' ? handlerOf(b, c)! : handler);
  }
}

/** Fails closed with META_LOCATION / META_DATETIME / META_OTHER if anything but playback data is left. */
export function verifyVideoClean(b: Uint8Array): void {
  const { boxes, tail } = topBoxes(b);
  const moovs = boxes.filter((x) => x.type === 'moov');
  if (moovs.length !== 1) fail();
  const found = new Set<Group>();
  for (const x of boxes) {
    if (x.type === 'moov') {
      check(b, x, found);
      if (LOCATION_MARKERS.some((m) => includes(b, x.body, x.end, m))) found.add('location');
    } else if (x.type === 'free' && b.subarray(x.body, x.end).some((v) => v !== 0)) {
      found.add('other');
    } else if (!TOP_KEEP.has(x.type) && !PADDING.has(x.type)) {
      found.add(LOCATION_BOXES.has(x.type) ? 'location' : 'other');
    }
  }
  if (b.subarray(tail).some((v) => v !== 0)) found.add('location'); // a trailer can carry anything; Samsung's carries location
  for (const g of ['location', 'datetime', 'software', 'other'] as const) {
    if (found.has(g)) throw new ApiError(`META_${g.toUpperCase()}` as 'META_LOCATION' | 'META_DATETIME' | 'META_SOFTWARE' | 'META_OTHER', `video metadata group ${g} survived`);
  }
}

/** video/quicktime for a QuickTime brand ('qt  ') or no ftyp at all; video/mp4 for every MP4 brand. */
export function videoMimeType(b: Uint8Array): 'video/quicktime' | 'video/mp4' {
  const first = readBox(b, 0, b.length);
  if (first?.type === 'ftyp' && first.end - first.body >= 4) return type4(b, first.body) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  return 'video/quicktime';
}
