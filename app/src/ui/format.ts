const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sun, Oct 11" in the phone's local time. No Intl dependency (old Android/Hermes builds). */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
export const photos = (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'}`;

/** "Chase", "Chase and Alex", "Chase, Alex and Jo" */
export function andList(names: string[]): string {
  const u = [...new Set(names.filter(Boolean))];
  if (u.length <= 1) return u[0] ?? '';
  return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}
