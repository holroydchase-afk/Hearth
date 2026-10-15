import { FakeBackend, FIXTURE } from '../fake/FakeBackend';
import { encryptMedia, encryptedSize } from '../../crypto/media';
import type { ContractHarness, ContractUser } from './harness';

export async function fakeHarness(): Promise<ContractHarness> {
  const be = FakeBackend.withFixture();
  const ids: Record<ContractUser, string> = {
    poster: FIXTURE.users.chase.id,
    viewerIn: FIXTURE.users.jo.id,
    viewerOut: FIXTURE.users.ruth.id,
    joiner: FIXTURE.users.newbie.id,
    ratelimit: FIXTURE.users.newbie2.id,
  };
  return {
    name: 'FakeApi',
    spaceId: FIXTURE.space.id,
    circleIn: FIXTURE.circles.dadSide.id,
    circleOut: FIXTURE.circles.momSide.id,
    joinerEmail: FIXTURE.users.newbie.email,
    has: () => true,
    as: (u) => be.clientFor(ids[u]),
    anon: () => be.clientFor(null),
    supportsMedia: true,
    attachReadyMedia: async (api, postId) => {
      const d = new Uint8Array(64), t = new Uint8Array(16);
      const g = (await api.signUpload(postId, [{ kind: 'photo', mime_type: 'image/jpeg', width: 4, height: 3, duration_ms: null, byte_size: encryptedSize(64), thumb_byte_size: encryptedSize(16), exif_stripped: true }])).items[0]!;
      await api.putObject(g.display_put_url, encryptMedia(d, g.dek), g.required_headers);
      await api.putObject(g.thumb_put_url, encryptMedia(t, g.dek), g.required_headers);
      await api.finalizeMedia([g.media_id]);
    },
  };
}
