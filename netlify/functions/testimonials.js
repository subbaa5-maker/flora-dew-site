// netlify/functions/testimonials.js
//
// Customer-submitted testimonials (with an optional photo), moderated
// from Admin before they appear on the storefront. Same storage pattern
// as blog.js — one JSON array in Blobs under the key "all" — except the
// "submit" action is deliberately public (no secret), since that's what
// lets a customer post a review in the first place.
//
// GET  /.netlify/functions/testimonials
//      -> public, returns every APPROVED testimonial (newest-approved
//         first): { id, name, rating, quote, photo (url|null), productId
//         (string|null), createdAt }. `productId` links a review to one
//         product (matches products.js's id) so product.html can compute
//         a per-product AggregateRating; null/omitted means it's a
//         general review not about one specific product.
//
// GET  /.netlify/functions/testimonials?admin=1&secret=...
//      -> admin-only, returns EVERY testimonial (pending first, then
//         approved, then rejected) for the Admin moderation queue.
//
// POST /.netlify/functions/testimonials
//      body: { action:"submit", name, rating, quote, photo?, productId?, website? }
//      -> PUBLIC. Creates a new testimonial with status "pending" — it
//         will not appear on the storefront until approved in Admin.
//         `website` is an anti-spam honeypot field: real visitors never
//         see or fill it, so any non-empty value is treated as a bot and
//         silently accepted-but-discarded (returns success either way,
//         so a bot can't learn its submission was rejected).
//
// POST /.netlify/functions/testimonials
//      body: { secret, action:"moderate", id, status:"approved"|"rejected",
//              name?, rating?, quote?, productId? }
//      -> admin-only. Sets the moderation status, optionally applying
//         light edits (e.g. fixing a typo, or correcting/adding which
//         product this review is about) at the same time. Pass
//         productId:"" to clear it back to "general review".
//
// POST /.netlify/functions/testimonials  (action:"delete")
//      body: { secret, action:"delete", id }
//      -> admin-only, permanently removes a testimonial and its photo.
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { testimonialsStore, testimonialImagesStore } = require('./lib/blobs');

// Generous but bounded — a resized/compressed JPEG from the submission
// form's client-side resize step should be well under this. Rejecting
// oversized payloads here protects the Blobs store from abuse via a
// direct API call that skips the browser-side resize.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

function summaryOf(t) {
  const { id, name, rating, quote, createdAt } = t;
  return {
    id,
    name,
    rating,
    quote,
    photo: t.hasPhoto ? 'https://www.floradew.in/.netlify/functions/testimonial-image?id=' + encodeURIComponent(id) : null,
    productId: t.productId || null,
    createdAt,
  };
}

function clean(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max);
}

exports.handler = async function (event) {
  const store = testimonialsStore();
  const params = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    try {
      let all = await store.get('all', { type: 'json' });
      if (!Array.isArray(all)) all = [];

      const isAdmin = params.admin === '1' && process.env.ADMIN_SECRET && params.secret === process.env.ADMIN_SECRET;

      if (isAdmin) {
        const order = { pending: 0, approved: 1, rejected: 2 };
        const sorted = [...all].sort((a, b) => {
          const byStatus = (order[a.status] ?? 1) - (order[b.status] ?? 1);
          if (byStatus !== 0) return byStatus;
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
        return { statusCode: 200, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(sorted.map((t) => ({ ...summaryOf(t), status: t.status }))) };
      }

      const approved = all
        .filter((t) => t.status === 'approved')
        .sort((a, b) => new Date(b.moderatedAt || b.createdAt || 0) - new Date(a.moderatedAt || a.createdAt || 0))
        .map(summaryOf);

      return {
        statusCode: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
        body: JSON.stringify(approved),
      };
    } catch (err) {
      console.error('testimonials GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load testimonials' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      // ---------------------------------------------------------------
      // Public: submit a new testimonial. No secret required by design.
      // ---------------------------------------------------------------
      if (action === 'submit') {
        // Honeypot: a hidden field real visitors never fill in. Bots that
        // auto-fill every field on a form will fill this one too. We
        // pretend to succeed either way, so a bot can't tell it failed.
        if (body.website) {
          return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        const name = clean(body.name, 60);
        const quote = clean(body.quote, 600);
        const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 0));

        if (!name) return { statusCode: 400, body: JSON.stringify({ error: 'Please enter your name.' }) };
        if (quote.length < 10) return { statusCode: 400, body: JSON.stringify({ error: 'Please write a few words about your experience.' }) };
        if (!rating) return { statusCode: 400, body: JSON.stringify({ error: 'Please choose a star rating.' }) };

        let hasPhoto = false;
        const photo = body.photo;
        if (photo) {
          if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid photo data.' }) };
          }
          if (photo.length > MAX_IMAGE_BYTES * 1.4) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Photo is too large. Please use a smaller image.' }) };
          }
          hasPhoto = true;
        }

        // Optional — which product this review is about, so it can later
        // feed that product's AggregateRating schema. Not validated
        // against the live catalog: a since-renamed/deleted product id
        // just means the review quietly stops matching anything rather
        // than failing to submit.
        const productId = clean(body.productId, 80) || null;

        let all = await store.get('all', { type: 'json' });
        if (!Array.isArray(all)) all = [];

        const now = new Date().toISOString();
        const id = 'tst_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

        if (hasPhoto) {
          await testimonialImagesStore().set(id, photo);
        }

        all.push({ id, name, rating, quote, hasPhoto, productId, status: 'pending', createdAt: now });
        await store.setJSON('all', all);

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // ---------------------------------------------------------------
      // Everything below is admin-only.
      // ---------------------------------------------------------------
      if (!process.env.ADMIN_SECRET || body.secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      let all = await store.get('all', { type: 'json' });
      if (!Array.isArray(all)) all = [];

      if (action === 'delete') {
        if (!body.id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
        const target = all.find((t) => t.id === body.id);
        const next = all.filter((t) => t.id !== body.id);
        await store.setJSON('all', next);
        if (target && target.hasPhoto) {
          await testimonialImagesStore().delete(body.id).catch(() => {});
        }
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      if (action === 'moderate') {
        if (!body.id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
        if (!['approved', 'rejected', 'pending'].includes(body.status)) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid status' }) };
        }
        const idx = all.findIndex((t) => t.id === body.id);
        if (idx === -1) return { statusCode: 404, body: JSON.stringify({ error: 'Testimonial not found' }) };

        const now = new Date().toISOString();
        const existing = all[idx];
        all[idx] = {
          ...existing,
          name: body.name !== undefined ? clean(body.name, 60) || existing.name : existing.name,
          quote: body.quote !== undefined ? clean(body.quote, 600) || existing.quote : existing.quote,
          rating: body.rating !== undefined ? Math.min(5, Math.max(1, parseInt(body.rating, 10) || existing.rating)) : existing.rating,
          productId: body.productId !== undefined ? (clean(body.productId, 80) || null) : existing.productId,
          status: body.status,
          moderatedAt: now,
        };
        await store.setJSON('all', all);
        return { statusCode: 200, body: JSON.stringify({ success: true, testimonial: all[idx] }) };
      }

      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
    } catch (err) {
      console.error('testimonials POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save testimonial' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
