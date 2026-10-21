// R15 photo helpers (SPEC-PHOTO-HELPERS), run on a bulk pick before planBatch. They only set photos
// aside for this send (HELP-R1): nothing is deleted, and every set-aside photo is one button from
// coming back. The same photo picked twice (HELP-DUP-1) and screenshots (HELP-SHOT-1) are known at once;
// look-alikes and blurry photos (HELP-DUP-3, HELP-BLUR) come from small previews, worked out after.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { dHash64, grayFromJpeg, isDark, nearDuplicateGroups, sharpness } from '../media/pixels';
import type { PickedAsset } from './bulk';

/** HELP-R5: with fewer photos than this, a person meant every one of them. */
export const HELPERS_MIN_PHOTOS = 4;

export type SetAsideReason = 'screenshots' | 'sentBefore' | 'lookAlikes' | 'blurry';

/** HELP-BLUR-1: sharpness under this is blurry. Null until tuned on a labeled set of 40 photos: nothing is called blurry. */
export const BLUR_UNDER: number | null = null;

/** Uris set aside by the preview helpers, and each photo's preview fingerprint (HELP-DUP-2, on the phone only). */
export interface LookResult { lookAlikes: Set<string>; blurry: Set<string>; sentBefore: Set<string>; ids: Map<string, string> }

/**
 * HELP-DUP-2/3 and HELP-BLUR-1/2 from a small JPEG preview of each photo (read on the phone, never kept).
 * sentIds: preview fingerprints this person sent in the last 30 days (share/sentBefore.ts).
 * A preview that fails leaves that photo alone.
 */
export async function findLookAlikes(
  assets: PickedAsset[],
  preview: (uri: string) => Promise<Uint8Array | null>,
  o: { blurUnder?: number | null; sentIds?: Set<string> } = {},
): Promise<LookResult> {
  const blurUnder = o.blurUnder === undefined ? BLUR_UNDER : o.blurUnder;
  const seen: { uri: string; hash: Uint8Array; sharpness: number; dark: boolean }[] = [];
  const ids = new Map<string, string>();
  for (const a of assets) {
    try {
      const bytes = await preview(a.uri);
      if (!bytes) continue;
      ids.set(a.uri, bytesToHex(sha256(bytes)));
      const g = grayFromJpeg(bytes);
      seen.push({ uri: a.uri, hash: dHash64(g), sharpness: sharpness(g), dark: isDark(g) });
    } catch {
      /* leave it alone */
    }
  }
  const sentBefore = new Set([...ids].filter(([, id]) => o.sentIds?.has(id)).map(([uri]) => uri));
  // A photo already sent is left out as such, so look-alikes are grouped among the rest ("we kept the clearest" stays true).
  const fresh = seen.filter((p) => !sentBefore.has(p.uri));
  const lookAlikes = new Set(nearDuplicateGroups(fresh).flatMap((grp) => grp.setAside.map((i) => fresh[i]!.uri)));
  const blurry = new Set(blurUnder === null ? [] : fresh.filter((p) => !p.dark && !lookAlikes.has(p.uri) && p.sharpness < blurUnder).map((p) => p.uri));
  return { lookAlikes, blurry, sentBefore, ids };
}

export interface HelperResult {
  kept: PickedAsset[];
  setAside: { reason: SetAsideReason; items: PickedAsset[] }[];
  /** HELP-DUP-1: repeats of a photo already in this pick, dropped (sent once). */
  sameTwice: number;
}

const isPhoto = (a: PickedAsset) => a.type !== 'video' && a.type !== 'pairedVideo' && !(typeof a.mimeType === 'string' && a.mimeType.startsWith('video/'));

/** on: HELP-R4 off-switch. putBack: uris the person brought back ("Send them too", "Put back"). */
export function applyHelpers(assets: PickedAsset[], o: { on?: boolean; putBack?: Set<string>; looks?: LookResult | null } = {}): HelperResult {
  const none: HelperResult = { kept: assets, setAside: [], sameTwice: 0 };
  if (o.on === false || assets.filter(isPhoto).length < HELPERS_MIN_PHOTOS) return none;
  const seen = new Set<string>();
  const kept: PickedAsset[] = [];
  const aside: Record<SetAsideReason, PickedAsset[]> = { screenshots: [], sentBefore: [], lookAlikes: [], blurry: [] };
  let sameTwice = 0;
  for (const a of assets) {
    const id = a.assetId ? `id:${a.assetId}` : `uri:${a.uri}`;
    if (isPhoto(a) && seen.has(id)) { sameTwice += 1; continue; }
    seen.add(id);
    const why: SetAsideReason | null = !isPhoto(a) || o.putBack?.has(a.uri) ? null
      : a.screenshot ? 'screenshots'
        : o.looks?.sentBefore.has(a.uri) ? 'sentBefore'
        : o.looks?.lookAlikes.has(a.uri) ? 'lookAlikes'
          : o.looks?.blurry.has(a.uri) ? 'blurry' : null;
    if (why) aside[why].push(a);
    else kept.push(a);
  }
  const setAside = (['screenshots', 'sentBefore', 'lookAlikes', 'blurry'] as const).filter((r) => aside[r].length).map((reason) => ({ reason, items: aside[reason] }));
  return { kept, setAside, sameTwice };
}

export interface HelperLine { text: string; button?: string; reason?: SetAsideReason }

/** The review screen's lines, in words (HELP-R3). Wording from the spec, reviewed by grandparent-ux. */
export function helperLines(r: HelperResult): HelperLine[] {
  const lines: HelperLine[] = [];
  if (r.sameTwice === 1) lines.push({ text: "You picked 2 of the same photo. We'll send it once." });
  else if (r.sameTwice > 1) lines.push({ text: `You picked ${r.sameTwice} photos twice. We'll send each one once.` });
  for (const s of r.setAside) {
    const n = s.items.length;
    const one = n === 1;
    if (s.reason === 'screenshots') lines.push({ text: `We left out ${n} ${one ? 'screenshot' : 'screenshots'}.`, button: one ? 'Send it too' : 'Send them too', reason: s.reason });
    else if (s.reason === 'sentBefore') lines.push({ text: `${n} of these you already sent.`, button: one ? 'Send it again' : 'Send them again', reason: s.reason });
    else if (s.reason === 'lookAlikes') lines.push({ text: one ? '1 photo looks almost the same as another. We kept the clearest.' : `${n} photos look almost the same as others. We kept the clearest of each.`, button: one ? 'Send it too' : 'Send all of them', reason: s.reason });
    else lines.push({ text: one ? '1 photo looks blurry.' : `${n} photos look blurry.`, button: one ? 'Send it too' : 'Send them too', reason: s.reason });
  }
  return lines;
}
