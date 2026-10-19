// Media policy (SPEC-MEDIA D1-D7, section 1). ONE typed, frozen, code-level object: there is no
// remote switch, so a changed server can't turn location on. How a change is made: SPEC-MEDIA 1.5
// (staff-pm call, privacy-security review, Chase's word for any keep/extract; bump `version`).

/** What happens to one group of fields in the file. `extract` = read into a Hearth field, strip from the file. */
export type FieldRule = 'strip' | 'keep' | 'extract';

/** SPEC-MEDIA 1.1 field groups. Anything not named (IPTC, COM, unknown APPn) is `other`. */
export type FieldGroup =
  | 'location' | 'datetime' | 'camera' | 'orientation' | 'software'
  | 'makernote' | 'xmp' | 'icc' | 'faces' | 'other';

export interface MediaPolicy {
  /** Bump on every change (SPEC-MEDIA 1.5). */
  readonly version: number;
  readonly fields: { readonly [G in FieldGroup]: FieldRule };
  readonly compression: {
    /** `false` ("clean the original") is not built yet; the pipeline refuses it rather than guess. */
    readonly enabled: boolean;
    /** JPEG only: expo-image-manipulator in Expo Go can't write HEIC (D7). */
    readonly format: 'jpeg';
    /** Long edge in px, or `'original'` for full size (D7; needs its own persona check). */
    readonly long_edge: number | 'original';
    /** 0..1 */
    readonly quality: number;
    readonly thumb_target_bytes: number;
    readonly thumb_max_bytes: number;
  };
}

export const MEDIA_POLICY: MediaPolicy = Object.freeze({
  version: 1,
  fields: Object.freeze({
    // D2 (Chase, Oct 19): configurable, default strip. Pinned by MEDIA-5; changing it needs Chase's
    // word, a persona check and a CLAUDE.md rule 2 amendment in the same PR.
    location: 'strip',
    datetime: 'extract', // D3: taken_at comes from the picker; never left in the file
    camera: 'strip', // D4: serials fingerprint one phone
    orientation: 'strip', // D5: baked into the pixels by the decoder
    software: 'strip',
    makernote: 'strip', // incl. Apple's Live Photo content ID
    xmp: 'strip',
    icc: 'keep', // D6 (Chase, Oct 19): keep the photo's own colour profile
    faces: 'strip',
    other: 'strip',
  } as const),
  compression: Object.freeze({
    enabled: true, // D7 (Chase, Oct 19)
    format: 'jpeg',
    long_edge: 2048,
    quality: 0.82,
    thumb_target_bytes: 40_000,
    thumb_max_bytes: 48_000,
  } as const),
});
