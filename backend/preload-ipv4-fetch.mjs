// Preload: replace globalThis.fetch BEFORE any module imports.
// Runs via --import (native Node ESM) before tsx loads anything.
// grammY captures fetch at import time, so this MUST be first.
import https from 'node:https';
import http from 'node:http';

function nativeFetch(url, init) {
  const u = typeof url === 'string' ? new URL(url) : url;
  const isHttps = u.protocol === 'https:';
  const transport = isHttps ? https : http;
  const method = init?.method || 'GET';
  const headers = {};
  if (init?.headers) {
    const h = init.headers;
    if (h.forEach) {
      h.forEach((v, k) => (headers[k.toLowerCase()] = v));
    } else {
      Object.entries(h).forEach(([k, v]) => (headers[k.toLowerCase()] = String(v)));
    }
  }
  const body = init?.body;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      u,
      { method, headers, family: 4, timeout: 30_000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            ok: (res.statusCode ?? 500) < 400,
            status: res.statusCode ?? 500,
            statusText: res.statusMessage ?? '',
            headers: new Headers(res.headers),
            text: async () => buffer.toString('utf-8'),
            json: async () => JSON.parse(buffer.toString('utf-8')),
            arrayBuffer: async () => buffer.buffer,
            blob: async () => new Blob([buffer]),
            bodyUsed: false, redirected: false,
            type: 'basic', url: u.toString(),
            clone() { return this; }, body: null,
          });
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

globalThis.fetch = nativeFetch;
console.log('[preload] fetch replaced with IPv4-only native implementation');
