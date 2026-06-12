// DHL Unified Tracking statusCode -> Shopify FulfillmentEventStatus
// DHL statusCode: pre-transit | transit | delivered | failure | unknown
const RANK = {
  LABEL_PRINTED: 1, CONFIRMED: 1,
  IN_TRANSIT: 2, DELAYED: 2,
  OUT_FOR_DELIVERY: 3, ATTEMPTED_DELIVERY: 3,
  DELIVERED: 4, FAILURE: 4,
};

function mapDhlToShopify(shipment) {
  const code = (shipment?.status?.statusCode || 'unknown').toLowerCase();
  const text = `${shipment?.status?.status || ''} ${shipment?.status?.description || ''}`.toLowerCase();
  if (code === 'delivered') return 'DELIVERED';
  if (code === 'failure') return 'FAILURE';
  if (code === 'pre-transit') return 'LABEL_PRINTED';
  if (code === 'transit') {
    if (/(out for delivery|zustellung|in zustellung|wird heute|delivery vehicle)/.test(text)) return 'OUT_FOR_DELIVERY';
    if (/(attempt|nicht angetroffen|zustellversuch)/.test(text)) return 'ATTEMPTED_DELIVERY';
    if (/(delay|verzöger|delayed)/.test(text)) return 'DELAYED';
    return 'IN_TRANSIT';
  }
  return null; // unknown -> nichts schreiben
}
function rank(s) { return RANK[s] || 0; }
module.exports = { mapDhlToShopify, rank };
