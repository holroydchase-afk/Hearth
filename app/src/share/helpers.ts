// R15 photo helpers (SPEC-PHOTO-HELPERS), run on a bulk pick before planBatch. They only set photos
// aside for this send (HELP-R1): nothing is deleted, and every set-aside photo is one button from
// coming back. Phase 1: the same photo picked twice (HELP-DUP-1) and screenshots (HELP-SHOT-1).
// Near-duplicates and blurry photos (media/pixels.ts) join once thumbnails are decoded on the phone.
import type { PickedAsset } from './bulk';

/** HELP-R5: with fewer photos than this, a person meant every one of them. */
export const HELPERS_MIN_PHOTOS = 4;

export type SetAsideReason = 'screenshots';

export interface HelperResult {
  kept: PickedAsset[];
  setAside: { reason: SetAsideReason; items: PickedAsset[] }[];
  /** HELP-DUP-1: repeats of a photo already in this pick, dropped (sent once). */
  sameTwice: number;
}

const isPhoto = (a: PickedAsset) => a.type !== 'video' && a.type !== 'pairedVideo' && !(typeof a.mimeType === 'string' && a.mimeType.startsWith('video/'));

/** on: HELP-R4 off-switch. putBack: uris the person brought back ("Send them too", "Put back"). */
export function applyHelpers(assets: PickedAsset[], o: { on?: boolean; putBack?: Set<string> } = {}): HelperResult {
  const none: HelperResult = { kept: assets, setAside: [], sameTwice: 0 };
  if (o.on === false || assets.filter(isPhoto).length < HELPERS_MIN_PHOTOS) return none;
  const seen = new Set<string>();
  const kept: PickedAsset[] = [];
  const shots: PickedAsset[] = [];
  let sameTwice = 0;
  for (const a of assets) {
    const id = a.assetId ? `id:${a.assetId}` : `uri:${a.uri}`;
    if (isPhoto(a) && seen.has(id)) { sameTwice += 1; continue; }
    seen.add(id);
    if (isPhoto(a) && a.screenshot && !o.putBack?.has(a.uri)) shots.push(a);
    else kept.push(a);
  }
  return { kept, setAside: shots.length ? [{ reason: 'screenshots', items: shots }] : [], sameTwice };
}

export interface HelperLine { text: string; button?: string; reason?: SetAsideReason }

/** The review screen's lines, in words (HELP-R3). Wording from the spec, reviewed by grandparent-ux. */
export function helperLines(r: HelperResult): HelperLine[] {
  const lines: HelperLine[] = [];
  if (r.sameTwice === 1) lines.push({ text: "You picked 2 of the same photo. We'll send it once." });
  else if (r.sameTwice > 1) lines.push({ text: `You picked ${r.sameTwice} photos twice. We'll send each one once.` });
  for (const s of r.setAside) {
    const n = s.items.length;
    lines.push({ text: `We left out ${n} ${n === 1 ? 'screenshot' : 'screenshots'}.`, button: n === 1 ? 'Send it too' : 'Send them too', reason: s.reason });
  }
  return lines;
}
