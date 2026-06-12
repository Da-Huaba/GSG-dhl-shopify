const cfg = require('./config').dhl;
let token=null, exp=0;
async function getToken(){
  if(token && Date.now()<exp-30000) return token;
  const res = await fetch(`${cfg.base}/parcel/de/account/auth/ropc/v1/token`,{
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'password',username:cfg.user,password:cfg.password,client_id:cfg.clientId,client_secret:cfg.clientSecret}),
  });
  if(!res.ok) throw new Error(`DHL Auth ${res.status}: ${await res.text()}`);
  const j=await res.json(); token=j.access_token; exp=Date.now()+(j.expires_in||3600)*1000; return token;
}
// Feldnamen gemäß DHL-Doku: shipper.addressStreet + addressHouse getrennt; Antwort label.b64 + shipmentNo
async function createReturnOrder(ctx){
  const t=await getToken();
  const payload={
    receiverId: ctx.receiverId,
    customerReference: ctx.orderName,
    shipmentReference: ctx.returnName,
    shipper:{ name1:ctx.shipper.name, addressStreet:ctx.shipper.street, addressHouse:ctx.shipper.house,
      postalCode:ctx.shipper.zip, city:ctx.shipper.city, email:ctx.shipper.email },
  };
  if(ctx.customsItems && ctx.customsItems.length){
    payload.customsDetails = { items: ctx.customsItems };   // Nicht-EU (CH/GB): Zollangaben
  } else {
    payload.itemWeight = { uom:'kg', value: ctx.weightKg || 1 };
    payload.itemValue  = { currency:'EUR', value: ctx.itemValue || 0 };
  }
  const res=await fetch(`${cfg.base}/parcel/de/shipping/returns/v1/orders?labelType=${encodeURIComponent(cfg.labelType)}`,{
    method:'POST', headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  const txt=await res.text(); if(!res.ok) throw new Error(`DHL createReturnOrder ${res.status}: ${txt}`);
  const j=JSON.parse(txt);
  return { shipmentNo: j.shipmentNo, labelB64: j.label?.b64 || j.labelData,
    trackingUrl:`https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${j.shipmentNo}` };
}
module.exports={ getToken, createReturnOrder };
