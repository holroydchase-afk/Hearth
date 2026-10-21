// On-device media pipeline (BETA-SHARE-2, -5, -6; SPEC-MEDIA 1.3).
// Pure logic; the native image work is behind the Manipulator interface
// (expoManipulator.ts on device/web, a mock in unit tests).
//
// Privacy: every photo is decoded and re-encoded as a fresh JPEG at the media policy's size and
// quality. The encoder may still write a small Exif block (iOS UIImage.jpegData writes ColorSpace
// and pixel size), so every output then goes through cleanImage (clean.ts), which keeps only what
// the policy keeps (by default the ICC colour profile), and verifyClean, which fails closed with
// META_<GROUP> if a stripped group survived. So `exif_stripped: true` is a verified claim.
// Orientation: the decoder applies the EXIF rotation on load, so the re-encoded pixels
// are already upright and no orientation tag is needed.
import { ApiError, type UploadItemSpec } from '../api/HearthApi';
import { encryptedSize } from '../crypto/media';
import { cleanImage, verifyClean } from './clean';
import { MEDIA_POLICY, type MediaPolicy } from './policy';

const DEFAULT_EDGE = MEDIA_POLICY.compression.long_edge;
/** Default display long edge (from MEDIA_POLICY). */
export const DISPLAY_LONG_EDGE: number = DEFAULT_EDGE === 'original' ? Number.POSITIVE_INFINITY : DEFAULT_EDGE;
export const DISPLAY_QUALITY = MEDIA_POLICY.compression.quality;
export const THUMB_LONG_EDGE = 480;
/** Small JPEGs carry more bytes per pixel than big ones; the guess is padded so it only skips steps that surely miss. */
const THUMB_GUESS_MARGIN = 1.5;
export const THUMB_TARGET_BYTES = MEDIA_POLICY.compression.thumb_target_bytes;
/** Hard cap for "about 40 KB". */
export const THUMB_MAX_BYTES = MEDIA_POLICY.compression.thumb_max_bytes;
export const VIDEO_MAX_MS = 60_000;

export interface LoadedImage { width: number; height: number; handle: unknown }
export interface Manipulator {
  /** Decode, applying EXIF orientation. width/height are the upright dimensions. */
  load(uri: string): Promise<LoadedImage>;
  /** Resize and encode as JPEG at quality 0..1. */
  render(img: LoadedImage, size: { width: number; height: number }, quality: number): Promise<{ uri: string; width: number; height: number }>;
}
export interface Encoded { uri: string; width: number; height: number; bytes: Uint8Array }
export interface ProcessedPhoto { kind: 'photo'; mime_type: 'image/jpeg'; display: Encoded; thumb: Encoded }
export interface PipelineDeps {
  manipulator: Manipulator;
  readBytes: (uri: string) => Promise<Uint8Array>;
  /** Defaults to MEDIA_POLICY. Tests pass variants; the app never does (D1: code-level only). */
  policy?: MediaPolicy;
}

export function fitLongEdge(w: number, h: number, max: number): { width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= max) return { width: w, height: h };
  const s = max / long;
  return w >= h
    ? { width: max, height: Math.max(1, Math.round(h * s)) }
    : { width: Math.max(1, Math.round(w * s)), height: max };
}

/** True if a JPEG has an APP1 Exif or XMP segment, or a PNG has an eXIf chunk. */
export function hasExif(b: Uint8Array): boolean {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const marker = b[i + 1]!;
      if (marker === 0xda || marker === 0xd9) return false; // start of scan: no more metadata
      const len = (b[i + 2]! << 8) | b[i + 3]!;
      if (marker === 0xe1) {
        const sig = String.fromCharCode(...b.subarray(i + 4, i + 4 + 4));
        if (sig === 'Exif' || sig === 'http') return true; // Exif or XMP ("http://ns.adobe.com/xap/")
      }
      i += 2 + len;
    }
    return false;
  }
  // PNG: look for an eXIf chunk name.
  for (let i = 8; i + 4 <= b.length; i++) {
    if (b[i] === 0x65 && b[i + 1] === 0x58 && b[i + 2] === 0x49 && b[i + 3] === 0x66) return true;
  }
  return false;
}

async function encode(deps: PipelineDeps, policy: MediaPolicy, img: LoadedImage, size: { width: number; height: number }, q: number): Promise<Encoded> {
  const out = await deps.manipulator.render(img, size, q);
  const bytes = cleanImage(await deps.readBytes(out.uri), policy);
  verifyClean(bytes, policy);
  return { uri: out.uri, width: out.width, height: out.height, bytes };
}

export async function processPhoto(src: { uri: string }, deps: PipelineDeps): Promise<ProcessedPhoto> {
  const policy = deps.policy ?? MEDIA_POLICY;
  const c = policy.compression;
  // "Off" (clean the original, SPEC-MEDIA 1.2) is not built; refuse rather than send something unplanned.
  if (!c.enabled || c.format !== 'jpeg') throw new ApiError('EXIF', 'media policy compression setting not supported');
  const img = await deps.manipulator.load(src.uri);
  const edge = c.long_edge === 'original' ? Math.max(img.width, img.height) : c.long_edge;
  const display = await encode(deps, policy, img, fitLongEdge(img.width, img.height, edge), c.quality);

  // Thumbnail: step quality, then size, down until it's about 40 KB (measured after cleaning).
  // R12 (RV-P5): skip steps the display JPEG already says are too big, so a busy photo isn't encoded 7 times.
  const attempts: [number, number][] = [[THUMB_LONG_EDGE, 0.6], [THUMB_LONG_EDGE, 0.45], [400, 0.4], [320, 0.4], [256, 0.35], [200, 0.3]];
  const bytesPerPixel = display.bytes.length / (display.width * display.height);
  const guess = ([edge, q]: [number, number]) => {
    const s = fitLongEdge(img.width, img.height, edge);
    return bytesPerPixel * s.width * s.height * (q / c.quality) * THUMB_GUESS_MARGIN;
  };
  const first = attempts.findIndex((a) => guess(a) <= c.thumb_target_bytes);
  let thumb: Encoded | null = null;
  for (const [edge, q] of attempts.slice(first < 0 ? attempts.length - 1 : first)) {
    thumb = await encode(deps, policy, img, fitLongEdge(img.width, img.height, edge), q);
    if (thumb.bytes.length <= c.thumb_target_bytes) break;
  }
  if (!thumb || thumb.bytes.length > c.thumb_max_bytes) {
    // Last resort: tiny. Never ship a heavy thumbnail to a grandma on one bar of LTE.
    thumb = await encode(deps, policy, img, fitLongEdge(img.width, img.height, 160), 0.3);
  }
  return { kind: 'photo', mime_type: 'image/jpeg', display, thumb };
}

export function checkVideo(a: { durationMs: number | null | undefined }): void {
  if (a.durationMs == null || !(a.durationMs <= VIDEO_MAX_MS)) {
    throw new ApiError('VIDEO_TOO_LONG');
  }
}

export function buildUploadSpec(p: ProcessedPhoto): UploadItemSpec {
  return {
    kind: p.kind,
    mime_type: p.mime_type,
    width: p.display.width,
    height: p.display.height,
    duration_ms: null,
    byte_size: encryptedSize(p.display.bytes.length),
    thumb_byte_size: encryptedSize(p.thumb.bytes.length),
    exif_stripped: true,
  };
}
