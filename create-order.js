// netlify/functions/create-order.js
//
// Creates a Razorpay order using your SECRET key. This key never touches
// the browser — it only lives here, as a Netlify environment variable.
//
// It also saves a "pending" order record (customer details + cart items)
// to Netlify Blobs, keyed by the Razorpay order id, so that verify-payment.js
// can look it up once payment succeeds and send confirmation emails /
// keep a permanent record — without ever trusting data sent back from
// the browser at that later step.
//
// Required Netlify environment variables (Project configuration > Environment variables):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET

const Razorpay = require('razorpay');
const { ordersStore, settingsStore, productsStore } = require('./lib/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Refuse new orders while the shop owner has marked the store closed
    // (holiday / temporary break). Checked server-side so it can't be
    // bypassed by someone who already had the checkout form open.
    const settings = await settingsStore().get('store', { type: 'json' });
    if (settings && settings.closed) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: settings.message || 'We are currently not accepting new orders. Please check back soon.',
          storeClosed: true,
        }),
      };
    }

    const { amount, currency, customer, items } = JSON.parse(event.body || '{}');

    if (!amount || amount <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid amount' }) };
    }
    if (!customer || !customer.name || !customer.phone || !customer.email || !customer.address) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing customer details' }) };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty' }) };
    }

    // Re-check stock server-side against the live catalog — the "Add to
    // cart"/"Buy" buttons are already disabled for out-of-stock items,
    // but this stops someone from placing an order anyway by calling the
    // API directly (e.g. a stale page left open, or a cart added before
    // the item went out of stock).
    try {
      const products = (await productsStore().get('all', { type: 'json' })) || [];
      const byId = {};
      products.forEach((p) => { byId[p.id] = p; });
      const outOfStockItem = items.find((it) => it.id && byId[it.id] && byId[it.id].inStock === false);
      if (outOfStockItem) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: `"${outOfStockItem.name}" just went out of stock — please remove it from your cart to continue.`, outOfStock: true }),
        };
      }
    } catch (err) {
      console.error('create-order: stock check failed, continuing without it', err);
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(amount), // amount in paise, e.g. ₹100 = 10000
      currency: currency || 'INR',
      receipt: 'flora_dew_' + Date.now(),
    });

    // Save the pending order so verify-payment.js has a trusted source of
    // truth for what was actually ordered and by whom.
    const store = ordersStore();
    await store.setJSON(order.id, {
      orderId: order.id,
      status: 'pending', // payment status: pending -> paid
      fulfillmentStatus: 'pending', // pending -> accepted -> shipped -> delivered
      courier: null,
      awb: null,
      amount: amount,
      currency: currency || 'INR',
      customer: customer,
      items: items,
      createdAt: new Date().toISOString(),
    });

    return { statusCode: 200, body: JSON.stringify(order) };
  } catch (err) {
    console.error('create-order error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not create order' }) };
  }
};
