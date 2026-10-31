// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// ONB-3: where invite links open. The server builds the same address from private.secrets.invite_link_base
// (migration 0014) + the invite's link token; this is the app's fallback and the Fake's. /join/ is the app's
// join route (src/app/join/[code].tsx). Not hearth.family until that domain is bought (ONB-8).
export const JOIN_LINK_BASE = 'https://thefreighttrains-team-hearth.expo.app/join/';
