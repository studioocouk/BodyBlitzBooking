const FROM = 'Studioo <bookings@studioo.co.uk>';

export async function sendEmail(env, { to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM, to, subject, html })
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Resend error for ${to}:`, err);
  }
  return res.ok;
}

function emailWrap(preheader, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Studioo</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
      <tr><td style="background:#1D9E75;padding:20px 28px">
        <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.02em">Studioo</span>
      </td></tr>
      <tr><td style="padding:28px 28px 8px">
        ${bodyContent}
      </td></tr>
      <tr><td style="padding:16px 28px 28px;border-top:1px solid #eeeeee">
        <p style="margin:0;font-size:12px;color:#999999">Studioo &bull; bookings@studioo.co.uk</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function emailButton(url, label, color) {
  const bg = color || '#1D9E75';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0">
  <tr><td style="background:${bg};border-radius:6px">
    <a href="${url}" target="_blank"
       style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif">${label}</a>
  </td></tr>
</table>`;
}

const divider = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
  <tr><td style="border-top:1px solid #eeeeee;font-size:0">&nbsp;</td></tr>
</table>`;

export function emailConfirmation(booking, events) {
  const total = events.reduce((s, e) => s + e.price_paid_pence, 0);
  const classRows = events.map(ev => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr>
        <td style="padding:12px 14px;background:#f9fafb;border-radius:6px;border-left:3px solid #1D9E75">
          <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#1a1a1a">${ev.event_title}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#555555">${formatUKDate(ev.date)} &bull; ${ev.start_time}&ndash;${ev.end_time} (UK time)</p>
          ${emailButton(ev.meet_link, 'Join class')}
        </td>
      </tr>
    </table>`).join('');

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;color:#1a1a1a">You're booked in!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555555">Hi ${booking.customer_name}, your payment was successful. Here are your classes:</p>
    ${classRows}
    ${divider}
    <p style="margin:0 0 4px;font-size:15px;color:#1a1a1a"><strong>Total paid: &pound;${(total / 100).toFixed(2)}</strong></p>
    <p style="margin:16px 0 0;font-size:13px;color:#555555">Need to cancel? Just reply to this email. We'll process refunds manually within 2 working days.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#555555">See you on the mat &mdash; Studioo</p>`;

  return {
    subject: `Booking confirmed \u2014 ${events.length} class${events.length > 1 ? 'es' : ''}`,
    html: emailWrap(`Booking confirmed for ${events.length} class${events.length > 1 ? 'es' : ''}`, body)
  };
}

export function emailReminder(booking, event) {
  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#1D9E75;text-transform:uppercase;letter-spacing:0.06em">Today's class</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#1a1a1a">${event.event_title}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555555">Hi ${booking.customer_name}, here's everything you need for today.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:13px;color:#777777;width:100px;vertical-align:top">When</td>
        <td style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#1a1a1a;vertical-align:top">
          <strong>${formatUKDate(event.date)}</strong><br>
          <span style="color:#555555">${event.start_time}&ndash;${event.end_time} (UK time)</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#777777;vertical-align:top">Duration</td>
        <td style="padding:10px 0;font-size:14px;color:#1a1a1a;vertical-align:top">${event.duration_mins} minutes</td>
      </tr>
    </table>
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a">Join 10 minutes early to get set up:</p>
    ${emailButton(event.meet_link, 'Join class now')}
    <p style="margin:20px 0 0;font-size:13px;color:#555555">Can't make it? Reply to this email and we'll sort out a refund.</p>`;

  return {
    subject: `Today's class \u2014 ${event.event_title} at ${event.start_time}`,
    html: emailWrap(`${event.event_title} starts at ${event.start_time} today`, body)
  };
}

export function emailCancellation(booking, event) {
  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#dc2626;text-transform:uppercase;letter-spacing:0.06em">Class cancelled</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#1a1a1a">We're sorry &mdash; this class has been cancelled</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#555555">Hi ${booking.customer_name}, unfortunately we've had to cancel the following class:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr><td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:14px 16px">
        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#1a1a1a">${event.event_title}</p>
        <p style="margin:0;font-size:13px;color:#555555">${formatUKDate(event.date)} &bull; ${event.start_time}&ndash;${event.end_time} (UK time)</p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a"><strong>You will receive a full refund</strong> for this class within 5&ndash;10 business days. If you booked a bundle, the refund will be for the per-class price you paid for this session.</p>
    <p style="margin:0;font-size:13px;color:#555555">We apologise for the inconvenience. If you have any questions, just reply to this email.</p>`;

  return {
    subject: `Class cancelled \u2014 ${event.event_title} on ${formatUKDateShort(event.date)}`,
    html: emailWrap(`${event.event_title} on ${formatUKDateShort(event.date)} has been cancelled`, body)
  };
}

export function emailBookingCancellation(booking, events) {
  const classRows = events.map(ev => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#1a1a1a">${ev.event_title}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eeeeee;font-size:13px;color:#555555;text-align:right">${formatUKDateShort(ev.date)} ${ev.start_time}</td>
    </tr>`).join('');

  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#dc2626;text-transform:uppercase;letter-spacing:0.06em">Booking cancelled</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#1a1a1a">Your booking has been cancelled</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#555555">Hi ${booking.customer_name}, your booking has been cancelled by the studio.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      ${classRows}
    </table>
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a"><strong>You will receive a full refund</strong> of &pound;${(booking.amount_paid_pence / 100).toFixed(2)} within 5&ndash;10 business days.</p>
    <p style="margin:0;font-size:13px;color:#555555">If you have any questions, just reply to this email.</p>`;

  return {
    subject: `Your booking has been cancelled`,
    html: emailWrap('Your Studioo booking has been cancelled', body)
  };
}

export function emailEventUpdate(booking, event) {
  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#1D9E75;text-transform:uppercase;letter-spacing:0.06em">Class update</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#1a1a1a">Details have changed for your class</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#555555">Hi ${booking.customer_name}, here are the updated details for your upcoming class:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr><td style="background:#E1F5EE;border:1px solid #9FE1CB;border-radius:6px;padding:14px 16px">
        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#085041">${event.event_title}</p>
        <p style="margin:0 0 10px;font-size:13px;color:#0F6E56">${formatUKDate(event.date)} &bull; ${event.start_time}&ndash;${event.end_time} (UK time)</p>
        ${emailButton(event.meet_link, 'Join class')}
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#555555">Please update your calendar with the new details. If you have any questions, just reply to this email.</p>`;

  return {
    subject: `Class update \u2014 ${event.event_title} on ${formatUKDateShort(event.date)}`,
    html: emailWrap(`Updated details for ${event.event_title}`, body)
  };
}

export function formatUKDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatUKDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
