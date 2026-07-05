// netlify/functions/list-orders.js
//
// A minimal way to see your orders without building a full admin dashboard.
// Visit:  https://YOUR-SITE.netlify.app/.netlify/functions/list-orders?secret=YOUR_ADMIN_SECRET
// It returns every saved order (pending + paid) as JSON, newest first.
//
// Required Netlify environment variable:
//   ADMIN_SECRET   — pick any long random string yourself; treat it like a password.
//
// Optional (fixes MissingBlobsEnvironmentError on some accounts — see SETUP.md):
//   BLOBS_SITE_ID
//   BLOBS_TOKEN

const { getStore } = require('@netlify/blobs');

// Netlify's automatic Blobs configuration doesn't always kick in reliably.
// If BLOBS_SITE_ID + BLOBS_TOKEN are set, use them explicitly; otherwise
// fall back to auto-detection.
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
  const secret = (event.queryStringParameters || {}).secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const ordersStoreInstance = ordersStore();
    const { blobs } = await ordersStoreInstance.list();

    const orders = await Promise.all(
      blobs.map((b) => ordersStoreInstance.get(b.key, { type: 'json' }))
    );

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orders, null, 2),
    };
  } catch (err) {
    console.error('list-orders error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not list orders' }) };
  }
};
