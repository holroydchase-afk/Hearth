// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// R15 photo helpers: a 160 px JPEG of a picked photo, for the look-alike and blur arithmetic
// (share/helpers.ts). Made and read on the phone; never sent or kept (HELP-R2).
import { fitLongEdge, type Manipulator } from './pipeline';

export const PREVIEW_LONG_EDGE = 160;

export function makePreviewBytes(m: Manipulator, read: (uri: string) => Promise<Uint8Array>) {
  return async (uri: string): Promise<Uint8Array | null> => {
    const img = await m.load(uri);
    const out = await m.render(img, fitLongEdge(img.width, img.height, PREVIEW_LONG_EDGE), 0.7);
    return read(out.uri);
  };
}
