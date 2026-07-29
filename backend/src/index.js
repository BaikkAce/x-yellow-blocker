const HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: HEADERS
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({
        ok: true,
        version: '1.2.0',
        accountSharing: false,
        remoteData: ['keywords', 'lureSamples']
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/stats') {
      return json({
        total: 0,
        disputes: 0,
        accountSharing: false,
        deprecated: true
      });
    }

    if (url.pathname === '/api/report' || url.pathname === '/api/dispute') {
      return json({
        error: 'account sharing has been removed',
        code: 'account_sharing_removed'
      }, 410);
    }

    return json({ error: 'not found' }, 404);
  }
};
