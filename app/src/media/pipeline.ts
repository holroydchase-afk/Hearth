// On-device media pipeline (BETA-SHARE-2, -5, -6).
// Pure logic; the native image work is behind the Manipulator interface
// (expoManipulator.ts on device/web, a mock in unit tests).
//
// Privacy: every photo is decoded and re-encoded as a fresh JPEG. The encoder writes
// no EXIF/GPS/maker data. We then CHECK the output bytes and refuse to continue if any
// EXIF segment survived, so `exif_stripped: true` is a verified claim, not a hope.
// Orientation: the decoder applies the EXIF rotation on load, so the re-encoded pixels
// are already upright and no orientation tag is needed.
import { ApiError, type UploadItemSpec } from '../api/HearthApi';
import { encryptedSize } from '../crypto/media';

export const DISPLAY_LONG_EDGE = 2048;
export const DISPLAY_QUALITY = 0.82;
export const THUMB_LONG_EDGE = 480;
export const THUMB_TARGET_BYTES = 40_000;
/** Hard cap for "about 40 KB". */
export const THUMB_MAX_BYTES = 48_000;
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
export interface PipelineDeps { manipulator: Manipulator; readBytes: (uri: string) => Promise<Uint8Array> }

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

async function encode(deps: PipelineDeps, img: LoadedImage, size: { width: number; height: number }, q: number): Promise<Encoded> {
  const out = await deps.manipulator.render(img, size, q);
  const bytes = await deps.readBytes(out.uri);
  if (hasExif(bytes)) throw new ApiError('EXIF', 'metadata survived re-encode');
  return { uri: out.uri, width: out.width, height: out.height, bytes };
}

export async function processPhoto(src: { uri: string }, deps: PipelineDeps): Promise<ProcessedPhoto> {
  const img = await deps.manipulator.load(src.uri);
  const display = await encode(deps, img, fitLongEdge(img.width, img.height, DISPLAY_LONG_EDGE), DISPLAY_QUALITY);

  // Thumbnail: step quality, then size, down until it's about 40 KB.
  const attempts: [number, number][] = [[THUMB_LONG_EDGE, 0.6], [THUMB_LONG_EDGE, 0.45], [400, 0.4], [320, 0.4], [256, 0.35], [200, 0.3]];
  let thumb: Encoded | null = null;
  for (const [edge, q] of attempts) {
    thumb = await encode(deps, img, fitLongEdge(img.width, img.height, edge), q);
    if (thumb.bytes.length <= THUMB_TARGET_BYTES) break;
  }
  if (!thumb || thumb.bytes.length > THUMB_MAX_BYTES) {
    // Last resort: tiny. Never ship a heavy thumbnail to a grandma on one bar of LTE.
    thumb = await encode(deps, img, fitLongEdge(img.width, img.height, 160), 0.3);
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
