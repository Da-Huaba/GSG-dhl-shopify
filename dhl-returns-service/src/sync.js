const cfg=require('./config'); const shopify=require('./shopify'); const { processReturn }=require('./handler');
async function run(){
  let ok=0,dry=0,skip=0,err=0,n=0;
  for await (const cand of shopify.findCandidates()){
    if(n>=cfg.maxPerRun){ console.warn(`[CAP] ${cfg.maxPerRun} Retouren/Lauf erreicht – Rest beim nächsten Lauf.`); break; }
    n++;
    try{ const r=await processReturn(cand); ({ok:()=>ok++,dry:()=>dry++,skip:()=>skip++}[r]||(()=>{}))(); }
    catch(e){ err++; console.error(`[ERR] ${cand.order?.name} ${cand.ret?.name}: ${e.message}`); }
  }
  console.log(`Fertig. MODE=${cfg.mode} verarbeitet=${n} ok=${ok} dry=${dry} skip=${skip} fehler=${err} dryRun=${cfg.dryRun}`);
}
module.exports={ run };
