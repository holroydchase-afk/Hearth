// "Did you mean june@yahoo.com?" for the email providers our families use (JOIN-2).
// Only suggests; never changes what someone typed.
const DOMAINS = [
  'gmail.com', 'yahoo.com', 'aol.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'live.com', 'msn.com',
  'frontier.com', 'frontiernet.net', 'att.net', 'comcast.net', 'sbcglobal.net', 'bellsouth.net', 'suddenlink.net', 'windstream.net',
];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

export function suggestEmail(typed: string): string | null {
  const t = typed.trim().toLowerCase();
  const at = t.lastIndexOf('@');
  if (at < 1) return null;
  const local = t.slice(0, at);
  const domain = t.slice(at + 1);
  if (domain.length < 4 || DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestD = 3;
  for (const d of DOMAINS) {
    const dist = distance(domain, d);
    if (dist < bestD) { best = d; bestD = dist; }
  }
  return best && bestD <= 2 ? `${local}@${best}` : null;
}
