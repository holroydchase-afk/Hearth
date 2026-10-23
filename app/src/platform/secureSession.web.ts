// Web is a test harness only; keep the session in localStorage (in memory when the browser blocks it, HARD-7).
import { webKV } from './webStorage';

export const secureSessionStorage = webKV();
