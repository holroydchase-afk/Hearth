import type { HearthApi } from '../HearthApi';

export type ContractUser = 'poster' | 'viewerIn' | 'viewerOut' | 'joiner' | 'ratelimit';

/**
 * Anything that can hand out HearthApi clients for the standard cast:
 *  - poster:    owner of `spaceId`, manages `circleIn` and `circleOut`
 *  - viewerIn:  viewer in `circleIn` only
 *  - viewerOut: viewer in `circleOut` only (same space, never in circleIn)
 *  - joiner:    signed-in user who is not yet a member (for invite redemption)
 *  - ratelimit: throwaway user for the S10 rate-limit test (gets locked out for 10 minutes)
 */
export interface ContractHarness {
  name: string;
  spaceId: string;
  circleIn: string;
  circleOut: string;
  joinerEmail?: string;
  has(user: ContractUser): boolean;
  as(user: ContractUser): HearthApi;
  anon(): HearthApi;
  /** sign-media + object storage are reachable (needs B2 for a real stack). */
  supportsMedia: boolean;
  /** Give a draft one ready media item (publish_post needs at least one), however this stack can. */
  attachReadyMedia(poster: HearthApi, postId: string): Promise<void>;
}

export type HarnessFactory = () => Promise<ContractHarness>;
