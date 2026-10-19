// EVT-6..9 (Chase, Oct 18 "Yes build both"): inside an event, everyone's photos as one timeline by when they were
// taken (oldest first: an event reads like a story), a header per local day, 1-hour moments, a filter per person,
// and photos with no capture time last under "Added later". Written first: red until src/feed/eventTimeline.ts exists.
import type { FeedPost } from '../../api/HearthApi';
import { ADDED_LATER, MOMENT_GAP_MS, dayLabel, eventContributors, eventTimeline, momentLine, timeLabel } from '../eventTimeline';

let n = 0;
const NAMES: Record<string, string> = { danielle: 'Danielle', rachel: 'Rachel', susan: 'Susan' };
/** Local time in Oct 2026 (the 24th is a Saturday). */
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();

function post(author: string, takenAt: string | null, publishedAt: string, photos = 1): FeedPost {
  n += 1;
  return {
    post_id: `p${n}`, author_id: author, author_name: NAMES[author]!, caption: null, published_at: publishedAt, taken_at: takenAt,
    media: Array.from({ length: photos }, (_, i) => ({ media_id: `m${n}-${i}`, kind: 'photo' as const, width: 4, height: 3, duration_ms: null, status: 'ready' as const })),
    heart_count: 0, i_hearted: false, comment_count: 0, audience: null, seen_count: null, reach_count: null,
    event_id: 'e1', event_name: 'Beach day',
  };
}

const shape = (rows: ReturnType<typeof eventTimeline>) =>
  rows.map((r) => (r.type === 'moment' ? `moment:${r.photos.map((p) => p.media.media_id).join(',')}` : `${r.type}:${r.label}`));

describe('EVT-6 one timeline for the event, by when the photos were taken', () => {
  it('EVT-6 every member\'s photos merge, oldest taken first, whatever order they were shared in', () => {
    const late = post('rachel', at(24, 15), at(26, 9)); // shared two days later
    const early = post('danielle', at(24, 9), at(24, 20));
    const rows = eventTimeline([late, early]); // feed order: newest shared first
    const photos = rows.flatMap((r) => (r.type === 'moment' ? r.photos : []));
    expect(photos.map((p) => p.postId)).toEqual([early.post_id, late.post_id]);
  });

  it('EVT-6 a header before each local day: "Saturday, Oct 24"', () => {
    const sat = post('danielle', at(24, 10), at(24, 11));
    const sun = post('rachel', at(25, 10), at(25, 11));
    const rows = eventTimeline([sun, sat]);
    expect(rows.filter((r) => r.type === 'day').map((r) => r.type === 'day' && r.label)).toEqual(['Saturday, Oct 24', 'Sunday, Oct 25']);
    expect(dayLabel(at(24, 0, 5))).toBe('Saturday, Oct 24');
  });
});

