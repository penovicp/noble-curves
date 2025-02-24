import { deepStrictEqual, throws } from 'assert';
import { should } from 'micro-should';
import * as fc from 'fast-check';
import * as mod from '@noble/curves/modular';
import { randomBytes } from '@noble/hashes/utils';
// Generic tests for all curves in package
import { secp192r1 } from '../lib/p192.js';
import { secp224r1 } from '../lib/p224.js';
import { secp256r1 } from '../lib/p256.js';
import { secp384r1 } from '../lib/p384.js';
import { secp521r1 } from '../lib/p521.js';
import { secp256k1 } from '../lib/secp256k1.js';
import { ed25519, ed25519ctx, ed25519ph } from '../lib/ed25519.js';
import { ed448, ed448ph } from '../lib/ed448.js';
import { starkCurve } from '../lib/stark.js';
import { pallas, vesta } from '../lib/pasta.js';
import { bn254 } from '../lib/bn.js';
import { jubjub } from '../lib/jubjub.js';

// prettier-ignore
const CURVES = {
  secp192r1, secp224r1, secp256r1, secp384r1, secp521r1,
  secp256k1,
  ed25519, ed25519ctx, ed25519ph,
  ed448, ed448ph,
  starkCurve,
  pallas, vesta,
  bn254,
  jubjub,
};

const NUM_RUNS = 5;
const getXY = (p) => ({ x: p.x, y: p.y });

function equal(a, b, comment) {
  deepStrictEqual(a.equals(b), true, `eq(${comment})`);
  if (a.toAffine && b.toAffine) {
    deepStrictEqual(getXY(a.toAffine()), getXY(b.toAffine()), `eqToAffine(${comment})`);
  } else if (!a.toAffine && !b.toAffine) {
    // Already affine
    deepStrictEqual(getXY(a), getXY(b), `eqAffine(${comment})`);
  } else throw new Error('Different point types');
}

