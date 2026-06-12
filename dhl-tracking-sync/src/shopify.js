const cfg = require('./config');

async function gql(query, variables) {
  const res = await fetch(`https://${cfg.shop}/admin/api/${cfg.apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': cfg.adminToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error('Shopify GraphQL: ' + JSON.stringify(json.errors));
  return json.data;
}

// Offene, versandte Bestellungen der letzten N Tage mit Fulfillments laden
async function* iterateOpenFulfillments(lookbackDays) {
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
  const q = `created_at:>=${since} fulfillment_status:shipped`;
  let cursor = null;
  do {
    const data = await gql(`
      query($q:String!,$c:String){ orders(first:50, query:$q, after:$c, sortKey:CREATED_AT){
        pageInfo{ hasNextPage endCursor }
        nodes{ name
          fulfillments(first:5){ id displayStatus
            trackingInfo{ number company }
            events(first:20){ nodes{ status } }
          }
        }
      } }`, { q, c: cursor });
    for (const o of data.orders.nodes) {
      for (const f of (o.fulfillments || [])) yield { order: o.name, f };
    }
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (cursor);
}

async function createEvent(fulfillmentId, status, message) {
  const data = await gql(`
    mutation($in:FulfillmentEventInput!){ fulfillmentEventCreate(fulfillmentEvent:$in){
      fulfillmentEvent{ id status } userErrors{ field message } } }`,
    { in: { fulfillmentId, status, message, happenedAt: new Date().toISOString() } });
  const ue = data.fulfillmentEventCreate.userErrors;
  if (ue && ue.length) throw new Error('fulfillmentEventCreate: ' + JSON.stringify(ue));
  return data.fulfillmentEventCreate.fulfillmentEvent;
}
module.exports = { iterateOpenFulfillments, createEvent };
