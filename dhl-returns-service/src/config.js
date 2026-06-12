const fs=require('fs'), path=require('path');
// Minimaler .env-Loader (keine Abhängigkeit): lädt .env aus dem Projektordner, falls vorhanden
(function loadEnv(){
  try{
    const p=path.join(process.cwd(),'.env');
    if(!fs.existsSync(p)) return;
    for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){
      const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if(m && process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');
    }
  }catch{}
})();
function req(n){ const v=process.env[n]; if(!v) throw new Error('Missing env var: '+n); return v; }
function opt(n,d){ return process.env[n]!==undefined?process.env[n]:d; }
let receiverIds={}; try{ receiverIds=JSON.parse(opt('RECEIVER_IDS','{}')); }catch{ throw new Error('RECEIVER_IDS ist kein gültiges JSON'); }
module.exports={
  mode: opt('MODE','AUTO').toUpperCase(),
  dryRun: String(opt('DRY_RUN','true')).toLowerCase()==='true',
  lookbackDays: parseInt(opt('POLL_LOOKBACK_DAYS','30'),10),
  maxPerRun: parseInt(opt('MAX_PER_RUN','50'),10),
  shop: req('SHOPIFY_SHOP'), adminToken: req('SHOPIFY_ADMIN_TOKEN'), apiVersion: opt('SHOPIFY_API_VERSION','2025-07'),
  dhl:{ base: opt('DHL_BASE','https://api-eu.dhl.com'),
    clientId: req('DHL_CLIENT_ID'), clientSecret: req('DHL_CLIENT_SECRET'),
    user: req('DHL_GKP_USER'), password: req('DHL_GKP_PASSWORD'), labelType: opt('DHL_LABEL_TYPE','SHIPMENT_LABEL') },
  receiverIds,
  maxOrderAgeDays: parseInt(opt('MAX_ORDER_AGE_DAYS','60'),10),
  blockedReasons: opt('BLOCKED_REASONS','OTHER').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean),
};
