import { json } from '../middleware.js';
import { sendEmail, emailCancellation, emailReminder, emailBookingCancellation, emailEventUpdate } from '../email.js';

export async function handleAdmin(request, env, path) {
  const method = request.method;

  // ── Settings ─────────────────────────────────────────────────
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
      return json({ ok: true });
    }
  }

  // ── Events list ───────────────────────────────────────────────
  if (path === '/admin/events') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT *, (capacity - spaces_sold) AS spaces_available FROM events ORDER BY date ASC, start_time ASC`
      ).all();
      return json(results);
    }
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

  // ── Bulk import ───────────────────────────────────────────────
  if (path === '/admin/events/import' && method === 'POST') {
    const { rows } = await request.json();
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

  // ── Cancel event ──────────────────────────────────────────────
  const cancelEventMatch = path.match(/^\/admin\/events\/(\d+)\/cancel$/);
  if (cancelEventMatch && method === 'POST') {
    const id = parseInt(cancelEventMatch[1]);
    const ev = await env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
    if (!ev) return json({ error: 'Event not found' }, 404);
    if (ev.cancelled) return json({ error: 'Event already cancelled' }, 409);

    await env.DB.prepare(`UPDATE events SET cancelled = 1 WHERE id = ?`).bind(id).run();

    const { results: affected } = await env.DB.prepare(
      `SELECT DISTINCT b.id, b.customer_name, b.customer_email, be.price_paid_pence
       FROM bookings b
       JOIN booking_events be ON be.booking_id = b.id
       WHERE be.event_id = ? AND b.status = 'paid'`
    ).bind(id).all();

    let emailed = 0;
    for (const booking of affected) {
      const { subject, html } = emailCancellation(booking, ev);
      const ok = await sendEmail(env, { to: booking.customer_email, subject, html });
      if (ok) emailed++;
    }
    return json({ ok: true, cancelled: true, participants_notified: emailed });
  }

  // ── Send reminders manually ───────────────────────────────────
  const remindMatch = path.match(/^\/admin\/events\/(\d+)\/remind$/);
  if (remindMatch && method === 'POST') {
    const id = parseInt(remindMatch[1]);
    const ev = await env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
    if (!ev) return json({ error: 'Event not found' }, 404);
    if (ev.cancelled) return json({ error: 'Cannot send reminders for a cancelled event' }, 409);

    const { results: bookings } = await env.DB.prepare(
      `SELECT DISTINCT b.id, b.customer_name, b.customer_email
       FROM bookings b
       JOIN booking_events be ON be.booking_id = b.id
       WHERE be.event_id = ? AND b.status = 'paid'`
    ).bind(id).all();

    let emailed = 0;
    for (const booking of bookings) {
      const { subject, html } = emailReminder(booking, ev);
      const ok = await sendEmail(env, { to: booking.customer_email, subject, html });
      if (ok) emailed++;
    }
    return json({ ok: true, reminders_sent: emailed });
  }

  // ── Notify participants of event update ───────────────────────
  const notifyMatch = path.match(/^\/admin\/events\/(\d+)\/notify$/);
  if (notifyMatch && method === 'POST') {
    const id = parseInt(notifyMatch[1]);
    const ev = await env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
    if (!ev) return json({ error: 'Event not found' }, 404);

    const { results: bookings } = await env.DB.prepare(
      `SELECT DISTINCT b.id, b.customer_name, b.customer_email
       FROM bookings b
       JOIN booking_events be ON be.booking_id = b.id
       WHERE be.event_id = ? AND b.status = 'paid'`
    ).bind(id).all();

    let emailed = 0;
    for (const booking of bookings) {
      const { subject, html } = emailEventUpdate(booking, ev);
      const ok = await sendEmail(env, { to: booking.customer_email, subject, html });
      if (ok) emailed++;
    }
    return json({ ok: true, notified: emailed });
  }

  // ── Single event update / delete ──────────────────────────────
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
      // Check for paid bookings — send cancellation emails before deleting
      const { results: affected } = await env.DB.prepare(
        `SELECT DISTINCT b.id, b.customer_name, b.customer_email, be.price_paid_pence
         FROM bookings b
         JOIN booking_events be ON be.booking_id = b.id
         WHERE be.event_id = ? AND b.status = 'paid'`
      ).bind(id).all();

      if (affected.length > 0) {
        const ev = await env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first();
        for (const booking of affected) {
          const { subject, html } = emailCancellation(booking, ev);
          await sendEmail(env, { to: booking.customer_email, subject, html });
        }
      }

      await env.DB.prepare(`DELETE FROM booking_events WHERE event_id = ?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM events WHERE id = ?`).bind(id).run();
      return json({ ok: true, participants_notified: affected.length });
    }
  }

  // ── Bookings list ─────────────────────────────────────────────
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

  // ── Single booking detail ─────────────────────────────────────
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

  // ── Cancel individual booking ─────────────────────────────────
  const cancelBookingMatch = path.match(/^\/admin\/bookings\/(\d+)\/cancel$/);
  if (cancelBookingMatch && method === 'POST') {
    const id = parseInt(cancelBookingMatch[1]);
    const booking = await env.DB.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(id).first();
    if (!booking) return json({ error: 'Booking not found' }, 404);
    if (booking.status === 'cancelled') return json({ error: 'Booking already cancelled' }, 409);

    // Get events for this booking (for email)
    const { results: events } = await env.DB.prepare(
      `SELECT e.event_title, e.date, e.start_time, e.end_time, be.price_paid_pence
       FROM booking_events be JOIN events e ON e.id = be.event_id
       WHERE be.booking_id = ? ORDER BY e.date ASC`
    ).bind(id).all();

    // Decrement spaces_sold for each event
    for (const ev of events) {
      await env.DB.prepare(
        `UPDATE events SET spaces_sold = MAX(0, spaces_sold - 1) WHERE id = (
           SELECT event_id FROM booking_events WHERE booking_id = ? AND event_id = (
             SELECT id FROM events WHERE event_title = ? AND date = ? LIMIT 1
           )
         )`
      );
      // Simpler approach: just decrement directly via booking_events join
    }

    const { results: beRows } = await env.DB.prepare(
      `SELECT event_id FROM booking_events WHERE booking_id = ?`
    ).bind(id).all();

    for (const row of beRows) {
      await env.DB.prepare(
        `UPDATE events SET spaces_sold = MAX(0, spaces_sold - 1) WHERE id = ?`
      ).bind(row.event_id).run();
    }

    // Mark booking cancelled
    await env.DB.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).bind(id).run();

    // Send cancellation email
    const { subject, html } = emailBookingCancellation(booking, events);
    await sendEmail(env, { to: booking.customer_email, subject, html });

    return json({ ok: true, cancelled: true });
  }

  return json({ error: 'Not found' }, 404);
}
