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
// Required Netlify environment variables (Site configuration > Environment variables):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET
//
// Netlify Blobs requires no setup — it works automatically for any site
// deployed on Netlify.

const Razorpay = require('razorpay');
const { getStore } = require('@netlify/blobs');

// Netlify's automatic Blobs configuration doesn't always kick in reliably.
// If BLOBS_SITE_ID + BLOBS_TOKEN are set (see SETUP.md), use them explicitly;
// otherwise fall back to auto-detection.
function ordersStore() {
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    return getStore({
      name: 'orders',
      siteID: process.env.BLOBS_SITE_ID,
      token: process.env.BLOBS_TOKEN,
    });
  }
  return getStore('orders');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { amount, currency, customer, items } = JSON.parse(event.body || '{}');

    if (!amount || amount <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid amount' }),
      };
    }
    if (!customer || !customer.name || !customer.phone || !customer.email || !customer.address) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing customer details' }),
      };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Cart is empty' }),
      };
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
    const ordersStoreInstance = ordersStore();
    await ordersStoreInstance.setJSON(order.id, {
      orderId: order.id,
      status: 'pending',
      amount: amount,
      currency: currency || 'INR',
      customer: customer,
      items: items,
      createdAt: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify(order),
    };
  } catch (err) {
    console.error('create-order error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not create order' }),
    };
  }
};
