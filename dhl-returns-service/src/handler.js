const cfg=require('./config'); const dhl=require('./dhl'); const guardrails=require('./guardrails');

function splitStreet(a1,a2){
  const s=(a1||'').trim();
  // Hausnummer am Ende (DE/AT)
  let m=s.match(/^(.*?\S)[\s,]+(\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)$/);
  if(m) return { street:m[1].trim(), house:m[2].replace(/\s+/g,'') };
  // Hausnummer am Anfang (FR/UK/IT/ES)
  m=s.match(/^(\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)[\s,]+(.+)$/);
  if(m) return { street:m[2].trim(), house:m[1].replace(/\s+/g,'') };
  if(/^\d/.test((a2||'').trim())) return { street:s, house:(a2||'').trim() };
  return { street:s, house:'' };
}

// sh = store-gebundener Shopify-Client (aus shopify.createClient)
async function processReturn(sh, { order, ret, rfo }){
  const a=order.shippingAddress||{}; const country=a.countryCodeV2;
  const sp=splitStreet(a.address1,a.address2);
  const tag=`[${sh.key}] ${order.name} ${ret.name}`;
  const ctx={
    orderName:order.name, returnName:ret.name, orderCreatedAt:order.createdAt,
    country, receiverId:cfg.receiverIds[country],
    returnReasons:(ret.returnLineItems?.nodes||[]).map(n=>n.returnReason),
    shipper:{ name:[a.firstName,a.lastName].filter(Boolean).join(' '), street:sp.street, house:sp.house, zip:a.zip, city:a.city, email:order.email },
  };
  if(cfg.mode==='AUTO'){ const g=guardrails.check(ctx); if(!g.ok){ console.log(`[SKIP] ${tag}: ${g.reason} -> manuell`); return 'skip'; } }
  if(!ctx.receiverId){ console.log(`[SKIP] ${tag}: keine receiverId für Land ${country} -> manuell`); return 'skip'; }
  if(!ctx.shipper.house){ console.log(`[SKIP] ${tag}: keine Hausnummer erkennbar -> manuell`); return 'skip'; }

  if(cfg.dryRun){ console.log(`[DRY] ${tag}: würde ${cfg.mode==='AUTO'?'genehmigen + ':''}Label erzeugen (${country}, receiverId=${ctx.receiverId}, ${ctx.shipper.street} ${ctx.shipper.house})`); return 'dry'; }

  if(cfg.mode==='AUTO' && ret.status==='REQUESTED') await sh.approveReturn(ret.id);
  let rfoFresh = await sh.getRfo(ret.id);
  if(!rfoFresh){ await new Promise(r=>setTimeout(r,2500)); rfoFresh = await sh.getRfo(ret.id); }
  if(!rfoFresh) throw new Error('keine reverseFulfillmentOrder (auch nach Genehmigung)');
  if((rfoFresh.reverseDeliveries?.nodes||[]).length>0){ console.log(`[SKIP] ${tag}: bereits Reverse-Delivery vorhanden`); await sh.tagProcessed(order.id); return 'skip'; }
  if(cfg.customsCountries.includes(country)) ctx.customsItems = await sh.getCustomsItems(ret.id);
  const label=await dhl.createReturnOrder(ctx);
  const lineItems=(rfoFresh.lineItems?.nodes||[]).map(li=>({ reverseFulfillmentOrderLineItemId:li.id, quantity:li.totalQuantity }));
  const fileUrl=await sh.uploadLabel(label.labelB64, `${ctx.returnName}.pdf`);
  await sh.createReverseDelivery(rfoFresh.id, lineItems, { number:label.shipmentNo, url:label.trackingUrl }, fileUrl, true);
  await sh.tagProcessed(order.id);
  console.log(`[OK ] ${tag} -> shipmentNo ${label.shipmentNo}`);
  return 'ok';
}
module.exports={ processReturn };
