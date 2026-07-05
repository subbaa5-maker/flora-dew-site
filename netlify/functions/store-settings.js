// netlify/functions/store-settings.js
//
// Lets the shop owner mark the store "closed" temporarily (holiday, stock
// count, travel, etc.) so new orders are paused. When closed:
//   - index.html shows a banner with the message/reopen date and disables
//     "Add to cart" + checkout
//   - create-order.js also refuses to create new orders server-side, so the
//     pause can't be bypassed by someone with the checkout form already open
//
// GET  /.netlify/functions/store-settings
//      -> public, returns { closed, message, reopenDate }
//
// POST /.netlify/functions/store-settings
//      body: { secret, closed, message, reopenDate }
//      -> admin-only, saves the settings
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { settingsStore } = require('./lib/blobs');

const SETTINGS_KEY = 'store';
const DEFAULT_SETTINGS = { closed: false, message: '', reopenDate: '' };

exports.handler = async function (event) {
  const store = settingsStore();

  if (event.httpMethod === 'GET') {
    try {
      const settings = (await store.get(SETTINGS_KEY, { type: 'json' })) || DEFAULT_SETTINGS;
      return { statusCode: 200, body: JSON.stringify(settings) };
    } catch (err) {
      console.error('store-settings GET error:', err);
      return { statusCode: 200, body: JSON.stringify(DEFAULT_SETTINGS) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, closed, message, reopenDate } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const settings = {
        closed: !!closed,
        message: (message || '').toString().slice(0, 300),
        reopenDate: (reopenDate || '').toString().slice(0, 40),
      };

      await store.setJSON(SETTINGS_KEY, settings);
      return { statusCode: 200, body: JSON.stringify({ success: true, settings }) };
    } catch (err) {
      console.error('store-settings POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save store settings' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
