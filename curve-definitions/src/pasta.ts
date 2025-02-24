/*! @noble/curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
import { sha256 } from '@noble/hashes/sha256';
import { weierstrass } from '@noble/curves/weierstrass';
import { getHash } from './_shortw_utils.js';
import * as mod from '@noble/curves/modular';

const p = BigInt('0x40000000000000000000000000000000224698fc094cf91b992d30ed00000001');
const q = BigInt('0x40000000000000000000000000000000224698fc0994a8dd8c46eb2100000001');

// https://neuromancer.sk/std/other/Pallas
export const pallas = weierstrass({
  a: BigInt(0),
  b: BigInt(5),
  P: p,
  n: q,
  Gx: mod.mod(BigInt(-1), p),
  Gy: BigInt(2),
  h: BigInt(1),
  ...getHash(sha256),
});
// https://neuromancer.sk/std/other/Vesta
export const vesta = weierstrass({
  a: BigInt(0),
  b: BigInt(5),
  P: q,
  n: p,
  Gx: mod.mod(BigInt(-1), q),
  Gy: BigInt(2),
  h: BigInt(1),
  ...getHash(sha256),
});
