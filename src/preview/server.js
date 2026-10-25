import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT) || 4173;
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
]);

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    url.searchParams.set('preview', '1');
    if (!url.searchParams.has('scale')) url.searchParams.set('scale', '10');
    response.writeHead(302, { location: '/src/renderer/pet.html' + url.search }).end();
    return;
  }
  const route = decodeURIComponent(url.pathname);
  const filePath = path.resolve(root, '.' + route);
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found: ' + route);
      return;
    }
    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(content);
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write('Curie pet preview: http://127.0.0.1:' + port + '/?preview=1&scale=10\n');
});
