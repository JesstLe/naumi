// Read-only design gallery; serves only the proposal assets and a fixed download.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('design/brand/naumi-logo-options-20261010');
const download = path.resolve('output/naumi-logo-options-20261010/MODIFIED_FILE.zip');
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const name = decodeURIComponent(url.pathname);
    const file = name === '/download.zip' ? download : path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    const rel = path.relative(root, file);
    if (file !== download && (rel.startsWith('..') || path.isAbsolute(rel))) { res.writeHead(403); res.end(); return; }
    const bytes = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', ...(file === download ? { 'Content-Disposition': 'attachment; filename="naumi-logo-options.zip"' } : {}) });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(13473, '127.0.0.1', () => console.log('LOGO_GALLERY=http://127.0.0.1:13473/'));
