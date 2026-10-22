// The no-login sample-data demo (RR-1..3, RR-10 in docs/reviews/2026-10-22-recruiter-ready.md).
// Fills the in-memory FakeBackend with a made-up family's posts, signs the visitor in as the parent,
// and lets them switch to Grandma Jo's view. Everything stays in the browser; no real backend.
import { FIXTURE, type FakeBackend } from '../api/fake/FakeBackend';
import { encryptMediaAsync } from '../crypto/media';

const F = FIXTURE;
const DAY = 864e5;

/** Made-up names only (DEMO-3). The fixture's parent is renamed so no real person appears. */
export const DEMO_NAMES: Record<string, string> = {
  [F.users.chase.id]: 'Sam',
  [F.users.alex.id]: 'Alex',
};

export interface DemoPicture { display: Uint8Array; thumb: Uint8Array; width: number; height: number }

type Who = 'jo' | 'ruth' | 'earl' | 'alex';
export interface DemoPost {
  caption: string;
  pictures: string[];
  to: 'everyone' | 'dadSide' | 'momSide';
  daysAgo: number;
  hearts: Who[];
  replies: { who: Who; body: string }[];
}

/** Oldest first. Grandma Jo is on Dad's side, so she never sees the Mom's-side posts (DEMO-10). */
export const DEMO_POSTS: DemoPost[] = [
  { caption: 'Beach weekend. Found these on my phone from August', pictures: ['beach'], to: 'everyone', daysAgo: 24,
    hearts: ['jo', 'ruth', 'earl'], replies: [{ who: 'ruth', body: 'Look at that sky!' }] },
  { caption: 'First day of second grade. Leo wanted the front seat', pictures: ['bus'], to: 'everyone', daysAgo: 19,
    hearts: ['jo', 'ruth', 'earl', 'alex'], replies: [{ who: 'jo', body: 'So grown up! Tell him Grandma is proud.' }] },
  { caption: 'The kite finally flew at the park', pictures: ['kite'], to: 'dadSide', daysAgo: 15,
    hearts: ['earl', 'jo'], replies: [{ who: 'earl', body: "Next time I'll bring the big one." }] },
  { caption: "Mia's sunflowers are taller than she is", pictures: ['sunflowers'], to: 'momSide', daysAgo: 12,
    hearts: ['ruth'], replies: [{ who: 'ruth', body: 'Your grandpa would love that garden.' }] },
  { caption: 'Canoe day at the lake', pictures: ['lake'], to: 'momSide', daysAgo: 9, hearts: ['ruth'], replies: [] },
  { caption: 'Mia turned 5!', pictures: ['cake', 'sunflowers'], to: 'everyone', daysAgo: 6,
    hearts: ['jo', 'ruth', 'earl', 'alex'], replies: [{ who: 'jo', body: 'Happy birthday, sweet girl!' }, { who: 'ruth', body: 'Five already!' }] },
  { caption: 'Pumpkin patch day', pictures: ['pumpkins'], to: 'dadSide', daysAgo: 2,
    hearts: ['jo'], replies: [{ who: 'jo', body: 'Save me one for a pie!' }] },
];

const userOf = (w: Who): string => F.users[w].id;
const iso = (t: number) => new Date(t).toISOString();

/** Seeds the demo family into a fixture backend (made with joIsMember: true). */
export async function seedDemo(be: FakeBackend, load: (name: string) => Promise<DemoPicture>): Promise<void> {
  for (const [id, name] of Object.entries(DEMO_NAMES)) {
    be.state.users[id]!.name = name;
    be.state.users[id]!.email = `${name.toLowerCase()}@example.com`;
  }
  const parent = F.users.chase.id;
  const now = Date.now();
  let n = 0;
  for (const p of DEMO_POSTS) {
    n += 1;
    const at = now - p.daysAgo * DAY - 3 * 3600e3;
    let pics: DemoPicture[];
    try {
      pics = await Promise.all(p.pictures.map(load));
    } catch {
      continue; // a picture that didn't load skips its post; the rest of the family still shows
    }
    const post = be.createPost(parent, { clientId: `demo-${n}`, space: F.space.id, caption: p.caption, circleIds: [F.circles[p.to].id] });
    const grant = be.signUpload(parent, post, pics.map((pic) => ({
      kind: 'photo', mime_type: 'image/jpeg', width: pic.width, height: pic.height, byte_size: 0, thumb_byte_size: 0, exif_stripped: true,
    })));
    for (const [i, pic] of pics.entries()) {
      const g = grant.items[i]!;
      const display = await encryptMediaAsync(pic.display, g.dek);
      const thumb = await encryptMediaAsync(pic.thumb, g.dek);
      const m = be.state.media[g.media_id]!;
      m.byte_size = display.length;
      m.thumb_byte_size = thumb.length;
      be.putObject(g.display_put_url, display, g.required_headers);
      be.putObject(g.thumb_put_url, thumb, g.required_headers);
    }
    be.finalizeMedia(parent, grant.items.map((g) => g.media_id));
    be.publishPost(parent, post);
    const row = be.state.posts[post]!;
    row.created_at = iso(at);
    row.published_at = iso(at);
    row.taken_at = iso(at);
    for (const w of p.hearts) be.state.hearts.push({ post, user: userOf(w) });
    p.replies.forEach((r, k) => {
      const c = be.addComment(userOf(r.who), { post, body: r.body, clientId: `demo-${n}-${k}` });
      be.state.comments[c.comment_id]!.created_at = iso(at + (k + 1) * 47 * 60e3);
    });
  }
  setDemoViewer(be, 'parent');
}

/** RR-10: whose eyes the demo shows. The app reloads after a switch to pick up the new session. */
export function setDemoViewer(be: FakeBackend, who: 'parent' | 'grandma'): void {
  be.state.appSession = who === 'parent' ? F.users.chase.id : F.users.jo.id;
  be.changed();
}

export function demoViewer(be: FakeBackend): 'parent' | 'grandma' {
  return be.state.appSession === F.users.jo.id ? 'grandma' : 'parent';
}

/** Start over: only Hearth's own keys. chaseholroyd.com hosts other demos on the same origin. */
export function demoKeysToClear(keys: string[]): string[] {
  return keys.filter((k) => k.startsWith('hearth.') || k.startsWith('hs_'));
}
