// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Hearth's side of the messenger (docs/product/SPEC-MESSENGER.md). The MLS engine is the shared library in
// packages/messenger (@holroyd/messenger); this file plugs in what is Hearth's own:
//   * the relay and roster are migration 0015's RPCs (a chat is a group or event; its people are the group's
//     members plus the parents, REPLY-10), and 23505 from chat_send means another phone took the epoch (MSG-5);
//   * storage is secureSessionStorage (AES-GCM, key in SecureStore), randomness is getRandomValues only (S17).
// Storage keys are unchanged ("chat.identity.<user>", "chat.group.<user>.<circle>"), so phones keep their chats.
import { memoryStore, Messenger, type Line, type Relay, type Roster, type Store, type View } from '@holroyd/messenger';
import type { HearthApi } from '../api/HearthApi';
import { isApiError } from '../api/HearthApi';
import { randomBytes } from '../crypto/random';
import { secureSessionStorage } from '../platform/secureSession';

export type ChatLine = Line;
export type ChatView = View;
export type ChatStore = Store;
export { memoryStore };

export function hearthRelay(api: HearthApi): Relay & Roster {
  return {
    publishDevice: (key, packages) => api.chatPublishDevice(key, packages),
    keyPackageCount: () => api.chatKeyPackageCount(),
    start: (circle) => api.chatStart(circle),
    claim: (circle, users) => api.chatClaim(circle, users),
    send: (circle, kind, epoch, body, recipient) => api.chatSend(circle, kind, epoch, body, recipient),
    fetch: (circle, after, limit) => api.chatFetch(circle, after, limit),
    members: (circle) => api.chatRoster(circle),
  };
}

export class ChatClient extends Messenger {
  constructor(api: HearthApi, me: string, store: ChatStore = secureSessionStorage) {
    const relay = hearthRelay(api);
    super({
      relay, roster: relay, store, me, random: randomBytes,
      isEpochConflict: (e) => isApiError(e) && e.code === '23505',
    });
  }
}
