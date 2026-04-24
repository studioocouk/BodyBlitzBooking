import { handleEvents } from './routes/events.js';
import { handleSettings } from './routes/settings.js';
import { handleBookings } from './routes/bookings.js';
import { handleWebhook } from './routes/webhook.js';
import { handleAdmin } from './routes/admin.js';
import { cors, requireAdmin } from './middleware.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request, env);

    try {
      if (path === '/webhook' && method === 'POST') return handleWebhook(request, env);

      if (path.startsWith('/admin')) {
        const authErr = requireAdmin(request, env);
        if (authErr) return cors(authErr, request, env);
        return cors(await handleAdmin(request, env, path), request, env);
      }

      if (path.startsWith('/events')) return cors(await handleEvents(request, env, path), request, env);
      if (path.startsWith('/settings') && method === 'GET') return cors(await handleSettings(request, env), request, env);
      if (path.startsWith('/bookings')) return cors(await handleBookings(request, env, path), request, env);

      return cors(new Response('Not found', { status: 404 }), request, env);
    } catch (err) {
      console.error(err);
      return cors(new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }), request, env);
    }
  }
};
