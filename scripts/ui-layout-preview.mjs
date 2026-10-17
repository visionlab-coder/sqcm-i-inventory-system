import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Loopback-only, allowlisted static fixture: no app, credentials or API proxy.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = new Map([
  ['/', ['test/fixtures/ui-layout.html', 'text/html']],
  ['/styles.css', ['frontend/styles.css', 'text/css']],
  ['/experience.css', ['frontend/experience.css', 'text/css']]
]);
const server = http.createServer((request, response) => {
  const file = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (request.method !== 'GET' || !file) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'none'; base-uri 'none'" });
  fs.createReadStream(path.join(root, file[0])).pipe(response);
});
server.listen(3398, '127.0.0.1', () => console.log('Synthetic UI fixture: http://127.0.0.1:3398/ (no production API)'));
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
