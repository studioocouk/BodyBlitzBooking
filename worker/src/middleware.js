export function cors(response, request, env) {
  const origin = request ? request.headers.get('Origin') : null;
  const allowed = [env.WIDGET_ORIGIN, env.ADMIN_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'];
  const allow = allowed.includes(origin) ? origin : allowed[0];
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allow);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { status: response.status, headers });
}

export function requireAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (token !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
