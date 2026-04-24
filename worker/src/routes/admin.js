import { json } from '../middleware.js';

export async function handleAdmin(request, env, path) {
  const method = request.method;
  const url = new URL(request.url);

  // ── Settings ────────────────────────────────────────────────
  if (path === '/admin/settings') {
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM settings WHERE id = 1').first();
      return json({ ...row, discount_tiers: JSON.parse(row.discount_tiers) });
    }
    if (method === 'PUT') {
      const { base_price_pence, default_capacity, discount_tiers } = await request.json();
      await env.DB.prepare(
        `UPDATE settings SET base_price_pence = ?, default_capacity = ?, discount_tiers = ? WHERE id = 1`
      ).bind(base_price_pence, default_capacity, JSON.stringify(discount_tiers)).run();

      // Apply new default capacity to future events that still have the old default
      // (only if explicitly requested)
      return json({ ok: true });
    }
  }

  // ── Events list ─────────────────────────────────────────────
  if (path === '/admin/events') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT *, (capacity - spaces_sold) AS spaces_available FROM events ORDER BY date ASC, start_time ASC`
      ).all();
      return json(results);
    }

    // POST /admin/events — single event create
    if (method === 'POST') {
      const b = await request.json();
      const settings = await env.DB.prepare('SELECT default_capacity FROM settings WHERE id = 1').first();
      const { meta } = await env.DB.prepare(
        `INSERT INTO events (event_title, date, start_time, end_time, duration_mins, blank1, blank2, meet_link, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.event_title, b.date, b.start_time, b.end_time, b.duration_mins,
             b.blank1 || '', b.blank2 || '', b.meet_link || '', b.capacity ?? settings.default_capacity).run();
      return json({ id: meta.last_row_id });
    }
  }

  // POST /admin/events/import — bulk import from CSV/sheet paste
  if (path === '/admin/events/import' && method === 'POST') {
    const { rows } = await request.json();
    // rows = array matching sheet columns: event_title, date, start_time, end_time, duration_mins, blank1, blank2, meet_link
    const settings = await env.DB.prepare('SELECT default_capacity FROM settings WHERE id = 1').first();
    let inserted = 0;
    for (const row of rows) {
      if (!row.event_title || !row.date) continue;
      await env.DB.prepare(
        `INSERT INTO events (event_title, date, start_time, end_time, duration_mins, blank1, blank2, meet_link, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(row.event_title, row.date, row.start_time || '', row.end_time || '',
             parseInt(row.duration_mins) || 0, row.blank1 || '', row.blank2 || '',
             row.meet_link || '', settings.default_capacity).run();
      inserted++;
    }
    return json({ inserted });
  }

  // ── Single event ─────────────────────────────────────────────
  const eventMatch = path.match(/^\/admin\/events\/(\d+)$/);
  if (eventMatch) {
    const id = parseInt(eventMatch[1]);

    if (method === 'PUT') {
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE events SET event_title=?, date=?, start_time=?, end_time=?, duration_mins=?,
         blank1=?, blank2=?, meet_link=?, capacity=? WHERE id=?`
      ).bind(b.event_title, b.date, b.start_time, b.end_time, b.duration_mins,
             b.blank1 || '', b.blank2 || '', b.meet_link || '', b.capacity, id).run();
      return json({ ok: true });
    }

    if (method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM events WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }
  }

  // ── Bookings ─────────────────────────────────────────────────
  if (path === '/admin/bookings' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT b.id, b.customer_name, b.customer_email, b.waiver_accepted,
              b.amount_paid_pence, b.status, b.created_at,
              COUNT(be.id) AS class_count
       FROM bookings b
       LEFT JOIN booking_events be ON be.booking_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at DESC`
    ).all();
    return json(results);
  }

  // GET /admin/bookings/:id — full booking detail
  const bookingMatch = path.match(/^\/admin\/bookings\/(\d+)$/);
  if (bookingMatch && method === 'GET') {
    const id = parseInt(bookingMatch[1]);
    const booking = await env.DB.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(id).first();
    const { results: events } = await env.DB.prepare(
      `SELECT e.event_title, e.date, e.start_time, e.end_time, e.meet_link, be.price_paid_pence
       FROM booking_events be JOIN events e ON e.id = be.event_id
       WHERE be.booking_id = ? ORDER BY e.date ASC`
    ).bind(id).all();
    return json({ ...booking, events });
  }

  return json({ error: 'Not found' }, 404);
}
