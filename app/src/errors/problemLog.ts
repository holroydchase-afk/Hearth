// DBG-1/2/4: Chase's on-device problem log. The last 20 problems, in memory only: nothing is
// written to storage or sent anywhere. Only on when EXPO_PUBLIC_HEARTH_DEBUG=1 (Chase's preview
// builds), so relatives never see it (anchor A1). Each message is redacted before it is kept:
// no URLs, keys or tokens, emails, captions, file paths or photo metadata (DBG-2).
import * as Updates from 'expo-updates';
import pkg from '../../package.json';
import { isRetryable } from '../api/HearthApi';
import { toApiError } from './messages';
import { osString } from './report';

export interface ProblemEntry {
  time: string;
  where: string;
  code: string;
  retryable: boolean;
  message: string;
  appVersion: string;
  updateId: string;
  platform: string;
  expoSdk: string;
  /** Upload job id, so a failed item can show its own entry. Not part of the copied text. */
  ref?: string;
}

const MAX = 20;
const MAX_MESSAGE = 120;
const WHERE = /^[A-Za-z0-9_ :/[\]-]{1,40}$/;
const CODE = /^[A-Za-z0-9_]{1,20}$/;

let log: ProblemEntry[] = [];
const listeners = new Set<() => void>();

export const debugEnabled = (): boolean => process.env.EXPO_PUBLIC_HEARTH_DEBUG === '1';

const EXPO_SDK = (/(\d+)\./.exec(String((pkg as { dependencies: Record<string, string> }).dependencies.expo)) ?? [])[1] ?? 'unknown';

function updateId(): string {
  try {
    const id = Updates.updateId;
    return typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id) ? id : 'none (Expo Go or dev)';
  } catch {
    return 'none (Expo Go or dev)';
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** DBG-2: strip anything private from an error message. Order matters: whole URLs before paths. */
export function safeMessage(raw: string, scrub: (string | null | undefined)[] = []): string {
  let m = raw;
  for (const s of scrub) if (s && s.trim()) m = m.replace(new RegExp(escape(s.trim()), 'gi'), '[caption]');
  // Photo metadata: everything from the first metadata word on is dropped.
  m = m.replace(/\b(GPS\w*|Latitude|Longitude|Make|Model|Lens\w*|Serial\w*|DateTime\w*|Software|MakerNote|XMP|ICC|Exif\w*\s*[:=])[\s\S]*$/i, '[photo info removed]');
  m = m.replace(/"[^"]*"|“[^”]*”|'[^']{2,}'/g, '[text]'); // quoted text is usually a caption or name
  m = m.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[url]');
  m = m.replace(/\b(?:file|content|ph|assets-library|data|blob):\S*/gi, '[url]');
  m = m.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');
  m = m.replace(/\b(key|dek|token|secret|signature|sig|password|apikey|auth\w*|credential)\b\s*[:=]\s*\S+/gi, '$1=[hidden]');
  m = m.replace(/\beyJ[\w-]*\.[\w-]*\.?[\w-]*/g, '[token]');
  m = m.replace(/(?:~|\.{1,2})?\/[^\s]+/g, '[path]');
  m = m.replace(/\b[\w-]+\.(?:jpe?g|heic|heif|png|gif|webp|mov|mp4|m4v|dng)\b/gi, '[file]');
  m = m.replace(/[A-Za-z0-9+/_=-]{20,}/g, '[hidden]');
  m = m.replace(/-?\d{1,3}\.\d{3,}/g, '[number]'); // coordinates
  m = m.replace(/\s+/g, ' ').trim();
  return m.length > MAX_MESSAGE ? `${m.slice(0, MAX_MESSAGE - 1)}…` : m;
}

function errorName(e: unknown): string {
  const n = e instanceof Error ? e.name : '';
  return /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(n) ? n : 'Error';
}

export function recordProblem(e: unknown, where: string, opts: { scrub?: (string | null | undefined)[]; ref?: string } = {}): void {
  if (!debugEnabled()) return;
  try {
    const api = toApiError(e);
    const code = (e as { code?: unknown } | null)?.code;
    const entry: ProblemEntry = {
      time: new Date().toISOString(),
      where: WHERE.test(where) ? where : 'unknown',
      // An API code if there is one; otherwise the error type (TypeError…) for a plain Error.
      code: typeof code === 'string' && CODE.test(code) ? code : e instanceof Error ? errorName(e) : api.code,
      retryable: isRetryable(api),
      message: safeMessage(e instanceof Error ? e.message : typeof e === 'string' ? e : '', opts.scrub),
      appVersion: pkg.version,
      updateId: updateId(),
      platform: osString(),
      expoSdk: EXPO_SDK,
    };
    if (opts.ref) entry.ref = opts.ref;
    log = [entry, ...log].slice(0, MAX);
    listeners.forEach((f) => f());
  } catch {
    // the debug log must never cause a second problem
  }
}

/** Newest first. */
export function problems(): ProblemEntry[] {
  return log.map((e) => ({ ...e }));
}

export function clearProblems(): void {
  log = [];
  listeners.forEach((f) => f());
}

export function subscribeProblems(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function entryLines(e: ProblemEntry): string[] {
  return [
    `time: ${e.time}`,
    `where: ${e.where}`,
    `code: ${e.code}`,
    `retryable: ${e.retryable ? 'yes' : 'no'}`,
    `message: ${e.message || '(none)'}`,
    `app version: ${e.appVersion}`,
    `update id: ${e.updateId}`,
    `platform: ${e.platform}`,
    `expo sdk: ${e.expoSdk}`,
  ];
}

/** One plain-text block for "Copy for Claude": a header line, then key: value lines. */
export function problemText(list: ProblemEntry[]): string {
  const body = list.length ? list.map((e) => entryLines(e).join('\n')).join('\n\n') : 'problems: none';
  return `Hearth problem details\n${body}`;
}
