// netlify/functions/list-orders.js
//
// A minimal way to see your orders without building a full admin dashboard.
// Visit:  https://YOUR-SITE.netlify.app/.netlify/functions/list-orders?secret=YOUR_ADMIN_SECRET
// It returns every saved order (pending + paid) as JSON, newest first.
//
// Required Netlify environment variable:
//   ADMIN_SECRET   — pick any long random string yourself; treat it like a password.

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const secret = (event.queryStringParameters || {}).secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const ordersStore = getStore('orders');
    const { blobs } = await ordersStore.list();

    const orders = await Promise.all(
      blobs.map((b) => ordersStore.get(b.key, { type: 'json' }))
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
