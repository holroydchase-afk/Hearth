// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// PRIV-G2 / GRP-12: the fake applies the server's invite rule (redeem_invite, migration 0013).
// A new invite puts the person in Everyone only if it names Everyone. An invite made before 0013
// (household_means_everyone) that names a household keeps the old meaning: Everyone too.
import { FIXTURE, FakeBackend } from '../fake/FakeBackend';

const F = FIXTURE;
const HOUSE = '00000000-0000-4000-8000-000000000300';

function backend() {
  const be = FakeBackend.withFixture();
  be.state.circles[HOUSE] = { id: HOUSE, space: F.space.id, name: "Kim's house", created_by: F.users.chase.id, deleted: false, kind: 'household' };
  return be;
}
const inEveryone = (be: FakeBackend, user: string) => be.inCircle(F.circles.everyone.id, user);

describe('PRIV-G2 / GRP-12 FakeBackend invites', () => {
  it('PRIV-G2 a new invite naming only a household places the person there and NOT in Everyone', () => {
    const be = backend();
    const { code } = be.createInvite(F.users.chase.id, { space: F.space.id, role: 'viewer', circleIds: [HOUSE], history: 'all' });
    be.redeemInvite(F.users.newbie.id, code);
    expect(be.inCircle(HOUSE, F.users.newbie.id)).toBe(true);
    expect(inEveryone(be, F.users.newbie.id)).toBe(false);
  });

  it('GRP-12 a new invite naming a household and Everyone places the person in both', () => {
    const be = backend();
    const { code } = be.createInvite(F.users.chase.id, { space: F.space.id, role: 'viewer', circleIds: [HOUSE, F.circles.everyone.id], history: 'all' });
    be.redeemInvite(F.users.newbie.id, code);
    expect(be.inCircle(HOUSE, F.users.newbie.id)).toBe(true);
    expect(inEveryone(be, F.users.newbie.id)).toBe(true);
  });

  it('GRP-12 an invite made before 0013 (household means Everyone) naming a household still adds Everyone', () => {
    const be = backend();
    be.state.invites.OLDHOUSE23 = {
      code: 'OLDHOUSE23', space: F.space.id, role: 'viewer', circles: [HOUSE], created_by: F.users.chase.id, target_email: null,
      expires_at: new Date(Date.now() + 864e5).toISOString(), max_uses: 1, uses: 0, revoked: false, history: 'all',
      householdMeansEveryone: true,
    };
    be.redeemInvite(F.users.newbie.id, 'OLDHOUSE23');
    expect(be.inCircle(HOUSE, F.users.newbie.id)).toBe(true);
    expect(inEveryone(be, F.users.newbie.id)).toBe(true);
  });
});
