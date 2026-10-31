// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// R15 photo helpers: the small preview each helper reads (HELP-R2: on the phone, never sent or kept).
import { PREVIEW_LONG_EDGE, makePreviewBytes } from '../preview';
import type { Manipulator } from '../pipeline';

describe('R15 preview', () => {
  it('HELP-R2 renders a 160 px preview on the phone and returns its bytes', async () => {
    const render = jest.fn(async (_img: unknown, size: { width: number; height: number }) => ({ uri: 'file:///cache/p.jpg', ...size }));
    const m: Manipulator = { load: async (uri) => ({ width: 4032, height: 3024, handle: uri }), render };
    const read = jest.fn(async () => new Uint8Array([1, 2, 3]));
    const bytes = await makePreviewBytes(m, read)('file:///pick/IMG_1.HEIC');
    expect(render.mock.calls[0]![1]).toEqual({ width: PREVIEW_LONG_EDGE, height: 120 });
    expect(read).toHaveBeenCalledWith('file:///cache/p.jpg');
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});
