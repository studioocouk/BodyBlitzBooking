import { json } from '../middleware.js';
import { calcPrice } from '../pricing.js';

export async function handleBookings(request, env, path) {
  const method = request.method;

  // POST /bookings/create
  if (method === 'POST' && path === '/bookings/create') {
    const body = await request.json();
    const { name, email, waiver_accepted, event_ids } = body;

    if (!name || !email || !waiver_accepted || !event_ids?.length) {
      return json({ error: 'Missing required fields' }, 400);
    }

    // Load settings
    const settings = await env.DB.prepare('SELECT * FROM settings WHERE id = 1').first();
    const tiers = JSON.parse(settings.discount_tiers);
    const basePence = settings.base_price_pence;

    // Verify each event has space and get details
    const placeholders = event_ids.map(() => '?').join(',');
    const { results: events } = await env.DB.prepare(
      `SELECT id, event_title, date, start_time, end_time, meet_link, capacity, spaces_sold
       FROM events WHERE id IN (${placeholders})`
    ).bind(...event_ids).all();

    if (events.length !== event_ids.length) return json({ error: 'One or more events not found' }, 400);

    for (const ev of events) {
      if (ev.spaces_sold >= ev.capacity) {
        return json({ error: `"${ev.event_title}" on ${ev.date} is fully booked` }, 409);
      }
    }

    // Calculate price
    const { pricePerClass, totalPence, discountPct } = calcPrice(event_ids.length, basePence, tiers);

    // Create pending booking
    const { meta } = await env.DB.prepare(
      `INSERT INTO bookings (customer_name, customer_email, waiver_accepted, amount_paid_pence, status)
       VALUES (?, ?, ?, ?, 'pending')`
    ).bind(name, email, 1, totalPence).run();

    const bookingId = meta.last_row_id;

    // Insert booking_events rows
    for (const ev of events) {
      await env.DB.prepare(
        `INSERT INTO booking_events (booking_id, event_id, price_paid_pence) VALUES (?, ?, ?)`
      ).bind(bookingId, ev.id, pricePerClass).run();
    }

    // Build Stripe line items
    const lineItems = [{
      price_data: {
        currency: 'gbp',
        product_data: {
          name: event_ids.length === 1
            ? events[0].event_title
            : `${event_ids.length} classes${discountPct > 0 ? ` (${discountPct}% bundle discount)` : ''}`,
          description: events.map(e => `${e.event_title} — ${formatUKDate(e.date)} ${e.start_time}`).join(' | ')
        },
        unit_amount: totalPence
      },
      quantity: 1
    }];

    // Create Stripe Checkout session
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'payment_method_types[]': 'card',
        'mode': 'payment',
        'customer_email': email,
        'metadata[booking_id]': String(bookingId),
        'success_url': `${env.WIDGET_ORIGIN}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${env.WIDGET_ORIGIN}/booking-cancelled`,
        ...Object.fromEntries(lineItems.flatMap((item, i) => [
          [`line_items[${i}][price_data][currency]`, item.price_data.currency],
          [`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name],
          [`line_items[${i}][price_data][product_data][description]`, item.price_data.product_data.description],
          [`line_items[${i}][price_data][unit_amount]`, String(item.price_data.unit_amount)],
          [`line_items[${i}][quantity]`, String(item.quantity)]
        ]))
      }).toString()
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) return json({ error: session.error?.message }, 400);

    // Store session ID against booking
    await env.DB.prepare(
      `UPDATE bookings SET stripe_session_id = ? WHERE id = ?`
    ).bind(session.id, bookingId).run();

    return json({ checkout_url: session.url });
  }

  return json({ error: 'Not found' }, 404);
}

function formatUKDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
