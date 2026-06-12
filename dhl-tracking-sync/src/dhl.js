const cfg = require('./config');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// DHL Shipment Tracking - Unified, mit 429-Backoff (respektiert Retry-After)
async function trackShipment(trackingNumber, attempt = 0) {
  const url = `${cfg.dhlBase}/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`;
  const res = await fetch(url, { headers: { 'DHL-API-Key': cfg.dhlApiKey, 'Accept': 'application/json' } });
  if (res.status === 429) {
    if (attempt >= 5) { const e = new Error('DHL 429: Rate-Limit (Retries erschöpft)'); e.rateLimited = true; throw e; }
    const ra = parseInt(res.headers.get('retry-after') || '0', 10);
    await sleep(ra > 0 ? ra * 1000 : Math.min(1500 * (attempt + 1), 8000));
    return trackShipment(trackingNumber, attempt + 1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`DHL ${res.status} for ${trackingNumber}: ${await res.text()}`);
  const data = await res.json();
  return (data.shipments && data.shipments[0]) || null;
}
module.exports = { trackShipment };
