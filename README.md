# Studioo Class Booking System 

## Project structure

```
studioo-booking/
├── migrations/
│   └── 0001_init.sql          # D1 database schema
├── worker/
│   ├── wrangler.toml          # Worker config
│   └── src/
│       ├── index.js           # Main router
│       ├── middleware.js       # CORS + auth
│       ├── pricing.js          # Bundle price calculator
│       └── routes/
│           ├── events.js       # GET /events
│           ├── settings.js     # GET /settings
│           ├── bookings.js     # POST /bookings/create
│           ├── webhook.js      # POST /webhook (Stripe)
│           └── admin.js        # /admin/* (protected)
└── pages/
    ├── widget/index.html       # Embeddable booking widget
    └── admin/index.html        # Admin dashboard
```

---

## Deployment steps

### 1. Create D1 database

```bash
wrangler d1 create studioo-db
# Copy the database_id into worker/wrangler.toml
```

### 2. Run migration

```bash
wrangler d1 execute studioo-db --file=migrations/0001_init.sql
```

### 3. Set secrets

```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put ADMIN_PASSWORD          # your chosen admin password
```

### 4. Update wrangler.toml

- Set `database_id` from step 1
- Set `WIDGET_ORIGIN` to your Hostinger domain (e.g. `https://studioo.co.uk`)
- Set `ADMIN_ORIGIN` to your admin Pages URL (e.g. `https://admin.studioo.co.uk`)

### 5. Update API URLs in HTML files

In both `pages/widget/index.html` and `pages/admin/index.html`, replace:
```
https://studioo-booking-worker.YOUR_SUBDOMAIN.workers.dev
```
with your actual Worker URL.

### 6. Deploy Worker

```bash
cd worker
wrangler deploy
```

### 7. Deploy Pages

Deploy both Pages sites via Cloudflare Dashboard (Pages > Create project > Direct upload):
- `pages/widget/` → your booking widget (embed as iframe in Hostinger)
- `pages/admin/` → your admin dashboard

### 8. Set up Stripe webhook

In Stripe Dashboard → Webhooks → Add endpoint:
- URL: `https://your-worker.workers.dev/webhook`
- Event: `checkout.session.completed`

Copy the webhook signing secret and set it:
```bash
wrangler secret put STRIPE_WEBHOOK_SECRET
```

### 9. Embed widget in Hostinger

Add an HTML block to your Hostinger page:
```html
<iframe
  src="https://your-widget-pages-url.pages.dev"
  width="100%"
  height="700"
  frameborder="0"
  style="border:none;border-radius:10px"
></iframe>
```

---

## Pricing logic

You set one value: `base_price_pence` in the admin Settings tab.

Default tiers (fully editable in admin):
| Classes selected | Discount | Price per class (at £10 base) |
|---|---|---|
| 1–3 | 0% | £10.00 |
| 4–7 | 20% | £8.00 |
| 8–11 | 30% | £7.00 |
| 12+ | 40% | £6.00 |

The widget shows the next discount tier ("Add 2 more to unlock 30% off") as an incentive.

---

## Importing events from Google Sheets

In the Admin → Events tab, paste rows directly from your sheet.

Required column order:
1. Event Title
2. Date (YYYY-MM-DD)
3. Start Time (HH:MM)
4. End Time (HH:MM)
5. Duration (Mins)
6. Blank1
7. Blank2
8. Meet Link

Select all rows in your sheet (without the header), copy, paste into the import box, click Import.

---

## Waiver

The widget requires customers to tick a waiver checkbox before they can pay. The confirmation email does not re-state waiver content — link your waiver page in the widget HTML:

```html
<!-- In widget/index.html, find this line and update the href: -->
<a href="https://studioo.co.uk/waiver" target="_blank">health &amp; liability waiver</a>
```

---

## Cancellations

Customers cancel by replying to their confirmation email. You then issue a manual refund via the Stripe Dashboard. The booking status in D1 can be manually updated to `cancelled` if needed.
