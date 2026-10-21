// MSG-4: MLS runs with no WebCrypto (Expo Go / Hermes has no crypto.subtle), and Hearth's noble-only
// ciphersuite talks to ts-mls's own WebCrypto one, so it is real RFC 9420 / RFC 9180 and not a private dialect.
import {
  createApplicationMessage, createCommit, createGroup, defaultCapabilities, defaultLifetime, emptyPskIndex,
  generateKeyPackage, getCiphersuiteFromName, joinGroup, processPrivateMessage,
  type CiphersuiteImpl,
} from 'ts-mls';
import { CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/core';
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { makeGenericHpke } from 'ts-mls/crypto/implementation/hpke.js';
import { makeHashImpl } from 'ts-mls/crypto/implementation/default/makeHashImpl.js';
import { makeKdf, makeKdfImpl } from 'ts-mls/crypto/implementation/default/makeKdfImpl.js';
import { makeNobleSignatureImpl } from 'ts-mls/crypto/implementation/default/makeNobleSignatureImpl.js';
import { HEARTH_SUITE, hearthCiphersuite } from '../mlsCrypto';

// The reference: ts-mls's own WebCrypto pieces (@hpke/core HPKE, WebCrypto HMAC/HKDF/Ed25519), assembled here
// because getCiphersuiteImpl loads the ChaCha AEAD with a dynamic import that Jest can't run.
async function referenceSuite(): Promise<CiphersuiteImpl> {
  const aead = {
    encrypt: async (k: Uint8Array, n: Uint8Array, a: Uint8Array, p: Uint8Array) => chacha20poly1305(k, n, a).encrypt(p),
    decrypt: async (k: Uint8Array, n: Uint8Array, a: Uint8Array, c: Uint8Array) => chacha20poly1305(k, n, a).decrypt(c),
  };
  const cs = new CipherSuite({ kem: new DhkemX25519HkdfSha256(), kdf: new HkdfSha256(), aead: new Chacha20Poly1305() });
  const real = getCiphersuiteFromName(HEARTH_SUITE);
  return {
    name: HEARTH_SUITE,
    hash: makeHashImpl(globalThis.crypto.subtle, real.hash),
    kdf: makeKdfImpl(makeKdf(real.hpke.kdf)),
    signature: await makeNobleSignatureImpl(real.signature),
    hpke: await makeGenericHpke(real.hpke, aead as never, cs),
    rng: { randomBytes: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)) },
  };
}

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

async function roundTrip(alice: CiphersuiteImpl, bob: CiphersuiteImpl, text: string): Promise<string[]> {
  const a = await generateKeyPackage({ credentialType: 'basic', identity: enc('alice') }, defaultCapabilities(), defaultLifetime, [], alice);
  let ag = await createGroup(enc('group-1'), a.publicPackage, a.privatePackage, [], alice);
  const b = await generateKeyPackage({ credentialType: 'basic', identity: enc('bob') }, defaultCapabilities(), defaultLifetime, [], bob);
  const commit = await createCommit({ state: ag, cipherSuite: alice }, { extraProposals: [{ proposalType: 'add', add: { keyPackage: b.publicPackage } }] });
  ag = commit.newState;
  let bg = await joinGroup(commit.welcome!, b.publicPackage, b.privatePackage, emptyPskIndex, bob, ag.ratchetTree);
  const toBob = await createApplicationMessage(ag, enc(text), alice);
  const gotBob = await processPrivateMessage(bg, toBob.privateMessage, emptyPskIndex, bob);
  if (gotBob.kind !== 'applicationMessage') throw new Error('expected an application message');
  bg = gotBob.newState;
  const toAlice = await createApplicationMessage(bg, enc('reply: ' + text), bob);
  const gotAlice = await processPrivateMessage(commit.newState, toAlice.privateMessage, emptyPskIndex, alice);
  if (gotAlice.kind !== 'applicationMessage') throw new Error('expected an application message');
  return [dec(gotBob.message), dec(gotAlice.message)];
}

