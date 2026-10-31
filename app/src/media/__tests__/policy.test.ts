// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MEDIA-1, MEDIA-2, MEDIA-5 (SPEC-MEDIA D1-D7): the media policy is ONE typed, frozen,
// code-level object in app/src/media/policy.ts. These tests pin its defaults and prove
// that changing the policy changes what the cleaner keeps and how the photo is encoded.
import { cleanImage } from '../clean';
import { DISPLAY_LONG_EDGE, DISPLAY_QUALITY, THUMB_MAX_BYTES, THUMB_TARGET_BYTES, processPhoto, type Manipulator } from '../pipeline';
import { MEDIA_POLICY, type MediaPolicy } from '../policy';
import { iosReencode, segments, startsWith } from '../../test/jpeg';

const withFields = (f: Partial<MediaPolicy['fields']>): MediaPolicy => ({ ...MEDIA_POLICY, fields: { ...MEDIA_POLICY.fields, ...f } });
const withCompression = (c: Partial<MediaPolicy['compression']>): MediaPolicy => ({ ...MEDIA_POLICY, compression: { ...MEDIA_POLICY.compression, ...c } });

describe('media policy (SPEC-MEDIA 1.1, 1.2)', () => {
  it("MEDIA-5 D2 location default is strip (Chase's word + persona check to change)", () => {
    expect(MEDIA_POLICY.fields.location).toBe('strip');
  });

  it('MEDIA-5 D2 location also accepts keep and extract (the infrastructure exists; tsc checks the types)', () => {
    const keep: MediaPolicy = withFields({ location: 'keep' });
    const extract: MediaPolicy = withFields({ location: 'extract' });
    expect([keep.fields.location, extract.fields.location]).toEqual(['keep', 'extract']);
    expect(MEDIA_POLICY.fields.location).toBe('strip'); // building a variant never changes the default
  });

  it('MEDIA-1 D1 the policy is one frozen code-level object with a version', () => {
    expect(Number.isInteger(MEDIA_POLICY.version)).toBe(true);
    expect(MEDIA_POLICY.version).toBeGreaterThanOrEqual(1);
    expect(Object.isFrozen(MEDIA_POLICY)).toBe(true);
    expect(Object.isFrozen(MEDIA_POLICY.fields)).toBe(true);
    expect(Object.isFrozen(MEDIA_POLICY.compression)).toBe(true);
  });

  it('MEDIA-1 D3-D6 default field rules: date extracted, colour profile kept, everything else stripped', () => {
    expect(MEDIA_POLICY.fields).toEqual({
      location: 'strip',
      datetime: 'extract', // D3: taken_at, never left in the file
      camera: 'strip',
      orientation: 'strip', // D5: baked into the pixels, tag removed
      software: 'strip',
      makernote: 'strip',
      xmp: 'strip',
      icc: 'keep', // D6 (Chase, Oct 19): keep the photo's own profile
      faces: 'strip',
      other: 'strip',
    });
  });

  it('MEDIA-1 D7 default compression: on, JPEG, 2048 px long edge, quality 0.82, thumb about 40 KB', () => {
    expect(MEDIA_POLICY.compression).toEqual({
      enabled: true, format: 'jpeg', long_edge: 2048, quality: 0.82, thumb_target_bytes: 40_000, thumb_max_bytes: 48_000,
    });
    // One source of truth: the pipeline's numbers come from the policy.
    expect([DISPLAY_LONG_EDGE, DISPLAY_QUALITY, THUMB_TARGET_BYTES, THUMB_MAX_BYTES])
      .toEqual([MEDIA_POLICY.compression.long_edge, MEDIA_POLICY.compression.quality, MEDIA_POLICY.compression.thumb_target_bytes, MEDIA_POLICY.compression.thumb_max_bytes]);
  });
});

describe('changing the policy changes the result (SPEC-MEDIA 1.5)', () => {
  const icc = (b: Uint8Array) => segments(b).head.filter((s) => s.marker === 0xe2 && startsWith(s.payload, 'ICC_PROFILE'));

  it('MEDIA-2 D6 icc keep (default) keeps the colour profile; icc strip removes it', () => {
    const src = iosReencode();
    expect(icc(cleanImage(src))).toHaveLength(1);
    expect(icc(cleanImage(src, MEDIA_POLICY))).toHaveLength(1);
    expect(icc(cleanImage(src, withFields({ icc: 'strip' })))).toHaveLength(0);
  });

  function manipulator() {
    const calls: { size: { width: number; height: number }; quality: number }[] = [];
    const files = new Map<string, Uint8Array>();
    let n = 0;
    const m: Manipulator = {
      load: async (uri) => ({ width: 4032, height: 3024, handle: uri }),
      render: async (_img, size, quality) => {
        calls.push({ size, quality });
        const uri = `file:///cache/p-${++n}.jpg`;
        files.set(uri, iosReencode(size.width, size.height, 64));
        return { uri, ...size };
      },
    };
    return { m, calls, readBytes: async (u: string) => files.get(u)! };
  }

  it('MEDIA-2 D7 long edge and quality come from the policy (1024 px at 0.5; original = full size)', async () => {
    const a = manipulator();
    await processPhoto({ uri: 'file:///pick/1.jpg' }, { manipulator: a.m, readBytes: a.readBytes, policy: withCompression({ long_edge: 1024, quality: 0.5 }) });
    expect(a.calls[0]).toEqual({ size: { width: 1024, height: 768 }, quality: 0.5 });

    const b = manipulator();
    await processPhoto({ uri: 'file:///pick/1.jpg' }, { manipulator: b.m, readBytes: b.readBytes, policy: withCompression({ long_edge: 'original' }) });
    expect(b.calls[0]!.size).toEqual({ width: 4032, height: 3024 });

    const c = manipulator();
    await processPhoto({ uri: 'file:///pick/1.jpg' }, { manipulator: c.m, readBytes: c.readBytes }); // default policy
    expect(c.calls[0]).toEqual({ size: { width: 2048, height: 1536 }, quality: 0.82 });
  });
});
