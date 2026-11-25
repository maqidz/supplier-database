import { handleApi, sendJson } from './handler.js';

export default async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `https://${host}`);

  const rewrittenPath = url.searchParams.get('__path');
  if (rewrittenPath !== null) {
    url.pathname = '/api/' + rewrittenPath.replace(/^\/+/, '');
    url.searchParams.delete('__path');
  }

  try {
    await handleApi(req, res, url);
  } catch (err) {
    console.error('[API Error]', err);
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
}
