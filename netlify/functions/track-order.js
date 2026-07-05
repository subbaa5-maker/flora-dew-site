// netlify/functions/track-order.js
//
// Public endpoint for customers to check their own order status — no
// admin secret needed. To prevent anyone from browsing other customers'
// orders, the caller must provide the exact Order ID *and* the email
// address used at checkout; both must match before any data is returned.
// Only a safe subset of the order is returned (no admin secret, no
// internal fields).

const { ordersStore } = require('./lib/blobs');

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const orderId = (params.orderId || '').trim();
  const email = (params.email || '').trim().toLowerCase();

  if (!orderId || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Order ID and email are required' }) };
  }

  try {
    const store = ordersStore();
    const order = await store.get(orderId, { type: 'json' });

    if (!order || !order.customer || (order.customer.email || '').toLowerCase() !== email) {
      // Same message whether the order doesn't exist or the email doesn't
      // match — avoids revealing which order IDs are valid.
      return { statusCode: 404, body: JSON.stringify({ error: 'No matching order found' }) };
    }

    const total = order.items.reduce((sum, it) => sum + it.price * it.qty, 0);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.orderId,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus || 'pending',
        courier: order.courier || null,
        awb: order.awb || null,
        items: order.items,
        total: total,
        createdAt: order.createdAt,
        paidAt: order.paidAt || null,
        shippedAt: order.shippedAt || null,
        deliveredAt: order.deliveredAt || null,
        cancelledAt: order.cancelledAt || null,
        customerName: order.customer.name,
      }),
    };
  } catch (err) {
    console.error('track-order error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not check order status' }) };
  }
};
