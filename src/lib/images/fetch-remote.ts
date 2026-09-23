import 'server-only';

/**
 * Fetch a picture from a web address, for `upload_image { sourceUrl }`.
 *
 * Issue #56 asked for this beside the upload link, and it is the cheapest
 * way in for every picture that is already on the web: the server fetches
 * the file, so the model sends an address and not the bytes.
 *
 * **It is a request forgery surface, and every guard here is for that.** A
 * caller chooses the address and this server makes the request, from inside
 * whatever network the deployment runs in. So:
 *
 * - **https only.** No plain http, no file:, no data:.
 * - **No private, loopback, link-local or reserved address**, v4 or v6. The
 *   check runs on the ADDRESS the name resolves to, inside the socket's own
 *   DNS lookup, and not on the name. Checking the name and then letting the
 *   socket resolve it again is the rebinding hole: the second answer can
 *   differ from the first. A literal IP in the address is checked too,
 *   because Node does not call the lookup for one.
 * - **Three redirects at most**, and each hop passes the same checks.
 * - **The body is capped while it streams**, at the same limit a file takes
 *   everywhere else. A server that lies about Content-Length, or sends none,
 *   is cut off at the limit rather than trusted.
 * - **A timeout.** A server that answers one byte a minute would otherwise
 *   hold a function for its whole duration.
 *
 * What comes back is bytes and nothing more. `processImage` checks them
 * exactly as it checks base64: a page of HTML at an address that ends in
 * `.jpg` is refused there.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { ImageRejected, MAX_INPUT_BYTES } from './process';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

/**
 * Every range a public web address must not resolve into. IANA's special-
 * purpose registries, both families.
 *
 * `::ffff:0:0/96`, the v4-mapped range, is NOT in the list, and must not be.
 * `BlockList` checks a v4 address against the v6 rules too, in its mapped
 * form, so that one rule would block every v4 address on the internet. A
 * mapped address is refused in `isBlockedAddress` instead, by its prefix:
 * no public site is published that way.
 */
const BLOCKED = (() => {
  const list = new BlockList();
  const v4: [string, number][] = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ];
  for (const [net, prefix] of v4) list.addSubnet(net, prefix, 'ipv4');
  const v6: [string, number][] = [
    ['::', 128],
    ['::1', 128],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001::', 23],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
  ];
  for (const [net, prefix] of v6) list.addSubnet(net, prefix, 'ipv6');
  return list;
})();

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6 && /^::ffff:/i.test(address)) return true;
  return BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function refusePrivate(host: string, address: string): ImageRejected {
  return new ImageRejected(
    `\`sourceUrl\` names ${host}, which is at ${address}: a private, local ` +
      'or reserved address. This server does not fetch from one, because a ' +
      'fetch driven by a caller could otherwise reach inside the network ' +
      'the server runs in. Give an address on the public web, or ask for an ' +
      'upload link with request_image_upload.',
  );
}

/**
 * The socket's DNS lookup, with the check inside it. Called by Node for
 * every connection this module opens, so the address checked is the address
 * connected to.
 */
function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number | string },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const bad = addresses.find((a) => isBlockedAddress(a.address));
    if (bad) {
      return callback(
        refusePrivate(hostname, bad.address) as NodeJS.ErrnoException,
        [],
      );
    }
    if (addresses.length === 0) {
      return callback(
        new ImageRejected(
          `\`sourceUrl\` names ${hostname}, which has no address.`,
        ) as NodeJS.ErrnoException,
        [],
      );
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0]!;
    return callback(null, first.address, first.family);
  });
}

function parseTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageRejected(`\`sourceUrl\` is not a web address: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    throw new ImageRejected(
      `\`sourceUrl\` must start with https://. This one is ${url.protocol}//.`,
    );
  }
  if (url.username || url.password) {
    throw new ImageRejected(
      '`sourceUrl` must not carry a user name or password.',
    );
  }
  // `URL` keeps the brackets on a v6 literal.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host)) throw refusePrivate(host, host);
  return url;
}

function request(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup: guardedLookup as never,
        timeout: TIMEOUT_MS,
        headers: {
          accept: 'image/jpeg,image/png,image/webp,image/avif;q=0.9,*/*;q=0.1',
          'user-agent': 'noble-notations-image-fetch/1',
        },
      },
      resolve,
    );
    req.on('timeout', () => {
      req.destroy(
        new ImageRejected(
          `\`sourceUrl\` did not answer within ${TIMEOUT_MS / 1000} seconds.`,
        ),
      );
    });
    req.on('error', reject);
  });
}

function readCapped(res: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(res.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_INPUT_BYTES) {
      res.destroy();
      reject(tooBig());
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    res.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_INPUT_BYTES) {
        res.destroy();
        reject(tooBig());
        return;
      }
      chunks.push(chunk);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}

function tooBig(): ImageRejected {
  return new ImageRejected(
    `The file at \`sourceUrl\` is larger than ${MAX_INPUT_BYTES / 1024 / 1024} ` +
      'MB, which is the limit. It is not a photograph off a phone.',
  );
}

/** Fetch the bytes at `raw`, following at most three redirects. */
export async function fetchRemoteImage(raw: string): Promise<Buffer> {
  let url = parseTarget(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await request(url);
    const status = res.statusCode ?? 0;

    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (hop === MAX_REDIRECTS) break;
      url = parseTarget(new URL(res.headers.location, url).toString());
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new ImageRejected(
        `\`sourceUrl\` answered ${status}, not 200. Check that the address ` +
          'opens the picture itself and not a page about it, and that it is ' +
          'public.',
      );
    }
    return readCapped(res);
  }
  throw new ImageRejected(
    `\`sourceUrl\` redirected more than ${MAX_REDIRECTS} times.`,
  );
}
