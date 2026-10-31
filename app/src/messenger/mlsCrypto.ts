// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Hearth's MLS ciphersuite: the shared library's noble-only suite (packages/messenger/src/crypto.ts), with keys
// from getRandomValues only (S17). MSG-4 tests it against ts-mls's WebCrypto suite (__tests__/mlsCrypto.test.ts).
import { MESSENGER_SUITE, messengerCiphersuite } from '@holroyd/messenger';
import type { CiphersuiteImpl } from 'ts-mls';
import { randomBytes } from '../crypto/random';

export const HEARTH_SUITE = MESSENGER_SUITE;

export function hearthCiphersuite(): Promise<CiphersuiteImpl> {
  return messengerCiphersuite(randomBytes);
}
