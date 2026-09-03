// ITDone static server — shipped in the session image as
// /opt/itdone/static-server.js. The build agent COPIES it next to the site
// (`cp /opt/itdone/static-server.js server.js`) instead of writing its own.
//
// Why a file and not a rule: the resolver order below fixed two silent bugs
// that shipped in customer builds (an extensionless `/impressum` served the
// HOMEPAGE with HTTP 200; `/impressum/` did the same because the trailing
// slash was not stripped). Written by the model, the order varied from build
// to build; as a file it does not. Zero dependencies, Node 22.
//
// Resolution order for a request path:
//   0) strip a trailing slash (`/impressum/` -> `/impressum`)
//   1) the exact file
//   2) the same path + `.html` (`/impressum` -> `impressum.html`)
//   3) index.html (client-side routing, direct reloads)
// Serves `dist/` when a built `dist/index.html` exists (Vite & co), else the
// directory this file sits in.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const DIST = path.join(HERE, 'dist');
const ROOT = fs.existsSync(path.join(DIST, 'index.html')) ? DIST : HERE;
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

function resolve(urlPath) {
  let p;
  try {
    p = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
  } catch {
    return null;
  }
  if (p !== '/') p = p.replace(/\/+$/, ''); // 0) trailing slash
  let file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return null; // traversal guard
  const isFile = (f) => fs.existsSync(f) && fs.statSync(f).isFile();
  if (isFile(file)) return file; // 1) exact
  if (isFile(file + '.html')) return file + '.html'; // 2) + .html
  if (fs.existsSync(file) && fs.statSync(file).isDirectory() && isFile(path.join(file, 'index.html'))) {
    return path.join(file, 'index.html'); // 1b) directory index
  }
  return path.join(ROOT, 'index.html'); // 3) SPA shell / reload
}

http
  .createServer((req, res) => {
    const file = resolve(req.url || '/');
    if (!file) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Content-Length': data.length };
      // Built assets carry a content hash in the name; everything else is
      // revalidated so a new deploy reaches the visitor at once.
      headers['Cache-Control'] =
        ROOT === DIST && /\.[a-f0-9]{8,}\./i.test(path.basename(file))
          ? 'public, max-age=31536000, immutable'
          : 'no-cache';
      res.writeHead(200, headers);
      res.end(data);
    });
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`static site from ${path.relative(HERE, ROOT) || '.'} on :${PORT}`);
  });