describe('MSG-4 MLS crypto without WebCrypto', () => {
  const realCrypto = globalThis.crypto;

  it('MSG-4: uses ciphersuite 3 (X25519, ChaCha20-Poly1305, SHA-256, Ed25519)', () => {
    expect(HEARTH_SUITE).toBe('MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519');
  });

  it('MSG-4: a group of two sends and reads messages with crypto.subtle gone', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: <T extends ArrayBufferView>(a: T) => realCrypto.getRandomValues(a as never) as T },
      configurable: true,
    });
    try {
      expect((globalThis.crypto as Crypto).subtle).toBeUndefined();
      const impl = await hearthCiphersuite();
      expect(await roundTrip(impl, impl, 'Hi Bebar')).toEqual(['Hi Bebar', 'reply: Hi Bebar']);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
    }
  });

  it('MSG-4: talks both ways with ts-mls\'s own WebCrypto ciphersuite (interop)', async () => {
    const ours = await hearthCiphersuite();
    const theirs = await referenceSuite();
    expect(await roundTrip(ours, theirs, 'ours to theirs')).toEqual(['ours to theirs', 'reply: ours to theirs']);
    expect(await roundTrip(theirs, ours, 'theirs to ours')).toEqual(['theirs to ours', 'reply: theirs to ours']);
  });

  it('MSG-4: HPKE seal/open and export match the reference both ways', async () => {
    const ours = (await hearthCiphersuite()).hpke;
    const theirs = (await referenceSuite()).hpke;
    const kp = await ours.generateKeyPair();
    const pubBytes = await ours.exportPublicKey(kp.publicKey);
    const privBytes = await ours.exportPrivateKey(kp.privateKey);
    const theirPub = await theirs.importPublicKey(pubBytes);
    const theirPriv = await theirs.importPrivateKey(privBytes);
    const info = enc('info'); const aad = enc('aad');
    const s1 = await theirs.seal(theirPub, enc('to ours'), info, aad);
    expect(dec(await ours.open(kp.privateKey, s1.enc, s1.ct, info, aad))).toBe('to ours');
    const s2 = await ours.seal(kp.publicKey, enc('to theirs'), info, aad);
    expect(dec(await theirs.open(theirPriv, s2.enc, s2.ct, info, aad))).toBe('to theirs');
    const e1 = await ours.exportSecret(kp.publicKey, enc('ctx'), 32, info);
    expect(await theirs.importSecret(theirPriv, enc('ctx'), e1.enc, 32, info)).toEqual(e1.secret);
    // T8: export interop in the other direction too (theirs exports, ours imports).
    const e2 = await theirs.exportSecret(theirPub, enc('ctx2'), 32, info);
    expect(await ours.importSecret(kp.privateKey, enc('ctx2'), e2.enc, 32, info)).toEqual(e2.secret);
    const ikm = enc('derive me please, 32 bytes or so!!');
    const d1 = await ours.deriveKeyPair(ikm); const d2 = await theirs.deriveKeyPair(ikm);
    expect(await ours.exportPublicKey(d1.publicKey)).toEqual(await theirs.exportPublicKey(d2.publicKey));
  });

  it('MSG-4: a tampered ciphertext is refused', async () => {
    const h = (await hearthCiphersuite()).hpke;
    const kp = await h.generateKeyPair();
    const s = await h.seal(kp.publicKey, enc('secret'), enc('i'));
    s.ct[0] = s.ct[0]! ^ 1;
    await expect(h.open(kp.privateKey, s.enc, s.ct, enc('i'))).rejects.toThrow();
  });
});

// T8: RFC 9180 Appendix A.2.1 known-answer vector (DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20Poly1305,
// base mode), copied from the CFRG test-vectors.json (cfrg/draft-irtf-cfrg-hpke). Checks our own HPKE glue against
// the standard's numbers, not just against another library.
describe('T8 HPKE known-answer vector (RFC 9180 A.2.1)', () => {
  const h = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
  const hx = (b: Uint8Array) => Buffer.from(b).toString('hex');
  const V = {
    info: '4f6465206f6e2061204772656369616e2055726e',
    ikmR: '1ac01f181fdf9f352797655161c58b75c656a6cc2716dcb66372da835542e1df',
    skRm: '8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb',
    pkRm: '4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a',
    enc: '1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a',
    aad: '436f756e742d30',
    ct: '1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db21993c62ce81883d2dd1b51a28',
    pt: '4265617574792069732074727574682c20747275746820626561757479',
    exports: [
      { ctx: '', value: '4bbd6243b8bb54cec311fac9df81841b6fd61f56538a775e7c80a9f40160606e' },
      { ctx: '00', value: '8c1df14732580e5501b00f82b10a1647b40713191b7c1240ac80e2b68808ba69' },
      { ctx: '54657374436f6e74657874', value: '5acb09211139c43b3090489a9da433e8a30ee7188ba8b0a9a1ccf0c229283e53' },
    ],
  };

  it('T8: deriving the recipient key pair from ikmR gives skRm and pkRm', async () => {
    const ours = (await hearthCiphersuite()).hpke;
    const kp = await ours.deriveKeyPair(h(V.ikmR));
    expect(hx(await ours.exportPrivateKey(kp.privateKey))).toBe(V.skRm);
    expect(hx(await ours.exportPublicKey(kp.publicKey))).toBe(V.pkRm);
  });

  it('T8: opening the first encryption with skRm gives the plaintext', async () => {
    const ours = (await hearthCiphersuite()).hpke;
    const sk = await ours.importPrivateKey(h(V.skRm));
    expect(hx(await ours.open(sk, h(V.enc), h(V.ct), h(V.info), h(V.aad)))).toBe(V.pt);
  });

  it('T8: the exporter gives the published values', async () => {
    const ours = (await hearthCiphersuite()).hpke;
    const sk = await ours.importPrivateKey(h(V.skRm));
    for (const e of V.exports) expect(hx(await ours.importSecret(sk, h(e.ctx), h(V.enc), 32, h(V.info)))).toBe(e.value);
  });
});
