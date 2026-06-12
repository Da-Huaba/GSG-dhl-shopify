const cfg = require('./config');

// DHL Shipment Tracking - Unified
// GET {base}/track/shipments?trackingNumber=...   Header: DHL-API-Key
async function trackShipment(trackingNumber) {
  const url = `${cfg.dhlBase}/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`;
  const res = await fetch(url, { headers: { 'DHL-API-Key': cfg.dhlApiKey, 'Accept': 'application/json' } });
  if (res.status === 404) return null;            // unbekannt -> später erneut versuchen
  if (!res.ok) throw new Error(`DHL ${res.status} for ${trackingNumber}: ${await res.text()}`);
  const data = await res.json();
  return (data.shipments && data.shipments[0]) || null;
}
module.exports = { trackShipment };
