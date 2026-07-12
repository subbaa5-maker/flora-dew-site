// netlify/functions/product-image.js
//
// Serves ONE product photo as a real image response — not JSON, not
// base64 text — so the browser handles it the normal fast way: cached
// independently, loaded in parallel with other photos, and lazy-loaded
// with a plain `loading="lazy"` <img> attribute. This is what actually
// makes photos load instantly, compared to the old approach of bundling
// every photo as base64 text inside one big JSON response (which was
// slower to transfer, blocked on JS/JSON parsing before anything could
// render, and is also what was hitting Netlify's 6MB response-size
// limit and failing outright once a product/catalog had enough photos).
//
// GET /.netlify/functions/product-image?productId=<id>&index=<n>
//   -> raw image bytes, real Content-Type, long-lived cache headers.
//
// `index` is the photo's position in that product's stored array (the
// same array product-images.js manages). It's stable as long as photos
// aren't deleted/reordered; deleting an earlier photo shifts later
// indices, which can briefly serve a stale cached image at an old URL
// for still-cached clients — an acceptable tradeoff for how rarely
// photos are deleted, versus a much bigger data-model change to give
// every photo a permanent id.

const { productImagesStore } = require('./lib/blobs');

function normalizeImage(entry) {
  if (typeof entry === 'string') return { src: entry, variant: '' };
  if (entry && typeof entry === 'object' && typeof entry.src === 'string') {
    return { src: entry.src, variant: typeof entry.variant === 'string' ? entry.variant : '' };
  }
  return null;
}
function normalizeImages(arr) {
  return (Array.isArray(arr) ? arr : []).map(normalizeImage).filter(Boolean);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const params = event.queryStringParameters || {};
  const productId = params.productId;
  const index = parseInt(params.index, 10);

  if (!productId || !Number.isInteger(index) || index < 0) {
    return { statusCode: 400, body: 'Missing or invalid productId/index' };
  }

  try {
    const store = productImagesStore();
    const images = normalizeImages(await store.get(productId, { type: 'json' }));
    const entry = images[index];
    if (!entry || !entry.src) {
      return { statusCode: 404, body: 'Not found' };
    }

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(entry.src);
    if (!match) {
      return { statusCode: 500, body: 'Malformed image data' };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': match[1],
        // Moderate, not "immutable" — photos rarely change once uploaded,
        // but a retag/delete/replace should still show up within a day
        // rather than needing a manual cache-bust.
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
      body: match[2],
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('product-image error:', err);
    return { statusCode: 500, body: 'Could not load image' };
  }
};