for (const name in CURVES) {
  const C = CURVES[name];
  const CURVE_ORDER = C.CURVE.n;
  const FC_BIGINT = fc.bigInt(1n + 1n, CURVE_ORDER - 1n);

  // Check that curve doesn't accept points from other curves
  const O = name === 'secp256k1' ? secp256r1 : secp256k1;
  const POINTS = {};
  const OTHER_POINTS = {};
  for (const name of ['Point', 'JacobianPoint', 'ExtendedPoint', 'ProjectivePoint']) {
    POINTS[name] = C[name];
    OTHER_POINTS[name] = O[name];
  }

  for (const pointName in POINTS) {
    const p = POINTS[pointName];
    const o = OTHER_POINTS[pointName];
    if (!p) continue;

    const G = [p.ZERO, p.BASE];
    for (let i = 2; i < 10; i++) G.push(G[1].multiply(i));
    // Here we check basic group laws, to verify that points works as group
    should(`${name}/${pointName}/Basic group laws (zero)`, () => {
      equal(G[0].double(), G[0], '(0*G).double() = 0');
      equal(G[0].add(G[0]), G[0], '0*G + 0*G = 0');
      equal(G[0].subtract(G[0]), G[0], '0*G - 0*G = 0');
      equal(G[0].negate(), G[0], '-0 = 0');
      for (let i = 0; i < G.length; i++) {
        const p = G[i];
        equal(p, p.add(G[0]), `${i}*G + 0 = ${i}*G`);
        equal(G[0].multiply(i + 1), G[0], `${i + 1}*0 = 0`);
      }
    });
    should(`${name}/${pointName}/Basic group laws (one)`, () => {
      equal(G[1].double(), G[2], '(1*G).double() = 2*G');
      equal(G[1].subtract(G[1]), G[0], '1*G - 1*G = 0');
      equal(G[1].add(G[1]), G[2], '1*G + 1*G = 2*G');
    });
    should(`${name}/${pointName}/Basic group laws (sanity tests)`, () => {
      equal(G[2].double(), G[4], `(2*G).double() = 4*G`);
      equal(G[2].add(G[2]), G[4], `2*G + 2*G = 4*G`);
      equal(G[7].add(G[3].negate()), G[4], `7*G - 3*G = 4*G`);
    });
    should(`${name}/${pointName}/Basic group laws (addition commutativity)`, () => {
      equal(G[4].add(G[3]), G[3].add(G[4]), `4*G + 3*G = 3*G + 4*G`);
      equal(G[4].add(G[3]), G[3].add(G[2]).add(G[2]), `4*G + 3*G = 3*G + 2*G + 2*G`);
    });
    should(`${name}/${pointName}/Basic group laws (double)`, () => {
      equal(G[3].double(), G[6], '(3*G).double() = 6*G');
    });
    should(`${name}/${pointName}/Basic group laws (multiply)`, () => {
      equal(G[2].multiply(3), G[6], '(2*G).multiply(3) = 6*G');
    });
    should(`${name}/${pointName}/Basic group laws (same point addition)`, () => {
      equal(G[3].add(G[3]), G[6], `3*G + 3*G = 6*G`);
    });
    should(`${name}/${pointName}/Basic group laws (same point (negative) addition)`, () => {
      equal(G[3].add(G[3].negate()), G[0], '3*G + (- 3*G) = 0*G');
      equal(G[3].subtract(G[3]), G[0], '3*G - 3*G = 0*G');
    });
    should(`${name}/${pointName}/Basic group laws (curve order)`, () => {
      equal(G[1].multiply(CURVE_ORDER - 1n).add(G[1]), G[0], '(N-1)*G + G = 0');
      equal(G[1].multiply(CURVE_ORDER - 1n).add(G[2]), G[1], '(N-1)*G + 2*G = 1*G');
      equal(G[1].multiply(CURVE_ORDER - 2n).add(G[2]), G[0], '(N-2)*G + 2*G = 0');
      const half = CURVE_ORDER / 2n;
      const carry = CURVE_ORDER % 2n === 1n ? G[1] : G[0];
      equal(G[1].multiply(half).double().add(carry), G[0], '((N/2) * G).double() = 0');
    });
    should(`${name}/${pointName}/Basic group laws (inversion)`, () => {
      const a = 1234n;
      const b = 5678n;
      const c = a * b;
      equal(G[1].multiply(a).multiply(b), G[1].multiply(c), 'a*b*G = c*G');
      const inv = mod.invert(b, CURVE_ORDER);
      equal(G[1].multiply(c).multiply(inv), G[1].multiply(a), 'c*G * (1/b)*G = a*G');
    });
    should(`${name}/${pointName}/Basic group laws (multiply, rand)`, () =>
      fc.assert(
        fc.property(FC_BIGINT, FC_BIGINT, (a, b) => {
          const c = mod.mod(a + b, CURVE_ORDER);
          if (c === CURVE_ORDER || c < 1n) return;
          const pA = G[1].multiply(a);
          const pB = G[1].multiply(b);
          const pC = G[1].multiply(c);
          equal(pA.add(pB), pB.add(pA), `pA + pB = pB + pA`);
          equal(pA.add(pB), pC, `pA + pB = pC`);
        }),
        { numRuns: NUM_RUNS }
      )
    );
    should(`${name}/${pointName}/Basic group laws (multiply2, rand)`, () =>
      fc.assert(
        fc.property(FC_BIGINT, FC_BIGINT, (a, b) => {
          const c = mod.mod(a * b, CURVE_ORDER);
          const pA = G[1].multiply(a);
          const pB = G[1].multiply(b);
          equal(pA.multiply(b), pB.multiply(a), `b*pA = a*pB`);
          equal(pA.multiply(b), G[1].multiply(c), `b*pA = c*G`);
        }),
        { numRuns: NUM_RUNS }
      )
    );

    for (const op of ['add', 'subtract']) {
      should(`${name}/${pointName}/${op} type check`, () => {
        throws(() => G[1][op](0), '0');
        throws(() => G[1][op](0n), '0n');
        G[1][op](G[2]);
        throws(() => G[1][op](CURVE_ORDER), 'CURVE_ORDER');
        throws(() => G[1][op](123.456), '123.456');
        throws(() => G[1][op](true), 'true');
        throws(() => G[1][op]('1'), "'1'");
        throws(() => G[1][op]({ x: 1n, y: 1n, z: 1n, t: 1n }), '{ x: 1n, y: 1n, z: 1n, t: 1n }');
        throws(() => G[1][op](new Uint8Array([])), 'ui8a([])');
        throws(() => G[1][op](new Uint8Array([0])), 'ui8a([0])');
        throws(() => G[1][op](new Uint8Array([1])), 'ui8a([1])');
        throws(() => G[1][op](new Uint8Array(4096).fill(1)), 'ui8a(4096*[1])');
        if (G[1].toAffine) throws(() => G[1][op](C.Point.BASE), `Point ${op} ${pointName}`);
        throws(() => G[1][op](o.BASE), `${op}/other curve point`);
      });
    }

    should(`${name}/${pointName}/equals type check`, () => {
      throws(() => G[1].equals(0), '0');
      throws(() => G[1].equals(0n), '0n');
      deepStrictEqual(G[1].equals(G[2]), false, '1*G != 2*G');
      deepStrictEqual(G[1].equals(G[1]), true, '1*G == 1*G');
      deepStrictEqual(G[2].equals(G[2]), true, '2*G == 2*G');
      throws(() => G[1].equals(CURVE_ORDER), 'CURVE_ORDER');
      throws(() => G[1].equals(123.456), '123.456');
      throws(() => G[1].equals(true), 'true');
      throws(() => G[1].equals('1'), "'1'");
      throws(() => G[1].equals({ x: 1n, y: 1n, z: 1n, t: 1n }), '{ x: 1n, y: 1n, z: 1n, t: 1n }');
      throws(() => G[1].equals(new Uint8Array([])), 'ui8a([])');
      throws(() => G[1].equals(new Uint8Array([0])), 'ui8a([0])');
      throws(() => G[1].equals(new Uint8Array([1])), 'ui8a([1])');
      throws(() => G[1].equals(new Uint8Array(4096).fill(1)), 'ui8a(4096*[1])');
      if (G[1].toAffine) throws(() => G[1].equals(C.Point.BASE), `Point.equals(${pointName})`);
      throws(() => G[1].equals(o.BASE), 'other curve point');
    });

    for (const op of ['multiply', 'multiplyUnsafe']) {
      if (!p.BASE[op]) continue;
      should(`${name}/${pointName}/${op} type check`, () => {
        if (op !== 'multiplyUnsafe') {
          throws(() => G[1][op](0), '0');
          throws(() => G[1][op](0n), '0n');
        }
        G[1][op](1n);
        G[1][op](CURVE_ORDER - 1n);
        throws(() => G[1][op](G[2]), 'G[2]');
        throws(() => G[1][op](CURVE_ORDER), 'CURVE_ORDER');
        throws(() => G[1][op](CURVE_ORDER + 1n), 'CURVE_ORDER+1');
        throws(() => G[1][op](123.456), '123.456');
        throws(() => G[1][op](true), 'true');
        throws(() => G[1][op]('1'), '1');
        throws(() => G[1][op](new Uint8Array([])), 'ui8a([])');
        throws(() => G[1][op](new Uint8Array([0])), 'ui8a([0])');
        throws(() => G[1][op](new Uint8Array([1])), 'ui8a([1])');
        throws(() => G[1][op](new Uint8Array(4096).fill(1)), 'ui8a(4096*[1])');
        throws(() => G[1][op](o.BASE), 'other curve point');
      });
    }
    // Complex point (Extended/Jacobian/Projective?)
    if (p.BASE.toAffine) {
      should(`${name}/${pointName}/toAffine()`, () => {
        equal(p.ZERO.toAffine(), C.Point.ZERO, `0 = 0`);
        equal(p.BASE.toAffine(), C.Point.BASE, `1 = 1`);
      });
    }
    if (p.fromAffine) {
      should(`${name}/${pointName}/fromAffine()`, () => {
        equal(p.ZERO, p.fromAffine(C.Point.ZERO), `0 = 0`);
        equal(p.BASE, p.fromAffine(C.Point.BASE), `1 = 1`);
      });
    }
    // toHex/fromHex (if available)
    if (p.fromHex && p.BASE.toHex) {
      should(`${name}/${pointName}/fromHex(toHex()) roundtrip`, () => {
        fc.assert(
          fc.property(FC_BIGINT, (x) => {
            const hex = p.BASE.multiply(x).toHex();
            deepStrictEqual(p.fromHex(hex).toHex(), hex);
          })
        );
      });
    }
  }
  // Generic complex things (getPublicKey/sign/verify/getSharedSecret)
  should(`${name}/getPublicKey type check`, () => {
    throws(() => C.getPublicKey(0), '0');
    throws(() => C.getPublicKey(0n), '0n');
    throws(() => C.getPublicKey(false), 'false');
    throws(() => C.getPublicKey(123.456), '123.456');
    throws(() => C.getPublicKey(true), 'true');
    throws(() => C.getPublicKey(''), "''");
    // NOTE: passes because of disabled hex padding checks for starknet, maybe enable?
    //throws(() => C.getPublicKey('1'), "'1'");
    throws(() => C.getPublicKey('key'), "'key'");
    throws(() => C.getPublicKey(new Uint8Array([])));
    throws(() => C.getPublicKey(new Uint8Array([0])));
    throws(() => C.getPublicKey(new Uint8Array([1])));
    throws(() => C.getPublicKey(new Uint8Array(4096).fill(1)));
  });
  should(`${name}.verify()/should verify random signatures`, () =>
    fc.assert(
      fc.property(fc.hexaString({ minLength: 64, maxLength: 64 }), (msg) => {
        const priv = C.utils.randomPrivateKey();
        const pub = C.getPublicKey(priv);
        const sig = C.sign(msg, priv);
        deepStrictEqual(C.verify(sig, msg, pub), true);
      }),
      { numRuns: NUM_RUNS }
    )
  );
  should(`${name}.sign()/edge cases`, () => {
    throws(() => C.sign());
    throws(() => C.sign(''));
  });

  should(`${name}.verify()/should not verify signature with wrong hash`, () => {
    const MSG = '01'.repeat(32);
    const PRIV_KEY = 0x2n;
    const WRONG_MSG = '11'.repeat(32);
    const signature = C.sign(MSG, PRIV_KEY);
    const publicKey = C.getPublicKey(PRIV_KEY);
    deepStrictEqual(C.verify(signature, WRONG_MSG, publicKey), false);
  });
  // NOTE: fails for ed, because of empty message. Since we convert it to scalar,
  // need to check what other implementations do. Empty message != new Uint8Array([0]), but what scalar should be in that case?
  // should(`${name}/should not verify signature with wrong message`, () => {
  //   fc.assert(
  //     fc.property(
  //       fc.array(fc.integer({ min: 0x00, max: 0xff })),
  //       fc.array(fc.integer({ min: 0x00, max: 0xff })),
  //       (bytes, wrongBytes) => {
  //         const privKey = C.utils.randomPrivateKey();
  //         const message = new Uint8Array(bytes);
  //         const wrongMessage = new Uint8Array(wrongBytes);
  //         const publicKey = C.getPublicKey(privKey);
  //         const signature = C.sign(message, privKey);
  //         deepStrictEqual(
  //           C.verify(signature, wrongMessage, publicKey),
  //           bytes.toString() === wrongBytes.toString()
  //         );
  //       }
  //     ),
  //     { numRuns: NUM_RUNS }
  //   );
  // });

  if (C.getSharedSecret) {
    should(`${name}/getSharedSecret() should be commutative`, () => {
      for (let i = 0; i < NUM_RUNS; i++) {
        const asec = C.utils.randomPrivateKey();
        const apub = C.getPublicKey(asec);
        const bsec = C.utils.randomPrivateKey();
        const bpub = C.getPublicKey(bsec);
        try {
          deepStrictEqual(C.getSharedSecret(asec, bpub), C.getSharedSecret(bsec, apub));
        } catch (error) {
          console.error('not commutative', { asec, apub, bsec, bpub });
          throw error;
        }
      }
    });
  }
}
// ESM is broken.
import url from 'url';
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  should.run();
}
