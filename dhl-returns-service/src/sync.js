const cfg=require('./config'); const { createClient }=require('./shopify'); const { processReturn }=require('./handler');
async function run(){
  let ok=0,dry=0,skip=0,err=0,n=0,stop=false;
  for(const store of cfg.stores){
    if(stop) break;
    const sh=createClient(store);
    console.log(`=== Store: ${store.key} (${store.shop}) ===`);
    try{
      for await (const cand of sh.findCandidates()){
        if(n>=cfg.maxPerRun){ console.warn(`[CAP] ${cfg.maxPerRun} Retouren/Lauf erreicht – Rest beim nächsten Lauf.`); stop=true; break; }
        n++;
        try{ const r=await processReturn(sh,cand); ({ok:()=>ok++,dry:()=>dry++,skip:()=>skip++}[r]||(()=>{}))(); }
        catch(e){ err++; console.error(`[ERR] [${store.key}] ${cand.order?.name} ${cand.ret?.name}: ${e.message}`); }
      }
    } catch(e){ err++; console.error(`[ERR] Store ${store.key}: ${e.message}`); }
  }
  console.log(`Fertig. MODE=${cfg.mode} stores=${cfg.stores.length} verarbeitet=${n} ok=${ok} dry=${dry} skip=${skip} fehler=${err} dryRun=${cfg.dryRun}`);
}
module.exports={ run };
