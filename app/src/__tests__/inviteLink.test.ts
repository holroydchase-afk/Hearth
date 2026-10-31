// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// ONB-3 / ONB-4 (docs/product onboarding review, Oct 18): an invite link opens the hosted web build on the
// "X invited you" join screen, and nothing points at hearth.family (not bought: docs/product/ACCOUNTS.md).
// The server builds the link from private.secrets.invite_link_base; the app's fallback and the Fake must agree.
import fs from 'fs';
import path from 'path';
import { FakeBackend, FIXTURE } from '../api/fake/FakeBackend';
import { JOIN_LINK_BASE } from '../api/SupabaseApi';

const HOSTED_JOIN = 'https://thefreighttrains-team-hearth.expo.app/join/';
const MIGRATIONS = path.resolve(__dirname, '../../../backend/supabase/migrations');

/** The invite_link_base the migrations leave behind (the last one to set it wins). */
function migratedLinkBase(): string | null {
  let last: string | null = null;
  for (const f of fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    const re = /\('invite_link_base',\s*'([^']+)'\)|set value\s*=\s*'([^']+)'\s+where name\s*=\s*'invite_link_base'/g;
    for (let m = re.exec(sql); m; m = re.exec(sql)) last = m[1] ?? m[2] ?? last;
  }
  return last;
}

describe('ONB-3 / ONB-4 invite links open the web build', () => {
  it('ONB-3 the app\'s join link base is the hosted web build, not hearth.family', () => {
    expect(JOIN_LINK_BASE).toBe(HOSTED_JOIN);
    expect(JOIN_LINK_BASE).not.toMatch(/hearth\.family/);
  });

  it('ONB-3 the server\'s invite_link_base (after every migration) agrees with the app', () => {
    expect(migratedLinkBase()).toBe(JOIN_LINK_BASE);
  });

  it('ONB-4 the link\'s path is a route the app has (app/src/app/join/[code].tsx), so it is never a 404', () => {
    const route = new URL(JOIN_LINK_BASE).pathname; // "/join/"
    expect(fs.existsSync(path.resolve(__dirname, '../app', `.${route}[code].tsx`))).toBe(true);
  });

  it('ONB-4 the Fake makes the same links as the server, so the web e2e opens what a parent sends', async () => {
    const be = FakeBackend.withFixture();
    const r = await be.clientFor(FIXTURE.users.chase.id).createInvite({ space: FIXTURE.space.id, role: 'viewer', circleIds: [FIXTURE.circles.dadSide.id], history: 'all' });
    expect(r.link.startsWith(JOIN_LINK_BASE)).toBe(true);
  });
});
