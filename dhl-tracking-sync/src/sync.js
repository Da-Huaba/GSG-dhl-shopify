const cfg=require('./config'); const dhl=require('./dhl'); const { createClient }=require('./shopify'); const { mapDhlToShopify, rank }=require('./mapping');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const isDHL=c=>/dhl/i.test(c||'');
async function run(){
  let calls=0,updated=0,skipped=0,errors=0,stop=false;
  for(const store of cfg.stores){
    if(stop) break;
    const sh=createClient(store);
    console.log(`=== Store: ${store.key} (${store.shop}) ===`);
    try{
      for await (const { order, f } of sh.iterateOpenFulfillments(cfg.lookbackDays)){
        if(stop) break;
        const tracks=(f.trackingInfo||[]).filter(t=>t.number && isDHL(t.company));
        if(!tracks.length) continue;
        const existing=(f.events?.nodes||[]).map(e=>e.status);
        if(existing.includes('DELIVERED')){ skipped++; continue; }
        const currentRank=Math.max(0,...existing.map(rank));
        for(const t of tracks){
          if(calls>=cfg.maxCalls){ stop=true; console.warn(`[CAP] ${cfg.maxCalls} DHL-Calls (global) erreicht – Rest beim nächsten Lauf.`); break; }
          try{
            const shipment=await dhl.trackShipment(t.number); calls++;
            await sleep(cfg.rateDelayMs);
            if(!shipment){ skipped++; continue; }
            const target=mapDhlToShopify(shipment);
            if(!target){ skipped++; continue; }
            if(rank(target)<=currentRank){ skipped++; continue; }
            const msg=`DHL ${shipment.status?.statusCode||''}: ${shipment.status?.status||shipment.status?.description||''}`.trim();
            if(cfg.dryRun){ console.log(`[DRY] [${store.key}] ${order} ${t.number} -> ${target} (${msg})`); }
            else { await sh.createEvent(f.id, target, msg); console.log(`[OK ] [${store.key}] ${order} ${t.number} -> ${target}`); }
            updated++;
          } catch(e){
            errors++; console.error(`[ERR] [${store.key}] ${order} ${t.number}: ${e.message}`);
            if(e.rateLimited){ stop=true; console.warn('[STOP] DHL-Rate-Limit erreicht – Rest beim nächsten Lauf.'); break; }
          }
        }
      }
    } catch(e){ errors++; console.error(`[ERR] Store ${store.key}: ${e.message}`); }
  }
  console.log(`Fertig. stores=${cfg.stores.length} dhlCalls=${calls}/${cfg.maxCalls} aktualisiert=${updated} übersprungen=${skipped} fehler=${errors} dryRun=${cfg.dryRun}`);
}
module.exports={ run };
