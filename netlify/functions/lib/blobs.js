// netlify/functions/lib/blobs.js
//
// Shared helper for getting Netlify Blobs stores used across functions.
// Netlify's automatic Blobs configuration doesn't always kick in reliably;
// if BLOBS_SITE_ID + BLOBS_TOKEN are set (see SETUP.md), we use them
// explicitly, otherwise we fall back to auto-detection.

const { getStore } = require('@netlify/blobs');

function namedStore(name) {
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    return getStore({
      name: name,
      siteID: process.env.BLOBS_SITE_ID,
      token: process.env.BLOBS_TOKEN,
    });
  }
  return getStore(name);
}

function ordersStore() {
  return namedStore('orders');
}

// Stores one JSON array of image data-URLs per product, keyed by product id.
function productImagesStore() {
  return namedStore('product-images');
}

// Stores shop-wide settings (e.g. holiday / temporary closure).
function settingsStore() {
  return namedStore('settings');
}

module.exports = { ordersStore, productImagesStore, settingsStore };
