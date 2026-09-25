/**
 * A Vercel Blob that is not Vercel Blob.
 *
 * `upload_image` is the second tool whose effect lands outside this system.
 * An object written by accident is a real object in a real store that
 * somebody pays for and then has to find, so the suite must never reach
 * blob.vercel-storage.com — not in a test, not in a probe, not once.
 *
 * That guarantee is a property of the network layer and not of discipline,
 * exactly as it is for `e2e/github-stub.ts`. `@vercel/blob` reads
 * `VERCEL_BLOB_API_URL`, and `playwright.config.ts` points it at this
 * process. Every request the SDK would have sent arrives here instead.
 *
 * It also SERVES the bytes back, which the GitHub stub has no equivalent of.
 * `/images/[id]` redirects to whatever address was stored, so a test that
 * follows the redirect has to find something at the other end — that is the
 * assertion that the whole path works, rather than that a row was written.
 *
 * The protocol, as `@vercel/blob@2` speaks it:
 *
 *   PUT  /?pathname=<pathname>   the body is the object; answers JSON with
 *                                the url, the pathname and the content type
 *   GET  /?url=<pathname or url> `head`: the object's metadata, or 404
 *   POST /delete                 { urls: [...] }
 *
 * The upload page's browser PUTs here too, from the app's origin, so every
 * answer carries CORS headers and a preflight is answered — as the real
 * store does. That PUT carries a CLIENT token, which the stub reads for one
 * thing: the pathname it was signed for. A browser that writes anywhere
 * else is refused, as the real store refuses it, so a test can tell a page
 * that stays inside its link from one that does not.
 *
 * The control half, all prefixed `__` so they can never collide:
 *
 *   GET  /__health    readiness, for Playwright's probe
 *   POST /__reset     forget every object
 *   GET  /__objects   what the stub is holding, without the bytes
 *
 * Objects live in memory. The suite writes a handful of images measured in
 * kilobytes, and a store that is forgotten when the process exits is the
 * right lifetime for a fixture.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

export const BLOB_STUB_DEFAULT_PORT = 3106;

interface StoredObject {
  pathname: string;
  contentType: string;
  body: Buffer;
  uploadedAt: string;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
};

/** The `pathname` a client token was signed for, or null for any other token. */
function clientTokenPathname(authorization: string | undefined): string | null {
  const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token.startsWith('vercel_blob_client_')) return null;
  try {
    const encoded = token.split('_')[4] ?? '';
    const payload = Buffer.from(encoded, 'base64').toString().split('.')[1];
    const decoded = JSON.parse(
      Buffer.from(payload ?? '', 'base64').toString(),
    ) as { pathname?: string };
    return decoded.pathname ?? null;
  } catch {
    return null;
  }
}

const objects = new Map<string, StoredObject>();

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    ...CORS,
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

const port = Number(
  process.argv[process.argv.indexOf('--port') + 1] || BLOB_STUB_DEFAULT_PORT,
);
const origin = `http://127.0.0.1:${port}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }

  if (url.pathname === '/__health') {
    json(res, 200, { ok: true, objects: objects.size });
    return;
  }

  if (url.pathname === '/__reset' && req.method === 'POST') {
    objects.clear();
    json(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/__objects') {
    json(res, 200, {
      objects: [...objects.values()].map((o) => ({
        pathname: o.pathname,
        contentType: o.contentType,
        bytes: o.body.length,
      })),
    });
    return;
  }

  // The upload. The SDK sends the object as the body of a PUT to the root
  // with the pathname in the query string.
  if (req.method === 'PUT' && url.pathname === '/') {
    const pathname = url.searchParams.get('pathname');
    if (!pathname) {
      json(res, 400, { error: { message: 'pathname is required' } });
      return;
    }

    const signedFor = clientTokenPathname(req.headers.authorization);
    if (signedFor !== null && signedFor !== pathname) {
      json(res, 403, {
        error: {
          code: 'forbidden',
          message: `the client token was signed for ${signedFor}`,
        },
      });
      return;
    }

    // The real store appends a random suffix unless told not to, and
    // `putImage` relies on that: it is the only thing making a deleted
    // picture's address unguessable. The stub does the same so a test sees
    // the same shape of address the deployment will.
    const addRandomSuffix =
      req.headers['x-add-random-suffix'] === '1' ||
      req.headers['x-add-random-suffix'] === undefined;
    const suffix = addRandomSuffix ? `-${randomBytes(8).toString('hex')}` : '';
    const dot = pathname.lastIndexOf('.');
    const stored =
      dot > 0
        ? `${pathname.slice(0, dot)}${suffix}${pathname.slice(dot)}`
        : `${pathname}${suffix}`;

    const body = await readBody(req);
    const contentType =
      (req.headers['x-content-type'] as string | undefined) ??
      (req.headers['content-type'] as string | undefined) ??
      'application/octet-stream';

    objects.set(stored, {
      pathname: stored,
      contentType,
      body,
      uploadedAt: new Date().toISOString(),
    });

    const publicUrl = `${origin}/blob/${stored}`;
    json(res, 200, {
      url: publicUrl,
      downloadUrl: `${publicUrl}?download=1`,
      pathname: stored,
      contentType,
      contentDisposition: `inline; filename="${stored}"`,
      etag: randomBytes(8).toString('hex'),
    });
    return;
  }

  // `head`. The SDK sends a GET to the root with the pathname, or a full
  // url, in `url`.
  if (
    req.method === 'GET' &&
    url.pathname === '/' &&
    url.searchParams.has('url')
  ) {
    const asked = url.searchParams.get('url')!;
    const key = asked.startsWith(`${origin}/blob/`)
      ? asked.slice(`${origin}/blob/`.length).split('?')[0]!
      : asked;
    const object = objects.get(key);
    if (!object) {
      json(res, 404, { error: { code: 'not_found', message: 'not found' } });
      return;
    }
    const publicUrl = `${origin}/blob/${object.pathname}`;
    json(res, 200, {
      url: publicUrl,
      downloadUrl: `${publicUrl}?download=1`,
      pathname: object.pathname,
      size: object.body.length,
      contentType: object.contentType,
      contentDisposition: `inline; filename="${object.pathname}"`,
      cacheControl: 'public, max-age=31536000',
      uploadedAt: object.uploadedAt,
      etag: 'stub',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/delete') {
    const body = await readBody(req);
    let urls: string[];
    try {
      const parsed = JSON.parse(body.toString('utf8')) as { urls?: string[] };
      urls = parsed.urls ?? [];
    } catch {
      urls = [];
    }
    for (const u of urls) {
      const key = u.replace(`${origin}/blob/`, '').split('?')[0]!;
      objects.delete(key);
    }
    json(res, 200, {});
    return;
  }

  // Serving the bytes. This is what `/images/[id]` redirects to.
  if (req.method === 'GET' && url.pathname.startsWith('/blob/')) {
    const key = decodeURIComponent(url.pathname.slice('/blob/'.length));
    const object = objects.get(key);
    if (!object) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      ...CORS,
      'content-type': object.contentType,
      'content-length': object.body.length,
      'cache-control': 'public, max-age=31536000, immutable',
    });
    res.end(object.body);
    return;
  }

  // Anything else is visible rather than swallowed, for the same reason the
  // GitHub stub answers 404 loudly: a request aimed somewhere unexpected is
  // a fact a test needs to be able to see.
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({ error: { message: `no stub route for ${req.url}` } }),
  );
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[blob-stub] listening on ${origin}`);
});
