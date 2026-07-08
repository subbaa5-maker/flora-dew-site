// netlify/functions/site-images.js
//
// Manages editable, site-wide storefront images — Hero, About Us
// (Mission), Why Natural, Reviews, and the Footer logo — stored in
// Netlify Blobs as base64 data-URLs. One image per named "slot" (unlike
// product-images.js, which stores an array per product).
//
// GET  /.netlify/functions/site-images
//      -> public, returns { "<slot>": "data:image/...;base64,...", ... }
//      Only slots that have an image set are included. Used by
//      index.html to show real photos in place of the built-in defaults.
//
// POST /.netlify/functions/site-images
//      body: { secret, slot, image: "data:image/...;base64,..." }
//      -> admin-only, sets/replaces the image for one slot
//
// POST /.netlify/functions/site-images  (with action:"delete")
//      body: { secret, slot, action:"delete" }
//      -> admin-only, removes the image for one slot (site reverts to
//         its default look for that section)
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { siteImagesStore } = require('./lib/blobs');

const VALID_SLOTS = ['hero', 'about', 'why', 'reviews', 'footerLogo'];
// Generous but bounded — a resized/compressed JPEG data-URL should be well
// under this. Guards against someone uploading a huge original by mistake.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

exports.handler = async function (event) {
  const store = siteImagesStore();

  if (event.httpMethod === 'GET') {
    try {
      const { blobs } = await store.list();
      const result = {};
      await Promise.all(
        blobs.map(async (b) => {
          const val = await store.get(b.key, { type: 'text' });
          if (val) result[b.key] = val;
        })
      );
      // Public GET, same response for every visitor — let Netlify's CDN
      // cache it at the edge so most page loads never re-hit Blobs at
      // all. Short max-age keeps admin edits showing up quickly;
      // stale-while-revalidate means visitors still get an instant
      // (possibly one-request-stale) response while it refreshes in the
      // background rather than ever blocking on a cache miss.
      return {
        statusCode: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
        body: JSON.stringify(result),
      };
    } catch (err) {
      console.error('site-images GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load site images' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, slot, image, action } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      if (!VALID_SLOTS.includes(slot)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid slot' }) };
      }

      if (action === 'delete') {
        await store.delete(slot);
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // Default action: set/replace the image for this slot
      if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image data' }) };
      }
      if (image.length > MAX_IMAGE_BYTES * 1.4) {
        // base64 is ~1.37x the raw byte size — rough guard before decoding
        return { statusCode: 400, body: JSON.stringify({ error: 'Image is too large. Please use a smaller photo.' }) };
      }

      await store.set(slot, image);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error('site-images POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save image' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
