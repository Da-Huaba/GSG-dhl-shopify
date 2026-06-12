const fs = require('fs');
const BASE = process.env.DHL_BASE || 'https://api-sandbox.dhl.com';
const CLIENT_ID = process.env.DHL_CLIENT_ID;
const CLIENT_SECRET = process.env.DHL_CLIENT_SECRET;
const USER = process.env.DHL_USER || 'user-valid';
const PASS = process.env.DHL_PASSWORD || 'SandboxPasswort2023!';
const RECEIVER_ID = process.env.RECEIVER_ID || 'deu';
const LABEL_TYPE = process.env.LABEL_TYPE || 'SHIPMENT_LABEL';

if (!CLIENT_ID || !CLIENT_SECRET) { console.error('Bitte DHL_CLIENT_ID und DHL_CLIENT_SECRET setzen.'); process.exit(1); }

(async () => {
  console.log('→ Token holen …', BASE);
  const tokRes = await fetch(`${BASE}/parcel/de/account/auth/ropc/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type:'password', username:USER, password:PASS, client_id:CLIENT_ID, client_secret:CLIENT_SECRET }),
  });
  const tokTxt = await tokRes.text();
  if (!tokRes.ok) { console.error(`✗ Auth ${tokRes.status}:`, tokTxt); process.exit(1); }
  const token = JSON.parse(tokTxt).access_token;
  console.log(`✓ Token erhalten (Status ${tokRes.status})`);

  const locRes = await fetch(`${BASE}/parcel/de/shipping/returns/v1/locations`, {
    headers: { Authorization:`Bearer ${token}`, Accept:'application/json' } });
  console.log(`→ /locations Status ${locRes.status}`);

  const payload = {
    receiverId: RECEIVER_ID,
    shipper: { name1:'Max Mustermann', addressStreet:'Kurfürstendamm', addressHouse:'1', postalCode:'10719', city:'Berlin', email:'max.mustermann@mail.com' },
    customerReference: 'TEST-2588070',
    itemWeight: { uom:'kg', value:1.5 },
    itemValue: { currency:'EUR', value:99.99 },
  };
  console.log('→ POST /orders …', { receiverId:RECEIVER_ID, labelType:LABEL_TYPE });
  const ordRes = await fetch(`${BASE}/parcel/de/shipping/returns/v1/orders?labelType=${encodeURIComponent(LABEL_TYPE)}`, {
    method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
  const ordTxt = await ordRes.text();
  console.log(`\n=== /orders Status ${ordRes.status} ===`);
  let j; try { j = JSON.parse(ordTxt); } catch { console.log(ordTxt); process.exit(ordRes.ok?0:1); }
  const summarize = (o) => JSON.stringify(o, (k,v)=> (typeof v==='string'&&v.length>120)?`[${v.length} chars]`:v, 2);
  console.log(summarize(j));
  const b64 = j?.label?.b64 || j?.labelData || j?.shipmentLabel?.b64;
  if (b64) { fs.writeFileSync('test-label.pdf', Buffer.from(b64,'base64')); console.log('\n✓ Label gespeichert: test-label.pdf'); }
  console.log('\nshipmentNo:', j?.shipmentNo || '(Feldname prüfen)');
})().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
