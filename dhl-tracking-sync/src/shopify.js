const cfg = require('./config');
// store-gebundener Client (eigener Token-Cache je Store)
function createClient(store){
  let _tok=null,_exp=0;
  async function getToken(){
    if(_tok && Date.now()<_exp-60000) return _tok;
    const r=await fetch(`https://${store.shop}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:store.clientId,client_secret:store.clientSecret})});
    if(!r.ok) throw new Error(`Shopify Token ${r.status} (${store.key}): ${await r.text()}`);
    const j=await r.json(); _tok=j.access_token; _exp=Date.now()+(j.expires_in||86399)*1000; return _tok;
  }
  async function gql(query, variables){
    const res=await fetch(`https://${store.shop}/admin/api/${cfg.apiVersion}/graphql.json`,{method:'POST',headers:{'X-Shopify-Access-Token':await getToken(),'Content-Type':'application/json'},body:JSON.stringify({query,variables})});
    const j=await res.json(); if(j.errors) throw new Error('Shopify GraphQL: '+JSON.stringify(j.errors)); return j.data;
  }
  async function* iterateOpenFulfillments(lookbackDays){
    const since=new Date(Date.now()-lookbackDays*86400000).toISOString().slice(0,10);
    const q=`created_at:>=${since} fulfillment_status:shipped`;
    let cursor=null;
    do{
      const data=await gql(`query($q:String!,$c:String){ orders(first:50, query:$q, after:$c, sortKey:CREATED_AT){
        pageInfo{ hasNextPage endCursor }
        nodes{ name fulfillments(first:5){ id displayStatus trackingInfo{ number company } events(first:20){ nodes{ status } } } } } }`, { q, c:cursor });
      for(const o of data.orders.nodes){ for(const f of (o.fulfillments||[])) yield { order:o.name, f }; }
      cursor=data.orders.pageInfo.hasNextPage?data.orders.pageInfo.endCursor:null;
    } while(cursor);
  }
  async function createEvent(fulfillmentId, status, message){
    const data=await gql(`mutation($in:FulfillmentEventInput!){ fulfillmentEventCreate(fulfillmentEvent:$in){ fulfillmentEvent{ id status } userErrors{ field message } } }`,
      { in:{ fulfillmentId, status, message, happenedAt:new Date().toISOString() } });
    const ue=data.fulfillmentEventCreate.userErrors; if(ue?.length) throw new Error('fulfillmentEventCreate: '+JSON.stringify(ue));
    return data.fulfillmentEventCreate.fulfillmentEvent;
  }
  return { key:store.key, shop:store.shop, iterateOpenFulfillments, createEvent };
}
module.exports={ createClient };
