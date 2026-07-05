// netlify/functions/lib/blobs.js
//
// Shared helper for getting the "orders" Netlify Blobs store.
// Netlify's automatic Blobs configuration doesn't always kick in reliably;
// if BLOBS_SITE_ID + BLOBS_TOKEN are set (see SETUP.md), we use them
// explicitly, otherwise we fall back to auto-detection.

const { getStore } = require('@netlify/blobs');

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

module.exports = { ordersStore };
