import { sendEmail, emailReminder } from './email.js';

export async function handleScheduled(event, env, ctx) {
  ctx.waitUntil(runAll(env));
}

async function runAll(env) {
  await sendDailyReminders(env);
  await cleanupPendingBookings(env);
}

// ── Morning reminders ────────────────────────────────────────
async function sendDailyReminders(env) {
  const today = new Date().toISOString().split('T')[0];
  const { results: todayEvents } = await env.DB.prepare(
    `SELECT * FROM events WHERE date = ? AND cancelled = 0`
  ).bind(today).all();

  if (!todayEvents.length) {
    console.log(`[reminders] No events today (${today})`);
    return;
  }

  console.log(`[reminders] ${todayEvents.length} event(s) today`);

  for (const ev of todayEvents) {
    const { results: bookings } = await env.DB.prepare(
      `SELECT DISTINCT b.id, b.customer_name, b.customer_email
       FROM bookings b
       JOIN booking_events be ON be.booking_id = b.id
       WHERE be.event_id = ? AND b.status = 'paid'`
    ).bind(ev.id).all();

    for (const booking of bookings) {
      const { subject, html } = emailReminder(booking, ev);
      await sendEmail(env, { to: booking.customer_email, subject, html });
    }
    console.log(`[reminders] "${ev.event_title}" — ${bookings.length} sent`);
  }
}

// ── Pending booking cleanup (runs every 15 min via cron) ─────
async function cleanupPendingBookings(env) {
  // Delete pending bookings older than 15 minutes
  const { results: stale } = await env.DB.prepare(
    `SELECT id FROM bookings
     WHERE status = 'pending'
     AND created_at <= datetime('now', '-15 minutes')`
  ).all();

  if (!stale.length) {
    console.log(`[cleanup] No stale pending bookings`);
    return;
  }

  for (const b of stale) {
    await env.DB.prepare(`DELETE FROM booking_events WHERE booking_id = ?`).bind(b.id).run();
    await env.DB.prepare(`DELETE FROM bookings WHERE id = ?`).bind(b.id).run();
  }
  console.log(`[cleanup] Deleted ${stale.length} stale pending booking(s)`);
}
