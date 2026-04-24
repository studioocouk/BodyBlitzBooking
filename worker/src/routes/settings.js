import { json } from '../middleware.js';

export async function handleSettings(request, env) {
  const row = await env.DB.prepare('SELECT * FROM settings WHERE id = 1').first();
  return json({
    base_price_pence: row.base_price_pence,
    default_capacity: row.default_capacity,
    discount_tiers: JSON.parse(row.discount_tiers)
  });
}
