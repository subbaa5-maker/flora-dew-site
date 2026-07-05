// netlify/functions/product-images.js
//
// Manages product photos, stored in Netlify Blobs (no separate file/CDN
// service needed). Up to MAX_IMAGES_PER_PRODUCT images per product, saved
// as compressed base64 data-URLs (resizing/compression happens client-side
// in admin.html before upload, so blobs stay small).
//
// GET  /.netlify/functions/product-images
//      -> public, returns { "<productId>": ["data:image/jpeg;base64,...", ...], ... }
//      Used by index.html to show real photos instead of the placeholder icon.
//
// POST /.netlify/functions/product-images
//      body: { secret, productId, image: "data:image/...;base64,..." }
//      -> admin-only, appends one image to a product (rejects past the limit)
//
// POST /.netlify/functions/product-images  (with action:"delete")
//      body: { secret, productId, action:"delete", index: 0 }
//      -> admin-only, removes one image by its position in the array
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { productImagesStore } = require('./lib/blobs');

const MAX_IMAGES_PER_PRODUCT = 8;
// Generous but bounded — a resized/compressed JPEG data-URL should be well
// under this. Guards against someone uploading a huge original by mistake.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

exports.handler = async function (event) {
  const store = productImagesStore();

  if (event.httpMethod === 'GET') {
    try {
      const { blobs } = await store.list();
      const result = {};
      await Promise.all(
        blobs.map(async (b) => {
          const val = await store.get(b.key, { type: 'json' });
          if (Array.isArray(val)) result[b.key] = val;
        })
      );
      return { statusCode: 200, body: JSON.stringify(result) };
    } catch (err) {
      console.error('product-images GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load product images' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, productId, image, action, index } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      if (!productId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing productId' }) };
      }

      const existing = (await store.get(productId, { type: 'json' })) || [];

      if (action === 'delete') {
        if (typeof index !== 'number' || index < 0 || index >= existing.length) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image index' }) };
        }
        existing.splice(index, 1);
        await store.setJSON(productId, existing);
        return { statusCode: 200, body: JSON.stringify({ success: true, images: existing }) };
      }

      // Default action: add an image
      if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image data' }) };
      }
      if (image.length > MAX_IMAGE_BYTES * 1.4) {
        // base64 is ~1.37x the raw byte size — rough guard before decoding
        return { statusCode: 400, body: JSON.stringify({ error: 'Image is too large. Please use a smaller photo.' }) };
      }
      if (existing.length >= MAX_IMAGES_PER_PRODUCT) {
        return { statusCode: 400, body: JSON.stringify({ error: 'This product already has the maximum of ' + MAX_IMAGES_PER_PRODUCT + ' images. Delete one first.' }) };
      }

      existing.push(image);
      await store.setJSON(productId, existing);

      return { statusCode: 200, body: JSON.stringify({ success: true, images: existing }) };
    } catch (err) {
      console.error('product-images POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save image' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
