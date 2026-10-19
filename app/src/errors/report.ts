// BETA-OPS-1: build an error report that cannot carry user content. Only the error's
// type and API code leave the phone; the message (which may hold a caption, URL or
// email) never does. Same field rules as report_client_error in migration 0006.
import { Platform } from 'react-native';
import pkg from '../../package.json';
import type { ClientErrorReport } from '../api/types';

const KIND = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
const SCREEN = /^[A-Za-z0-9_/[\]-]{1,40}$/;
const CODE = /^[A-Za-z0-9_]{1,20}$/;

export function osString(): string {
  const os = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  const v = String(Platform.Version ?? '').replace(/[^0-9.]/g, '').slice(0, 12);
  return v ? `${os} ${v}` : os;
}

export function errorReport(e: unknown, screen: string): ClientErrorReport {
  const name = e instanceof Error ? e.name : '';
  const code = (e as { code?: unknown } | null)?.code;
  const r: ClientErrorReport = {
    appVersion: pkg.version,
    os: osString(),
    screen: SCREEN.test(screen) ? screen : 'unknown',
    kind: KIND.test(name) ? name : 'Error',
  };
  if (typeof code === 'string' && CODE.test(code)) r.code = code;
  return r;
}
