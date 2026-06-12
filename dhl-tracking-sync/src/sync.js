const cfg = require('./config');
const dhl = require('./dhl');
const shopify = require('./shopify');
const { mapDhlToShopify, rank } = require('./mapping');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isDHL = c => /dhl/i.test(c || '');

async function run() {
  let calls = 0, updated = 0, skipped = 0, errors = 0;
  let capReached = false;
  for await (const { order, f } of shopify.iterateOpenFulfillments(cfg.lookbackDays)) {
    if (capReached) break;
    const tracks = (f.trackingInfo || []).filter(t => t.number && isDHL(t.company));
    if (!tracks.length) continue;
    const existing = (f.events?.nodes || []).map(e => e.status);
    if (existing.includes('DELIVERED')) { skipped++; continue; }
    const currentRank = Math.max(0, ...existing.map(rank));

    for (const t of tracks) {
      if (calls >= cfg.maxCalls) {
        capReached = true;
        console.warn(`[CAP] Tageslimit von ${cfg.maxCalls} DHL-Calls erreicht – Rest wird beim nächsten Lauf verarbeitet.`);
        break;
      }
      try {
        const shipment = await dhl.trackShipment(t.number);
        calls++;
        await sleep(cfg.rateDelayMs);
        if (!shipment) { skipped++; continue; }
        const target = mapDhlToShopify(shipment);
        if (!target) { skipped++; continue; }
        if (rank(target) <= currentRank) { skipped++; continue; }
        const msg = `DHL ${shipment.status?.statusCode || ''}: ${shipment.status?.status || shipment.status?.description || ''}`.trim();
        if (cfg.dryRun) {
          console.log(`[DRY] ${order} ${t.number} -> ${target} (${msg})`);
        } else {
          await shopify.createEvent(f.id, target, msg);
          console.log(`[OK ] ${order} ${t.number} -> ${target}`);
        }
        updated++;
      } catch (e) {
        errors++;
        console.error(`[ERR] ${order} ${t.number}: ${e.message}`);
      }
    }
  }
  console.log(`Fertig. dhlCalls=${calls}/${cfg.maxCalls} aktualisiert=${updated} übersprungen=${skipped} fehler=${errors} dryRun=${cfg.dryRun}`);
}
module.exports = { run };
