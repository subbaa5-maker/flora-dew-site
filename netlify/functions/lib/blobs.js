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

// Stores the product catalog (name, category, description, price/size
// variants, icon) as one JSON array under the key "all".
function productsStore() {
  return namedStore('products');
}

// Stores the list of catalogue/category "buckets" products can belong to
// (id + display label, in display order) as one JSON array under the
// key "all".
function categoriesStore() {
  return namedStore('categories');
}

// Stores shop-wide settings (e.g. holiday / temporary closure).
function settingsStore() {
  return namedStore('settings');
}

// Stores one image data-URL per named site section ("slot"): hero, about,
// why, reviews, footerLogo. One image per slot (not an array), unlike
// productImagesStore.
function siteImagesStore() {
  return namedStore('site-images');
}

// Stores blog posts (title, slug, excerpt, content, cover image, status,
// dates) as one JSON array under the key "all" — same pattern as
// productsStore.
function blogStore() {
  return namedStore('blog');
}

// Stores one cover-image data-URL per blog post, keyed by post id — same
// "one image per key" pattern as siteImagesStore. Served as a real image
// URL by blog-image.js rather than embedded as base64 text, so it works
// reliably as an og:image for social share previews.
function blogImagesStore() {
  return namedStore('blog-images');
}

module.exports = { ordersStore, productImagesStore, productsStore, categoriesStore, settingsStore, siteImagesStore, blogStore, blogImagesStore };
