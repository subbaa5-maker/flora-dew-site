// netlify/functions/list-orders.js
//
// Secret-protected: returns every saved order (pending + paid) as JSON,
// newest first. Used by admin.html.
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { ordersStore } = require('./lib/blobs');

exports.handler = async function (event) {
  const secret = (event.queryStringParameters || {}).secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const store = ordersStore();
    const { blobs } = await store.list();

    const orders = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));

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
