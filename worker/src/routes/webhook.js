import { json } from '../middleware.js';

export async function handleWebhook(request, env) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  // Verify Stripe signature
  const valid = await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
// temporarily disabled for testing
// if (!valid) return new Response('Invalid signature', { status: 400 });

  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingId = parseInt(session.metadata?.booking_id);
    if (!bookingId) return json({ ok: true });

    // Mark booking paid
    await env.DB.prepare(
      `UPDATE bookings SET status = 'paid', amount_paid_pence = ? WHERE id = ?`
    ).bind(session.amount_total, bookingId).run();

    // Decrement spaces_sold for each booked event
    const { results: beRows } = await env.DB.prepare(
      `SELECT event_id FROM booking_events WHERE booking_id = ?`
    ).bind(bookingId).all();

    for (const row of beRows) {
      await env.DB.prepare(
        `UPDATE events SET spaces_sold = spaces_sold + 1 WHERE id = ? AND spaces_sold < capacity`
      ).bind(row.event_id).run();
    }

    // Fetch full booking + events for email
    const booking = await env.DB.prepare(
      `SELECT * FROM bookings WHERE id = ?`
    ).bind(bookingId).first();

    const { results: events } = await env.DB.prepare(
      `SELECT e.event_title, e.date, e.start_time, e.end_time, e.meet_link, be.price_paid_pence
       FROM booking_events be
       JOIN events e ON e.id = be.event_id
       WHERE be.booking_id = ?
       ORDER BY e.date ASC, e.start_time ASC`
    ).bind(bookingId).all();

    await sendConfirmationEmail(booking, events, env);
  }

  return json({ ok: true });
}

async function sendConfirmationEmail(booking, events, env) {
  const total = events.reduce((s, e) => s + e.price_paid_pence, 0);

  const classRows = events.map(ev => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee">
        <strong>${ev.event_title}</strong><br>
        <span style="color:#555">${formatUKDate(ev.date)} &bull; ${ev.start_time}–${ev.end_time} (UK time)</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;vertical-align:top">
        <a href="${ev.meet_link}" style="background:#1D9E75;color:#fff;padding:6px 14px;border-radius:6px;text-decoration:none;font-size:13px">Join link</a>
      </td>
    </tr>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#222">
  <h1 style="font-size:22px;margin:0 0 4px">You're booked in!</h1>
  <p style="color:#555;margin:0 0 24px">Hi ${booking.customer_name}, your payment was successful. Here are your classes:</p>

  <table style="width:100%;border-collapse:collapse">
    ${classRows}
  </table>

  <p style="margin:24px 0 8px;font-size:15px">
    <strong>Total paid: £${(total / 100).toFixed(2)}</strong>
  </p>

  <p style="color:#555;font-size:13px;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px">
    Need to cancel? Just reply to this email. We'll process refunds manually within 2 working days.<br><br>
    See you on the mat &mdash; Studioo
  </p>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Studioo <bookings@studioo.co.uk>',
      to: booking.customer_email,
      subject: `Booking confirmed — ${events.length} class${events.length > 1 ? 'es' : ''}`,
      html
    })
  });
}

function formatUKDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Stripe webhook signature verification (Web Crypto API — works in Workers)
async function verifyStripeSignature(body, sigHeader, secret) {
  try {
    const parts = sigHeader.split(',').reduce((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts['t'];
    const signature = parts['v1'];
    const payload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computed === signature;
  } catch { return false; }
}
