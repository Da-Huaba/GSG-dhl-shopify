const cfg=require('./config'); const dhl=require('./dhl'); const shopify=require('./shopify'); const guardrails=require('./guardrails');

// Straße + Hausnummer trennen (DHL erwartet addressStreet + addressHouse getrennt)
function splitStreet(a1,a2){
  const s=(a1||'').trim();
  // Hausnummer am Ende (DE/AT): "Hauptstr. 5", "Bgm.-Hailer-Str. 10b"
  let m=s.match(/^(.*?\S)[\s,]+(\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)$/);
  if(m) return { street:m[1].trim(), house:m[2].replace(/\s+/g,'') };
  // Hausnummer am Anfang (FR/UK/IT/ES): "12 Rue de la Paix", "1165 rue Sully"
  m=s.match(/^(\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)[\s,]+(.+)$/);
  if(m) return { street:m[2].trim(), house:m[1].replace(/\s+/g,'') };
  // Fallback: Hausnummer in Zeile 2
  if(/^\d/.test((a2||'').trim())) return { street:s, house:(a2||'').trim() };
  return { street:s, house:'' };
}

async function processReturn({ order, ret, rfo }){
  const a=order.shippingAddress||{}; const country=a.countryCodeV2;
  const sp=splitStreet(a.address1,a.address2);
  const ctx={
    orderName:order.name, returnName:ret.name, orderCreatedAt:order.createdAt,
    country, receiverId:cfg.receiverIds[country],
    returnReasons:(ret.returnLineItems?.nodes||[]).map(n=>n.returnReason),
    shipper:{ name:[a.firstName,a.lastName].filter(Boolean).join(' '), street:sp.street, house:sp.house,
      zip:a.zip, city:a.city, email:order.email },
  };
  if(cfg.mode==='AUTO'){
    const g=guardrails.check(ctx);
    if(!g.ok){ console.log(`[SKIP] ${ctx.orderName} ${ctx.returnName}: ${g.reason} -> manuell`); return 'skip'; }
  }
  if(!ctx.receiverId){ console.log(`[SKIP] keine receiverId für ${country} (${ctx.orderName}) -> manuell`); return 'skip'; }
  if(!ctx.shipper.house){ console.log(`[SKIP] keine Hausnummer erkennbar (${ctx.orderName}) -> manuell`); return 'skip'; }

  if(cfg.dryRun){ console.log(`[DRY] ${ctx.orderName} ${ctx.returnName}: würde ${cfg.mode==='AUTO'?'genehmigen + ':''}Label erzeugen (${country}, receiverId=${ctx.receiverId}, ${ctx.shipper.street} ${ctx.shipper.house})`); return 'dry'; }

  if(cfg.mode==='AUTO' && ret.status==='REQUESTED') await shopify.approveReturn(ret.id);
  // Reverse-Fulfillment-Order entsteht erst mit der Genehmigung -> frisch laden (kurzer Retry)
  let rfoFresh = await shopify.getRfo(ret.id);
  if(!rfoFresh){ await new Promise(r=>setTimeout(r,2500)); rfoFresh = await shopify.getRfo(ret.id); }
  if(!rfoFresh) throw new Error('keine reverseFulfillmentOrder (auch nach Genehmigung)');
  if((rfoFresh.reverseDeliveries?.nodes||[]).length>0){ console.log(`[SKIP] ${ctx.orderName}: bereits Reverse-Delivery vorhanden`); await shopify.tagProcessed(order.id); return 'skip'; }
  if(cfg.customsCountries.includes(country)){
    ctx.customsItems = await shopify.getCustomsItems(ret.id);
  }
  const label=await dhl.createReturnOrder(ctx);
  const lineItems=(rfoFresh.lineItems?.nodes||[]).map(li=>({ reverseFulfillmentOrderLineItemId:li.id, quantity:li.totalQuantity }));
  const fileUrl=await shopify.uploadLabel(label.labelB64, `${ctx.returnName}.pdf`);
  await shopify.createReverseDelivery(rfoFresh.id, lineItems, { number:label.shipmentNo, url:label.trackingUrl }, fileUrl, true);
  await shopify.tagProcessed(order.id);
  console.log(`[OK ] ${ctx.orderName} ${ctx.returnName} -> shipmentNo ${label.shipmentNo}`);
  return 'ok';
}
module.exports={ processReturn };