describe('EVT-7 moments', () => {
  it('EVT-7 the gap is 1 hour', () => {
    expect(MOMENT_GAP_MS).toBe(60 * 60 * 1000);
  });

  it('EVT-7 photos within an hour of the one before, on one day, are one moment, whoever took them', () => {
    const a = post('danielle', at(24, 15, 10), at(24, 16), 2);
    const b = post('rachel', at(24, 15, 40), at(24, 16));
    const c = post('susan', at(24, 16, 35), at(24, 17)); // 55 min after b
    const d = post('rachel', at(24, 18, 0), at(24, 18)); // 85 min after c: new moment
    const e = post('danielle', at(25, 0, 10), at(25, 1)); // next day: new header, new moment
    const rows = eventTimeline([e, d, c, b, a]);
    expect(shape(rows)).toEqual([
      'day:Saturday, Oct 24',
      `moment:${a.media[0]!.media_id},${a.media[1]!.media_id},${b.media[0]!.media_id},${c.media[0]!.media_id}`,
      `moment:${d.media[0]!.media_id}`,
      'day:Sunday, Oct 25',
      `moment:${e.media[0]!.media_id}`,
    ]);
    const first = rows[1]!;
    expect(first.type === 'moment' && first.line).toBe('3:10 pm · 4 photos from Danielle, Rachel and Susan');
    const lone = rows[2]!;
    expect(lone.type === 'moment' && lone.line).toBe('6:00 pm · 1 photo from Rachel');
  });

  it('EVT-7 each photo knows who it is from and which post (and place in the post) holds it', () => {
    const a = post('rachel', at(24, 10), at(24, 11), 2);
    const rows = eventTimeline([a]);
    const m = rows.find((r) => r.type === 'moment')!;
    expect(m.type === 'moment' && m.photos.map((p) => [p.postId, p.index, p.from])).toEqual([[a.post_id, 0, 'Rachel'], [a.post_id, 1, 'Rachel']]);
  });

  it('EVT-7 times read plainly: "3:10 pm", "12:05 am", "12:00 pm"', () => {
    expect(timeLabel(at(24, 15, 10))).toBe('3:10 pm');
    expect(timeLabel(at(24, 0, 5))).toBe('12:05 am');
    expect(timeLabel(at(24, 12, 0))).toBe('12:00 pm');
    expect(momentLine(at(24, 9, 0), 2, ['Susan'])).toBe('9:00 am · 2 photos from Susan');
  });

  it('EVT-7 pending or failed photos are left out', () => {
    const a = post('rachel', at(24, 10), at(24, 11), 2);
    a.media[1] = { ...a.media[1]!, status: 'pending' };
    const rows = eventTimeline([a]);
    const m = rows.find((r) => r.type === 'moment')!;
    expect(m.type === 'moment' && m.photos).toHaveLength(1);
  });
});

describe('EVT-8 one person\'s photos', () => {
  it('EVT-8 the contributors, by name, each once; only people with a photo', () => {
    const a = post('susan', at(24, 10), at(24, 11));
    const b = post('danielle', at(24, 11), at(24, 12));
    const c = post('susan', at(24, 12), at(24, 13));
    const empty = post('rachel', at(24, 12), at(24, 13), 0);
    expect(eventContributors([c, empty, b, a])).toEqual([{ authorId: 'danielle', name: 'Danielle' }, { authorId: 'susan', name: 'Susan' }]);
  });

  it('EVT-8 filtering to one person keeps only her photos, with days and moments worked out again', () => {
    const a = post('danielle', at(24, 10), at(24, 11));
    const b = post('rachel', at(24, 10, 30), at(24, 11));
    const c = post('danielle', at(24, 10, 50), at(24, 11));
    const rows = eventTimeline([c, b, a], { person: 'danielle' });
    expect(shape(rows)).toEqual(['day:Saturday, Oct 24', `moment:${a.media[0]!.media_id},${c.media[0]!.media_id}`]);
    const m = rows[1]!;
    expect(m.type === 'moment' && m.line).toBe('10:00 am · 2 photos from Danielle');
  });
});

describe('EVT-9 photos with no capture time', () => {
  it('EVT-9 go last under "Added later", in the order they were shared', () => {
    const dated = post('rachel', at(24, 10), at(24, 11));
    const u2 = post('susan', null, at(26, 9));
    const u1 = post('danielle', null, at(25, 9), 2);
    const rows = eventTimeline([u2, u1, dated]);
    expect(ADDED_LATER).toBe('Added later');
    expect(shape(rows)).toEqual([
      'day:Saturday, Oct 24',
      `moment:${dated.media[0]!.media_id}`,
      'later:Added later',
      `moment:${u1.media[0]!.media_id},${u1.media[1]!.media_id},${u2.media[0]!.media_id}`,
    ]);
    const last = rows[3]!;
    expect(last.type === 'moment' && last.line).toBe('3 photos from Danielle and Susan');
  });

  it('EVT-9 an event with no capture times at all is just "Added later"', () => {
    const rows = eventTimeline([post('susan', null, at(26, 9))]);
    expect(shape(rows)[0]).toBe('later:Added later');
  });
});
