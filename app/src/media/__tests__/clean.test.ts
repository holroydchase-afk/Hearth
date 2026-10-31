// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MEDIA-1, MEDIA-2, MEDIA-3 (SPEC-MEDIA 1.3): the pure-TS cleaner copies a JPEG segment by
// segment, keeping only JFIF, the ICC profile (when the policy keeps it), the image tables and
// the scan. The verifier fails closed with META_<GROUP> only if a stripped group survives.
import { ApiError } from '../../api/HearthApi';
import { cleanImage, verifyClean } from '../clean';
import { hasExif } from '../pipeline';
import { APP0_JFIF, APP1_FULL_EXIF, APP2_ICC, SECRETS, contains, everything, imageData, iosReencode, jpeg, segments, startsWith } from '../../test/jpeg';

/** Markers allowed before the scan in a cleaned file: APP0 JFIF, APP2 ICC, DQT, SOF0-2, DHT, DRI. */
function expectOnlyAllowedSegments(b: Uint8Array) {
  for (const s of segments(b).head) {
    const ok = (s.marker === 0xe0 && startsWith(s.payload, 'JFIF'))
      || (s.marker === 0xe2 && startsWith(s.payload, 'ICC_PROFILE'))
      || [0xdb, 0xc0, 0xc1, 0xc2, 0xc4, 0xdd].includes(s.marker);
    expect({ marker: s.marker.toString(16), ok }).toEqual({ marker: s.marker.toString(16), ok: true });
  }
}

describe('cleanImage (MEDIA-1, MEDIA-2)', () => {
  it('MEDIA-1 iOS re-encode Exif (ColorSpace + pixel size only) is cleaned: no APP1, image data byte-identical', () => {
    const src = iosReencode();
    expect(hasExif(src)).toBe(true); // the fixture really carries what failed on Chase's iPhone
    const out = cleanImage(src);
    expect(hasExif(out)).toBe(false);
    expect(segments(out).head.some((s) => s.marker === 0xe1)).toBe(false);
    expectOnlyAllowedSegments(out);
    expect(Buffer.from(segments(out).scan)).toEqual(Buffer.from(segments(src).scan));
    const tables = (b: Uint8Array) => segments(b).head.filter((s) => [0xdb, 0xc0, 0xc4].includes(s.marker)).map((s) => Buffer.from(s.payload));
    expect(tables(out)).toEqual(tables(src));
  });

  it('MEDIA-2 GPS, MakerNote content ID, serials, XMP faces, IPTC, COM and unknown APPn are all stripped (checked by group)', () => {
    const out = cleanImage(everything());
    const markers = segments(out).head.map((s) => s.marker);
    expect(markers).not.toContain(0xe1); // Exif (location, camera, software, makernote, orientation, datetime) and XMP (xmp, faces)
    expect(markers).not.toContain(0xed); // IPTC (other)
    expect(markers).not.toContain(0xfe); // COM (other)
    expect(markers).not.toContain(0xef); // unknown APPn (other)
    expectOnlyAllowedSegments(out);
    for (const s of SECRETS) expect({ s, found: contains(out, s) }).toEqual({ s, found: false });
  });

  it('MEDIA-2 D6 ICC colour profile survives byte-for-byte when the policy keeps it', () => {
    const out = cleanImage(everything());
    const icc = segments(out).head.filter((s) => s.marker === 0xe2);
    expect(icc.map((s) => Buffer.from(s.payload))).toEqual([Buffer.from(APP2_ICC.slice(4))]);
    expect(segments(out).head[0]!.marker).toBe(0xe0); // JFIF stays first
  });

  it('MEDIA-1 a JPEG with nothing to remove comes out unchanged', () => {
    const src = jpeg(APP0_JFIF, APP2_ICC, imageData());
    expect(Buffer.from(cleanImage(src))).toEqual(Buffer.from(src));
  });
});

describe('verifyClean (MEDIA-3)', () => {
  it('MEDIA-3 fails closed with META_LOCATION when GPS survives, and passes once cleaned', () => {
    const dirty = jpeg(APP0_JFIF, APP1_FULL_EXIF, imageData());
    let err: unknown;
    try { verifyClean(dirty); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('META_LOCATION');
    expect(() => verifyClean(cleanImage(dirty))).not.toThrow();
  });
});
