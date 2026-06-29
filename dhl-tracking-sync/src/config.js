const fs=require('fs'), path=require('path');
(function loadEnv(){
  try{ const p=path.join(process.cwd(),'.env'); if(!fs.existsSync(p)) return;
    for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){ const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if(m && process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); }
  }catch{}
})();
function req(n){ const v=process.env[n]; if(!v) throw new Error('Missing env var: '+n); return v; }
function opt(n,d){ return process.env[n]!==undefined?process.env[n]:d; }
function normShop(x){ return x.includes('.myshopify.com')?x:x+'.myshopify.com'; }
function buildStores(){
  const raw=process.env.SHOPIFY_STORES; let list;
  if(raw){ try{ list=JSON.parse(raw); }catch{ throw new Error('SHOPIFY_STORES ist kein gültiges JSON'); } }
  else { list=[{ key:'default', shop:req('SHOPIFY_SHOP'), clientId:req('SHOPIFY_CLIENT_ID'), clientSecret:req('SHOPIFY_CLIENT_SECRET') }]; }
  return list.map(s=>{ if(!s.shop||!s.clientId||!s.clientSecret) throw new Error('Store-Eintrag braucht shop, clientId, clientSecret'); return { key:s.key||s.shop, shop:normShop(s.shop), clientId:s.clientId, clientSecret:s.clientSecret }; });
}
module.exports={
  stores: buildStores(),
  apiVersion: opt('SHOPIFY_API_VERSION','2025-07'),
  dhlApiKey: req('DHL_API_KEY'),
  dhlBase: opt('DHL_TRACKING_BASE','https://api-eu.dhl.com'),
  lookbackDays: parseInt(opt('LOOKBACK_DAYS','10'),10),
  dryRun: String(opt('DRY_RUN','true')).toLowerCase()==='true',
  rateDelayMs: parseInt(opt('DHL_RATE_DELAY_MS','1100'),10),
  maxCalls: parseInt(opt('MAX_TRACK_CALLS','240'),10),   // GLOBAL über alle Stores (geteilte DHL-Quota)
};
