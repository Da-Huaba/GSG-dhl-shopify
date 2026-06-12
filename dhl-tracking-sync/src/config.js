function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
function normShop(x){ return x.includes('.myshopify.com')?x:x+'.myshopify.com'; }
module.exports = {
  shop: normShop(req('SHOPIFY_SHOP')),
  clientId: req('SHOPIFY_CLIENT_ID'),
  clientSecret: req('SHOPIFY_CLIENT_SECRET'),
  apiVersion: process.env.SHOPIFY_API_VERSION || '2025-07',
  dhlApiKey: req('DHL_API_KEY'),
  dhlBase: process.env.DHL_TRACKING_BASE || 'https://api-eu.dhl.com',
  lookbackDays: parseInt(process.env.LOOKBACK_DAYS || '30', 10),
  dryRun: String(process.env.DRY_RUN || 'true').toLowerCase() === 'true',
  rateDelayMs: parseInt(process.env.DHL_RATE_DELAY_MS || '350', 10),
  maxCalls: parseInt(process.env.MAX_TRACK_CALLS || '240', 10),
};
