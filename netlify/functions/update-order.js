// netlify/functions/update-order.js
//
// Admin-only: updates an order's fulfillment status (accepted / shipped /
// delivered) and, for shipped orders, the courier name + AWB/tracking
// number. Used by admin.html. When an order transitions to "shipped" with
// a courier + AWB present, automatically emails the customer their
// tracking details.
//
// Required Netlify environment variable:
//   ADMIN_SECRET
// Optional (for email):
//   RESEND_API_KEY, STORE_FROM_EMAIL

const { ordersStore } = require('./lib/blobs');
const { sendEmail } = require('./lib/email');

const VALID_STATUSES = ['pending', 'accepted', 'shipped', 'delivered'];

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { secret, orderId, fulfillmentStatus, courier, awb } = JSON.parse(event.body || '{}');

    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    if (!orderId || !VALID_STATUSES.includes(fulfillmentStatus)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
    }

    const store = ordersStore();
    const order = await store.get(orderId, { type: 'json' });
    if (!order) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
    }

    const wasShipped = order.fulfillmentStatus === 'shipped';
    order.fulfillmentStatus = fulfillmentStatus;
    order.courier = courier || order.courier || null;
    order.awb = awb || order.awb || null;

    if (fulfillmentStatus === 'shipped' && !order.shippedAt) {
      order.shippedAt = new Date().toISOString();
    }
    if (fulfillmentStatus === 'delivered' && !order.deliveredAt) {
      order.deliveredAt = new Date().toISOString();
    }

    await store.setJSON(orderId, order);

    // Email the customer only the first time an order becomes "shipped"
    // with courier details present — avoids repeat emails on every edit.
    if (fulfillmentStatus === 'shipped' && !wasShipped && order.courier && order.awb) {
      await sendEmail({
        to: order.customer.email,
        subject: 'Your Flora Dew order has shipped!',
        html: `
          <div style="font-family:sans-serif;color:#243623;">
            <h2>Good news, ${order.customer.name}!</h2>
            <p>Your order is on its way.</p>
            <p><strong>Courier:</strong> ${order.courier}<br>
               <strong>Tracking / AWB number:</strong> ${order.awb}</p>
            <p>Order ID: ${order.orderId}</p>
            <p>You can also check status anytime at
               <a href="https://floradew.in/track.html">floradew.in/track.html</a>.</p>
            <p>Thank you for choosing Flora Dew!</p>
          </div>
        `,
      });
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, order: order }) };
  } catch (err) {
    console.error('update-order error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not update order' }) };
  }
};
