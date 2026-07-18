// netlify/functions/testimonial-image.js
//
// Serves one testimonial's photo as a real image response (not embedded
// base64/JSON) — same approach as blog-image.js and product-image.js.
// Writing happens inside testimonials.js itself (as part of the public
// "submit" action), so this file only needs a GET handler.
//
// GET /.netlify/functions/testimonial-image?id=<testimonialId>
//   -> raw image bytes, real Content-Type, cache headers.

const { testimonialImagesStore } = require('./lib/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const id = (event.queryStringParameters || {}).id;
  if (!id) return { statusCode: 400, body: 'Missing id' };

  try {
    const src = await testimonialImagesStore().get(id, { type: 'text' });
    if (!src) return { statusCode: 404, body: 'Not found' };

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(src);
    if (!match) return { statusCode: 500, body: 'Malformed image data' };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': match[1],
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
      body: match[2],
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('testimonial-image GET error:', err);
    return { statusCode: 500, body: 'Could not load image' };
  }
};
