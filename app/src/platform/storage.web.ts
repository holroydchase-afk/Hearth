// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import type { KV } from './kv';
import { webKV } from './webStorage';

// Web: the same localStorage keys AsyncStorage uses there, but a blocked browser keeps them in memory (HARD-7).
export const asyncStorageKV: KV = webKV();
