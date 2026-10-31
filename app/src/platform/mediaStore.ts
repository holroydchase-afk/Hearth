// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// A3: kept photo files (ciphertext only) in the app's cache folder. The phone may clear it when space is low;
// that is fine, the photo is fetched again. Names are `<media_id>.<thumb|display>`.
import { Directory, File, Paths } from 'expo-file-system';
import type { MediaStore } from '../media/diskCache';
import { secureSessionStorage } from './secureSession';

const dir = () => new Directory(Paths.cache, 'hearth-media');
const safe = (n: string) => /^[A-Za-z0-9-]+\.(thumb|display)$/.test(n);

export const fileMediaStore: MediaStore = {
  async read(name) {
    if (!safe(name)) return null;
    const f = new File(dir(), name);
    return f.exists ? f.bytes() : null;
  },
  async write(name, bytes) {
    if (!safe(name)) return;
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const f = new File(d, name);
    if (!f.exists) f.create();
    f.write(bytes);
  },
  async remove(name) {
    if (!safe(name)) return;
    const f = new File(dir(), name);
    if (f.exists) f.delete();
  },
  async list() {
    const d = dir();
    return d.exists ? d.list().map((x) => x.name).filter(safe) : [];
  },
  async clear() {
    const d = dir();
    if (d.exists) d.delete();
  },
};

/** The keychain-backed store for the keys that open kept files. */
export const mediaKeyStore = secureSessionStorage;
