const path = require('node:path');

// Only the packaged web build is visible to the renderer; never serve project files.
function resolveAsset(root, rawUrl) {
  let url;
  try {
    const rawPath = rawUrl.match(/^http:\/\/127\.0\.0\.1:\d+([^?#]*)/);
    if (!rawPath || /(?:^|\/)(?:%2e|\.)(?:%2e|\.)?(?:\/|%2f|$)/i.test(rawPath[1])) return null;
    url = new URL(rawUrl);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return null;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes('//')) return null;
    const segments = pathname.split('/');
    if (segments.some(part => part === '.' || part === '..')) return null;
    const filename = pathname === '/' ? '/index.html' : pathname;
    const asset = path.resolve(root, `.${filename}`);
    const relative = path.relative(path.resolve(root), asset);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? asset : null;
  } catch (_) {
    return null;
  }
}

module.exports = { resolveAsset };
