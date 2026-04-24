import { json } from '../middleware.js';

export async function handleEvents(request, env, path) {
  const method = request.method;

  // GET /events — list all future events with availability
  if (method === 'GET' && path === '/events') {
    const today = new Date().toISOString().split('T')[0];
    const { results } = await env.DB.prepare(
      `SELECT id, event_title, date, start_time, end_time, duration_mins, meet_link,
              capacity, spaces_sold, (capacity - spaces_sold) AS spaces_available
       FROM events
       WHERE date >= ?
       ORDER BY date ASC, start_time ASC`
    ).bind(today).all();
    return json(results);
  }

  return json({ error: 'Not found' }, 404);
}
