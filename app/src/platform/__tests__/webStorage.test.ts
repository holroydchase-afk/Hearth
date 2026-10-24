// HARD-7: a browser that blocks storage must not stop the web build; values live in memory for the visit.
import { webKV, webStorage } from '../webStorage';

describe('webStorage', () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => { if (real) Object.defineProperty(globalThis, 'localStorage', real); else delete (globalThis as { localStorage?: unknown }).localStorage; });

  it('HARD-7 blocked storage gives undefined, and the KV keeps values in memory', async () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('SecurityError'); } });
    expect(webStorage()).toBeUndefined();
    const kv = webKV();
    await kv.setItem('a', '1');
    expect(await kv.getItem('a')).toBe('1');
    await kv.removeItem('a');
    expect(await kv.getItem('a')).toBeNull();
  });

  it('HARD-7 working storage is used as before (same keys)', async () => {
    const m = new Map<string, string>();
    const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), length: 0 };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: ls });
    await webKV().setItem('hearth.x', 'y');
    expect(m.get('hearth.x')).toBe('y');
    expect(await webKV().getItem('hearth.x')).toBe('y');
  });
});
