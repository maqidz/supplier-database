import { handleApi, sendJson } from '../lib/api-handler.js';

export default async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `https://${host}`);

  // If Vercel stripped/rewrote pathname, recover from req.query.path
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/[...path]' || url.pathname === '/api/[...path].js') {
    const segs = req.query?.path;
    if (Array.isArray(segs)) {
      url.pathname = '/api/' + segs.join('/');
    } else if (typeof segs === 'string' && segs) {
      url.pathname = '/api/' + segs.replace(/^\/+/, '');
    }
  }

  try {
    await handleApi(req, res, url);
  } catch (err) {
    console.error('[API Error]', err);
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
}
