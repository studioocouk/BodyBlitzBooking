/**
 * Calculate price for a bundle of classes.
 * @param {number} count - number of classes selected
 * @param {number} basePence - full price per class in pence
 * @param {Array}  tiers - [{min, pct}, ...] sorted ascending by min
 * @returns {{ pricePerClass, totalPence, discountPct }}
 */
export function calcPrice(count, basePence, tiers) {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  const tier = sorted.find(t => count >= t.min);
  const discountPct = tier ? tier.pct : 0;
  const pricePerClass = Math.round(basePence * (1 - discountPct / 100));
  const totalPence = pricePerClass * count;
  return { pricePerClass, totalPence, discountPct };
}
