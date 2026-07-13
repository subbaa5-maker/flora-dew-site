// netlify/functions/blog-image.js
//
// Manages one cover image per blog post — stored in Netlify Blobs and
// served as a real image response (not embedded as base64/JSON), same
// approach as product-image.js. This matters specifically for blog
// covers because they're also used as the og:image for social share
// previews (see post.html) — a real, permanent URL on your own domain
// works reliably there, unlike hotlinking an external host like Google
// Drive, which frequently blocks the exact kind of bot traffic that
// social platforms use to fetch link previews.
//
// GET /.netlify/functions/blog-image?postId=<id>
//   -> raw image bytes, real Content-Type, long-lived cache headers.
//      This URL is what gets saved as the post's coverImage.
//
// POST /.netlify/functions/blog-image
//   body: { secret, postId, image: "data:image/...;base64,..." }
//   -> admin-only, stores/replaces this post's cover image. Returns the
//      public URL to save as the post's coverImage field.
//
// POST /.netlify/functions/blog-image  (action:"delete")
//   body: { secret, postId, action:"delete" }
//   -> admin-only, removes this post's cover image.
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { blogImagesStore } = require('./lib/blobs');

// Generous but bounded, same reasoning as product-images.js — a
// resized/compressed JPEG from the admin's crop tool should be well
// under this.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

exports.handler = async function (event) {
  const store = blogImagesStore();

  if (event.httpMethod === 'GET') {
    const postId = (event.queryStringParameters || {}).postId;
    if (!postId) return { statusCode: 400, body: 'Missing postId' };

    try {
      const src = await store.get(postId, { type: 'text' });
      if (!src) return { statusCode: 404, body: 'Not found' };

      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(src);
      if (!match) return { statusCode: 500, body: 'Malformed image data' };

      return {
        statusCode: 200,
        headers: {
          'Content-Type': match[1],
          // Moderate, not "immutable" — a cover replaced in Admin should
          // show up within a day rather than needing a manual cache-bust.
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
        body: match[2],
        isBase64Encoded: true,
      };
    } catch (err) {
      console.error('blog-image GET error:', err);
      return { statusCode: 500, body: 'Could not load image' };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, postId, image, action } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      if (!postId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Save the post first, then add a cover image.' }) };
      }

      if (action === 'delete') {
        await store.delete(postId);
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image data' }) };
      }
      if (image.length > MAX_IMAGE_BYTES * 1.4) {
        // base64 is ~1.37x the raw byte size — rough guard before decoding
        return { statusCode: 400, body: JSON.stringify({ error: 'Image is too large. Please use a smaller photo.' }) };
      }

      await store.set(postId, image);

      // Absolute URL — og:image and other social-preview tags require a
      // full URL, not a relative one.
      const url = 'https://www.floradew.in/.netlify/functions/blog-image?postId=' + encodeURIComponent(postId);
      return { statusCode: 200, body: JSON.stringify({ success: true, url: url }) };
    } catch (err) {
      console.error('blog-image POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save image' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
