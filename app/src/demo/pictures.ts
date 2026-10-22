// DEMO-2: the sample pictures ship in public/demo-pictures/ (web export only, so phone builds don't
// carry them) and are read like a picked photo would be. Drawn by scripts/make-demo-pictures.py.
import type { DemoPicture } from './seed';

const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

async function bytes(path: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/demo-pictures/${path}`);
  if (!res.ok) throw new Error(`demo picture ${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadDemoPicture(name: string): Promise<DemoPicture> {
  const [display, thumb] = await Promise.all([bytes(`${name}.jpg`), bytes(`${name}-thumb.jpg`)]);
  return { display, thumb, width: 1200, height: 900 };
}
