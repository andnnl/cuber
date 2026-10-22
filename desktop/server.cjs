const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { resolveAsset } = require('./assets.cjs');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function startAssetServer(root, port = 34657) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const host = request.headers.host;
      if (!['GET', 'HEAD'].includes(request.method) || host !== `127.0.0.1:${server.address().port}`) {
        response.writeHead(404).end();
        return;
      }
      const asset = resolveAsset(root, `http://${host}${request.url}`);
      if (!asset) { response.writeHead(404).end(); return; }
      fs.stat(asset, (error, stat) => {
        if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
        response.writeHead(200, {
          'Content-Type': MIME[path.extname(asset).toLowerCase()] || 'application/octet-stream',
          'Content-Length': stat.size,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        });
        if (request.method === 'HEAD') response.end();
        else fs.createReadStream(asset).pipe(response);
      });
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () =>
        new Promise((done, fail) => server.close(error => error ? fail(error) : done())) });
    });
  });
}

module.exports = { startAssetServer };
