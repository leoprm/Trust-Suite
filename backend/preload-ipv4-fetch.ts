// Preload: replace globalThis.fetch BEFORE any module imports.
// grammY captures fetch at import time, so this MUST run via --require.
import https from 'https';
import http from 'http';

const origFetch = globalThis.fetch;

function nativeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const u = typeof url === 'string' ? new URL(url) : url;
  const isHttps = u.protocol === 'https:';
  const transport = isHttps ? https : http;
  const method = init?.method || 'GET';
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = init.headers as any;
    if (h.forEach) {
      h.forEach((v: string, k: string) => (headers[k.toLowerCase()] = v));
    } else {
      Object.entries(h).forEach(([k, v]) => (headers[k.toLowerCase()] = String(v)));
    }
  }
  const body = init?.body as string | undefined;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      u,
      { method, headers, family: 4, timeout: 30_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            ok: (res.statusCode ?? 500) < 400,
            status: res.statusCode ?? 500,
            statusText: res.statusMessage ?? '',
            headers: new Headers(res.headers as Record<string, string>),
            text: async () => buffer.toString('utf-8'),
            json: async () => JSON.parse(buffer.toString('utf-8')),
            arrayBuffer: async () => buffer.buffer,
            blob: async () => new Blob([buffer]),
            bodyUsed: false, redirected: false,
            type: 'basic' as ResponseType, url: u.toString(),
            clone() { return this; }, body: null,
          } as Response);
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Request timeout: ${u.href}`)); });
    if (body) req.write(body);
    req.end();
  });
}

(globalThis as any).fetch = nativeFetch;
console.log('[preload] fetch replaced with IPv4-only native implementation');
