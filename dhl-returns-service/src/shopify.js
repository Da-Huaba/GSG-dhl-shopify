const cfg = require('./config');
let _tok=null,_exp=0;
async function getToken(){
  if(_tok && Date.now()<_exp-60000) return _tok;
  const r=await fetch(`https://${cfg.shop}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:cfg.clientId,client_secret:cfg.clientSecret})});
  if(!r.ok) throw new Error(`Shopify Token ${r.status}: ${await r.text()}`);
  const j=await r.json(); _tok=j.access_token; _exp=Date.now()+(j.expires_in||86399)*1000; return _tok;
}
async function gql(query, variables){
  const res=await fetch(`https://${cfg.shop}/admin/api/${cfg.apiVersion}/graphql.json`,{
    method:'POST', headers:{'X-Shopify-Access-Token':await getToken(),'Content-Type':'application/json'},
    body:JSON.stringify({query,variables}) });
  const j=await res.json(); if(j.errors) throw new Error('Shopify GraphQL: '+JSON.stringify(j.errors)); return j.data;
}
const PROCESSED_TAG='dhl-return-label-created';

// Kandidaten-Retouren per Polling finden (nur ausgehende Calls)
async function* findCandidates(){
  const since=new Date(Date.now()-cfg.lookbackDays*86400000).toISOString().slice(0,10);
  const statusFilter = cfg.mode==='AUTO' ? '(return_status:return_requested OR return_status:in_progress)' : 'return_status:in_progress';
  let q=`created_at:>=${since} ${statusFilter} -tag:${PROCESSED_TAG}`;
  if(cfg.only.length) q+=' ('+cfg.only.map(n=>`name:${n}`).join(' OR ')+')';
  let cursor=null;
  do{
    const d=await gql(`
      query($q:String!,$c:String){ orders(first:25, query:$q, after:$c, sortKey:CREATED_AT){
        pageInfo{ hasNextPage endCursor }
        nodes{ id name createdAt email tags
          shippingAddress{ firstName lastName address1 address2 zip city countryCodeV2 }
          returns(first:5){ nodes{ id name status
            returnLineItems(first:50){ nodes{ ... on ReturnLineItem { quantity returnReason } } }
            reverseFulfillmentOrders(first:5){ nodes{ id
              reverseDeliveries(first:1){ nodes{ id } }
              lineItems(first:50){ nodes{ id totalQuantity } } } } } }
        } } }`, { q, c:cursor });
    for(const o of d.orders.nodes){
      if(cfg.only.length && !cfg.only.includes(o.name)) continue;
      for(const r of (o.returns?.nodes||[])){
        const rfo=(r.reverseFulfillmentOrders?.nodes||[])[0];
        if(rfo && (rfo.reverseDeliveries?.nodes||[]).length>0) continue; // schon Label vorhanden
        yield { order:o, ret:r, rfo };
      }
    }
    cursor=d.orders.pageInfo.hasNextPage?d.orders.pageInfo.endCursor:null;
  } while(cursor);
}

async function getRfo(returnGid){
  const d=await gql(`query($id:ID!){ return(id:$id){ reverseFulfillmentOrders(first:5){ nodes{ id reverseDeliveries(first:1){ nodes{ id } } lineItems(first:50){ nodes{ id totalQuantity } } } } } }`, { id:returnGid });
  return (d.return?.reverseFulfillmentOrders?.nodes||[])[0];
}
function toKg(v,u){ if(v==null) return null; u=(u||'').toUpperCase(); if(u==='GRAMS') return v/1000; if(u==='KILOGRAMS'||u==='KG') return v; if(u==='POUNDS') return v*0.453592; if(u==='OUNCES') return v*0.0283495; return v; }
async function getCustomsItems(returnGid){
  const d=await gql(`query($id:ID!){ return(id:$id){ returnLineItems(first:50){ nodes{ ... on ReturnLineItem {
    quantity
    fulfillmentLineItem{ lineItem{ title discountedUnitPriceSet{ shopMoney{ amount currencyCode } } variant{ weight weightUnit } } } } } } } }`, { id:returnGid });
  const nodes=d.return?.returnLineItems?.nodes||[];
  return nodes.map(n=>{
    const li=n.fulfillmentLineItem?.lineItem||{};
    const m=li.discountedUnitPriceSet?.shopMoney||{};
    const kg=toKg(li.variant?.weight, li.variant?.weightUnit) || 0.5;
    return { itemDescription:(li.title||'Returned item').slice(0,50), packagedQuantity:n.quantity,
      itemWeight:{ uom:'kg', value:Number(kg.toFixed(3)) }, itemValue:{ currency:m.currencyCode||'EUR', value:Number(m.amount||0) } };
  });
}
async function approveReturn(id){
  const d=await gql(`mutation($in:ReturnApproveRequestInput!){ returnApproveRequest(input:$in){ return{ id status } userErrors{ message } } }`,
    { in:{ id, notifyCustomer:false } });
  const ue=d.returnApproveRequest.userErrors; if(ue?.length) throw new Error('approve: '+JSON.stringify(ue));
}
async function uploadLabel(b64, filename){
  const d=await gql(`mutation($in:[StagedUploadInput!]!){ stagedUploadsCreate(input:$in){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ message } } }`,
    { in:[{ resource:'RETURN_LABEL', filename, mimeType:'application/pdf', httpMethod:'POST' }] });
  const ue=d.stagedUploadsCreate.userErrors; if(ue?.length) throw new Error('staged: '+JSON.stringify(ue));
  const t=d.stagedUploadsCreate.stagedTargets[0];
  const form=new FormData(); for(const p of t.parameters) form.append(p.name,p.value);
  form.append('file', new Blob([Buffer.from(b64,'base64')],{type:'application/pdf'}), filename);
  const up=await fetch(t.url,{method:'POST',body:form}); if(!up.ok) throw new Error(`upload ${up.status}: ${await up.text()}`);
  return t.resourceUrl;
}
async function createReverseDelivery(rfoId, lineItems, tracking, fileUrl, notify){
  const d=await gql(`mutation($rfoId:ID!,$li:[ReverseDeliveryLineItemInput!]!,$tr:ReverseDeliveryTrackingInput,$lb:ReverseDeliveryLabelInput,$n:Boolean){
      reverseDeliveryCreateWithShipping(reverseFulfillmentOrderId:$rfoId, reverseDeliveryLineItems:$li, trackingInput:$tr, labelInput:$lb, notifyCustomer:$n){
        reverseDelivery{ id } userErrors{ message } } }`,
    { rfoId, li:lineItems, tr:tracking, lb:{ fileUrl }, n:notify });
  const ue=d.reverseDeliveryCreateWithShipping.userErrors; if(ue?.length) throw new Error('reverseDelivery: '+JSON.stringify(ue));
}
async function tagProcessed(orderId){
  await gql(`mutation($id:ID!,$t:[String!]!){ tagsAdd(id:$id, tags:$t){ userErrors{ message } } }`, { id:orderId, t:[PROCESSED_TAG] });
}
module.exports={ findCandidates, getRfo, getCustomsItems, approveReturn, uploadLabel, createReverseDelivery, tagProcessed };
