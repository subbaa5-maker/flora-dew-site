// netlify/functions/product-images.js
//
// Manages product photos, stored in Netlify Blobs (no separate file/CDN
// service needed). Up to MAX_IMAGES_PER_PRODUCT images per product, saved
// as compressed base64 data-URLs (resizing/compression happens client-side
// in admin.html before upload, so blobs stay small).
//
// Each image is stored as { src, variant }. `variant` is either "" (a
// general photo, shown for any size/weight that doesn't have its own
// photos) or a specific variant's label (e.g. "100 g") matching that
// product's variants[].l at the time it was tagged. index.html and
// product.html show a size's own tagged photos when it has any, and
// fall back to the general ones otherwise — so most products can just
// use general photos and only need variant-specific ones for sizes that
// genuinely look different (e.g. a gift box vs a single bar).
//
// Note: tagging is by label text, not a stable variant id (this catalog
// doesn't have one). Renaming a variant's label in Admin orphans any
// photos tagged to the old label — they simply won't show anywhere until
// re-tagged, since they don't match the new label and aren't general
// photos either. Deleting/renaming a variant is rare enough that this is
// an acceptable tradeoff for not needing a bigger data-model change.
//
// GET  /.netlify/functions/product-images
//      -> public, returns { "<productId>": [{ src, variant }, ...], ... }
//      Used by index.html / product.html to show real photos instead of
//      the placeholder icon. Legacy entries stored as plain strings
//      (from before per-variant tagging existed) are normalized to
//      { src: <string>, variant: "" } on the way out, so older data
//      keeps working with no migration needed.
//
// POST /.netlify/functions/product-images
//      body: { secret, productId, image: "data:image/...;base64,...", variant: "" }
//      -> admin-only, appends one image to a product (rejects past the
//         limit). `variant` is optional — omit or send "" for a general
//         photo.
//
// POST /.netlify/functions/product-images  (with action:"delete")
//      body: { secret, productId, action:"delete", index: 0 }
//      -> admin-only, removes one image by its position in the array
//
// POST /.netlify/functions/product-images  (with action:"retag")
//      body: { secret, productId, action:"retag", index: 0, variant: "100 g" }
//      -> admin-only, changes which variant an already-uploaded image is
//         tagged to, without re-uploading it
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { productImagesStore } = require('./lib/blobs');

const MAX_IMAGES_PER_PRODUCT = 35;
// Generous but bounded — a resized/compressed JPEG data-URL should be well
// under this. Guards against someone uploading a huge original by mistake.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_VARIANT_LABEL_LEN = 60;

// Accepts either the old plain-string shape or the new { src, variant }
// shape and always returns the latter.
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
  const store = productImagesStore();

  if (event.httpMethod === 'GET') {
    try {
      const { blobs } = await store.list();
      const result = {};
      await Promise.all(
        blobs.map(async (b) => {
          const val = await store.get(b.key, { type: 'json' });
          if (Array.isArray(val)) result[b.key] = normalizeImages(val);
        })
      );
      // Public GET, same response for every visitor — cache at the edge
      // so most page loads never re-hit Blobs. See site-images.js for
      // the same pattern and reasoning.
      return {
        statusCode: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
        body: JSON.stringify(result),
      };
    } catch (err) {
      console.error('product-images GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load product images' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, productId, image, action, index, variant } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      if (!productId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing productId' }) };
      }

      const existing = normalizeImages(await store.get(productId, { type: 'json' }));

      if (action === 'delete') {
        if (typeof index !== 'number' || index < 0 || index >= existing.length) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image index' }) };
        }
        existing.splice(index, 1);
        await store.setJSON(productId, existing);
        return { statusCode: 200, body: JSON.stringify({ success: true, images: existing }) };
      }

      if (action === 'retag') {
        if (typeof index !== 'number' || index < 0 || index >= existing.length) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image index' }) };
        }
        existing[index].variant = String(variant || '').trim().slice(0, MAX_VARIANT_LABEL_LEN);
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

      existing.push({ src: image, variant: String(variant || '').trim().slice(0, MAX_VARIANT_LABEL_LEN) });
      await store.setJSON(productId, existing);

      return { statusCode: 200, body: JSON.stringify({ success: true, images: existing }) };
    } catch (err) {
      console.error('product-images POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save image' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
