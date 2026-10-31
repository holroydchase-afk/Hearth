// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Web is a test harness only; keep the session in localStorage (in memory when the browser blocks it, HARD-7).
import { webKV } from './webStorage';

export const secureSessionStorage = webKV();
