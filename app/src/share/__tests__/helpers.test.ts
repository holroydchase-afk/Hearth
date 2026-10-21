// R15 photo helpers, phase 1 (SPEC-PHOTO-HELPERS): rules and the picks that need no pixels.
import type { PickedAsset } from '../bulk';
import { applyHelpers, helperLines } from '../helpers';

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
