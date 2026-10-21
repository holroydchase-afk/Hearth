// R15 photo helpers, phase 1 (SPEC-PHOTO-HELPERS): rules and the picks that need no pixels.
import type { PickedAsset } from '../bulk';
import { blur, dark, edges, other, scene, toJpeg } from '../../test/pictures';
import { applyHelpers, findLookAlikes, helperLines } from '../helpers';

let n = 0;
const photo = (extra: Partial<PickedAsset> = {}): PickedAsset => ({ uri: `file:///p/IMG_${++n}.jpg`, type: 'image', assetId: `a${n}`, ...extra });

describe('R15 photo helpers', () => {
  it('HELP-R5 fewer than 4 photos: no helper runs, even on a screenshot or a repeat', () => {
    const a = photo();
    const r = applyHelpers([a, { ...a }, photo({ screenshot: true })]);
    expect(r.kept).toHaveLength(3);
    expect(r.setAside).toEqual([]);
    expect(r.sameTwice).toBe(0);
  });

  it('HELP-DUP-1 the same library photo picked twice is sent once, with a plain line and no button', () => {
    const a = photo();
    const r = applyHelpers([a, photo(), { ...a, uri: 'file:///p/copy.jpg' }, photo(), photo()]);
    expect(r.kept).toHaveLength(4);
    expect(r.sameTwice).toBe(1);
    expect(helperLines(r)).toEqual([{ text: "You picked 2 of the same photo. We'll send it once." }]);
  });

  it('HELP-SHOT-1 screenshots are set aside with "We left out 4 screenshots. [Send them too]"', () => {
    const shots = [1, 2, 3, 4].map(() => photo({ screenshot: true }));
    const r = applyHelpers([photo(), ...shots, photo()]);
    expect(r.kept).toHaveLength(2);
    expect(r.setAside).toEqual([{ reason: 'screenshots', items: shots }]);
    expect(helperLines(r)).toEqual([{ text: 'We left out 4 screenshots.', button: 'Send them too', reason: 'screenshots' }]);
  });

  it('HELP-SHOT-1 one screenshot reads in the singular', () => {
    const r = applyHelpers([photo(), photo(), photo(), photo({ screenshot: true })]);
    expect(helperLines(r)).toEqual([{ text: 'We left out 1 screenshot.', button: 'Send it too', reason: 'screenshots' }]);
  });

  it('HELP-R1 put back: a photo the person put back is kept, and nothing is ever dropped silently', () => {
    const shot = photo({ screenshot: true });
    const all = [photo(), photo(), photo(), shot];
    const r = applyHelpers(all, { putBack: new Set([shot.uri]) });
    expect(r.kept).toEqual(all);
    expect(r.setAside).toEqual([]);
  });

  it('HELP-R4 helpers off: everything picked is kept', () => {
    const all = [photo(), photo(), photo(), photo({ screenshot: true })];
    expect(applyHelpers(all, { on: false }).kept).toEqual(all);
  });
});

describe('R15 photo helpers, part 2: look-alikes and blurry photos from small previews', () => {
  const pics = { a: toJpeg(blur(scene(), 2)), b: toJpeg(scene()), c: toJpeg(other()), d: toJpeg(blur(scene(), 1)), e: toJpeg(edges()), f: toJpeg(blur(other(), 3)), g: toJpeg(dark()) };
  const asset = (k: keyof typeof pics) => photo({ uri: `file:///p/${k}.jpg` });
  const preview = async (uri: string) => pics[uri.slice(10, -4) as keyof typeof pics] ?? null;

  it('HELP-DUP-3 near-duplicates: the clearest of each group stays, the others are set aside', async () => {
    const [a, b, c, d] = (['a', 'b', 'c', 'd'] as const).map(asset);
    const looks = await findLookAlikes([a!, b!, c!, d!], preview);
    expect([...looks.lookAlikes].sort()).toEqual([a!.uri, d!.uri].sort());
    const r = applyHelpers([a!, b!, c!, d!], { looks });
    expect(r.kept).toEqual([b, c]);
    expect(helperLines(r)).toEqual([{ text: '2 photos look almost the same as others. We kept the clearest of each.', button: 'Send all of them', reason: 'lookAlikes' }]);
  });

  it('HELP-BLUR-1 no blur threshold tuned yet: nothing is called blurry', async () => {
    const looks = await findLookAlikes((['b', 'c', 'e', 'f'] as const).map(asset), preview);
    expect(looks.blurry.size).toBe(0);
  });

  it('HELP-BLUR-1/2 with a threshold, a blurred photo is set aside, and a dark photo never is', async () => {
    const all = (['b', 'e', 'f', 'g'] as const).map(asset);
    const looks = await findLookAlikes(all, preview, { blurUnder: 200 });
    expect([...looks.blurry]).toEqual(['file:///p/f.jpg']);
    const r = applyHelpers(all, { looks });
    expect(helperLines(r)).toContainEqual({ text: '1 photo looks blurry.', button: 'Send it too', reason: 'blurry' });
  });

  it('HELP-R1 a preview that fails leaves that photo alone', async () => {
    const all = (['a', 'b', 'c'] as const).map(asset);
    const looks = await findLookAlikes([...all, photo({ uri: 'file:///p/missing.jpg' })], async (uri) => (uri.includes('missing') ? Promise.reject(new Error('gone')) : preview(uri)));
    expect(looks.lookAlikes.has('file:///p/missing.jpg')).toBe(false);
  });

  it('HELP-DUP-2 a photo whose preview matches one sent in the last 30 days is set aside with "Send them again"', async () => {
    const [b, c, e, g] = (['b', 'c', 'e', 'g'] as const).map(asset);
    const first = await findLookAlikes([b!, c!, e!, g!], preview);
    expect(first.ids.get(b!.uri)).toMatch(/^[0-9a-f]{64}$/);
    const again = await findLookAlikes([b!, c!, e!, g!], preview, { sentIds: new Set([first.ids.get(b!.uri)!, first.ids.get(c!.uri)!]) });
    expect([...again.sentBefore].sort()).toEqual([b!.uri, c!.uri].sort());
    const r = applyHelpers([b!, c!, e!, g!], { looks: again });
    expect(r.kept).toEqual([e, g]);
    expect(helperLines(r)).toEqual([{ text: '2 of these you already sent.', button: 'Send them again', reason: 'sentBefore' }]);
  });
});
