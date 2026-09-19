import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { applications, workspace } from './test-app-config.mjs';

const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function serve(app) {
  const root = join(workspace, 'fixtures', app.directory, 'dist');
  const fallback = join(root, 'index.html');
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end('Malformed URL');
      return;
    }
    const relative = normalize(pathname).replace(/^([/\\])+/, '');
    const candidate = join(root, relative);
    const insideRoot = candidate === root || candidate.startsWith(`${root}/`);
    const requested =
      insideRoot && existsSync(candidate) && statSync(candidate).isFile() ? candidate : undefined;
    const acceptsHtml = String(request.headers.accept ?? '').includes('text/html');
    const file = requested ?? (app.id === 'shell' && acceptsHtml ? fallback : undefined);
    if (!file) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', 'http://localhost:4100');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    createReadStream(file)
      .on('error', () => response.writeHead(404).end())
      .pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(app.port, 'localhost', () => {
      console.log(`${app.id.padEnd(10)} production http://localhost:${app.port}/`);
      resolve(server);
    });
  });
}

const servers = [];
try {
  for (const app of applications) servers.push(await serve(app));
} catch (error) {
  await Promise.allSettled(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
  throw error;
}
const close = async () =>
  Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => close().then(() => process.exit(0)));
console.log('Production fixtures are ready. Press Ctrl+C to stop.');
await new Promise(() => {});
