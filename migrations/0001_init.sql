-- Studioo Booking System — D1 Schema
-- Run via: wrangler d1 execute studioo-db --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_price_pence INTEGER NOT NULL DEFAULT 1000,
  default_capacity INTEGER NOT NULL DEFAULT 10,
  discount_tiers TEXT NOT NULL DEFAULT '[{"min":4,"pct":20},{"min":8,"pct":30},{"min":12,"pct":40}]'
);

INSERT OR IGNORE INTO settings (id, base_price_pence, default_capacity, discount_tiers)
VALUES (1, 1000, 10, '[{"min":4,"pct":20},{"min":8,"pct":30},{"min":12,"pct":40}]');

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_title TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time TEXT NOT NULL,    -- HH:MM (UK time)
  end_time TEXT NOT NULL,      -- HH:MM (UK time)
  duration_mins INTEGER NOT NULL,
  blank1 TEXT DEFAULT '',
  blank2 TEXT DEFAULT '',
  meet_link TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 10,
  spaces_sold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  waiver_accepted INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT UNIQUE,
  amount_paid_pence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  price_paid_pence INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_stripe ON bookings(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_event ON booking_events(event_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
