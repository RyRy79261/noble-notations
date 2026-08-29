/**
 * Print a scrypt hash for ADMIN_PASSWORD_HASH.
 *
 *   pnpm tsx scripts/hash-password.ts 'the password'
 *
 * Output format is `scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>` — self-describing
 * so the verifier never has to guess the parameters a hash was made with.
 */
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error("Usage: pnpm tsx scripts/hash-password.ts 'your password'");
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });

console.log(
  ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$'),
);
