# @holroyd/messenger

End-to-end encrypted group messaging on MLS ([RFC 9420](https://www.rfc-editor.org/rfc/rfc9420)) that any product can drop in. Messages are sealed on the device. The server only passes along bytes it can't open.

It was built for Hearth, a private family photo app, and moved here so other products can use it. Crew Clock is next. Nothing inside the library knows about families, crews or groups. A product plugs in three things:

| Interface | What it is | Hearth's version |
|---|---|---|
| `Relay` | The server that stores and hands out opaque MLS bytes: device keys, key packages, key changes, welcomes and sealed messages | Migration 0015's RPCs (`app/src/messenger/client.ts`) |
| `Roster` | Who belongs in a conversation right now, with each person's device signing key | `chat_roster`: a group's members plus the parents |
| `Store` | This device's keys, group state and history. It holds private keys, so encrypt it at rest | `secureSessionStorage` (AES-GCM, key in SecureStore) |

You also pass a secure random source (`random`). Never use `Math.random`.

## Use it

```ts
import { Messenger } from '@holroyd/messenger';

const chat = new Messenger({ relay, roster, store, me: userId, random: (n) => crypto.getRandomValues(new Uint8Array(n)) });
const view = await chat.open('crew-7');      // { status: 'ready' | 'waiting', lines }
await chat.send('crew-7', 'Shift starts at 7');
```

`open` does a full visit. It publishes this device's keys if needed, starts or joins the group, applies new key changes and messages in order, then adds or removes devices to match the roster. A new member is `waiting` until someone already in the group opens the conversation; that device lets them in. When two devices change keys at once, one wins the epoch. The other catches up and retries, so the group never splits.

## The relay

`relay/supabase.sql` is a ready-made relay for Supabase (Postgres plus PostgREST). Copy it into a migration, then write one function, your membership rule:

```sql
create or replace function private.messenger_people(p_conversation text)
returns table (user_id uuid, name text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.display_name, m.joined_at
  from public.crew_members m join public.profiles p on p.id = m.user_id
  where m.crew_id::text = p_conversation
$$;
```

Map its RPCs to `Relay` and `Roster` one to one: `messenger_publish_device`, `messenger_key_package_count`, `messenger_start`, `messenger_claim`, `messenger_send`, `messenger_fetch` and `messenger_roster`. Map the `23505` error from `messenger_send` to "epoch taken" with `isEpochConflict: (e) => e.code === '23505'`. `relay/test.sql` checks the relay's rules with a toy membership rule (RELAY-1..9). It runs in one transaction and rolls back.

## Crypto

The ciphersuite is `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519`, on [ts-mls](https://github.com/LukaJCB/ts-mls) 1.6.4 and the audited `@noble` libraries. HPKE (RFC 9180, base mode) is implemented in `src/crypto.ts` because Expo Go (Hermes) has no WebCrypto. Hearth's tests check that it interoperates with ts-mls's WebCrypto suite in both directions, and that keys never come from a weak random source.

**Warning:** `src/crypto.ts` and the engine are our own code around audited libraries. They have not had an outside security review yet. Don't promise users more than that until one is done.

Known limits:
- There are no safety numbers yet. A compromised server could add a hidden device to a conversation.
- The server sees who talks in which conversation, when, and roughly how much.
- One device per person. A new device replaces the old one at the next key change, and history doesn't move with it.
- There's no push. The product decides when to call `open`.

## Tests

The tests live in `src/__tests__/`. PKG-1..6 run the engine against in-memory test fakes of all three interfaces. Hearth runs them in its app suite (`cd app && npx jest ../packages/messenger`). `relay/test.sql` checks the relay (`psql -v ON_ERROR_STOP=1 -f relay/test.sql` on a scratch database).

## Using it from an Expo app

Until the library has its own repo, link it with `"@holroyd/messenger": "file:../packages/messenger"`. Then point Metro at it (`watchFolders`, plus `resolver.nodeModulesPaths` for your `node_modules`), set `preserveSymlinks` in `tsconfig.json`, and add `roots` and `modulePaths` in your Jest config. `app/metro.config.js` in Hearth shows how.

## License

Copyright (C) 2026 Chase Holroyd.

This library is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE). Every source file carries `SPDX-License-Identifier: AGPL-3.0-or-later`.

The AGPL means a product that uses this library, including over a network, must offer its users its own source under the AGPL too. Decision: Product Studio STU-DEC-1, licensed AGPL-3.0 by Chase on Oct 26, 2026 (Hearth DEC-42).
