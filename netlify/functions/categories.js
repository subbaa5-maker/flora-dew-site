// netlify/functions/categories.js
//
// Manages the list of catalogue "buckets" (categories) that products are
// grouped into — the tabs shown on the storefront (Soaps, Hair Oil, Lip
// Balms, Lip Colour, etc). Kept separate from products.js so the shop
// owner can add, rename, reorder, or remove whole catalogues from the
// admin dashboard without a code deploy.
//
// GET  /.netlify/functions/categories
//      -> public, returns the full ordered category array. The very
//         first time this runs it seeds the store with the original
//         launch categories below, so the site keeps working unmodified
//         until someone changes something in Admin.
//
// POST /.netlify/functions/categories
//      body: { secret, action:"upsert", category:{ id?, label } }
//      -> admin-only. If category.id matches an existing one, renames
//         it in place. Otherwise creates a new category at the end of
//         the list (id is slugified from the label, made unique if
//         needed).
//
// POST /.netlify/functions/categories  (with action:"delete")
//      body: { secret, action:"delete", id }
//      -> admin-only, removes a category by id — but only if no product
//         currently uses it (checked against the products store), and
//         only if it isn't the last remaining category. Both are
//         reported back as a clear error rather than silently failing.
//
// POST /.netlify/functions/categories  (with action:"reorder")
//      body: { secret, action:"reorder", order:[id, id, ...] }
//      -> admin-only, reorders the category list to match the given id
//         order (used for the up/down arrows in Admin). Any ids missing
//         from `order` keep their relative position at the end.
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { categoriesStore, productsStore } = require('./lib/blobs');

// The original launch categories — used only to seed the store the very
// first time this function runs. Keep in sync with what shipped in
// index.html's old hardcoded CATS array; after the first GET, the blob
// store (editable from Admin) is the real source of truth.
const DEFAULT_CATEGORIES = [
  { id: 'soap', label: 'Soaps' },
  { id: 'oil', label: 'Hair Oil' },
  { id: 'balm', label: 'Lip Balms' },
  { id: 'lipstick', label: 'Lip Colour' },
];

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 40);
}

exports.handler = async function (event) {
  const store = categoriesStore();

  if (event.httpMethod === 'GET') {
    try {
      let categories = await store.get('all', { type: 'json' });
      if (!Array.isArray(categories) || categories.length === 0) {
        categories = DEFAULT_CATEGORIES;
        await store.setJSON('all', categories);
      }
      // Public GET, same response for every visitor — cache at the edge.
      // See site-images.js for the same pattern and reasoning.
      return {
        statusCode: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
        body: JSON.stringify(categories),
      };
    } catch (err) {
      console.error('categories GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load categories' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, action, category, id, order } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      let categories = await store.get('all', { type: 'json' });
      if (!Array.isArray(categories) || categories.length === 0) categories = DEFAULT_CATEGORIES;

      if (action === 'delete') {
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
        if (categories.length <= 1) {
          return { statusCode: 400, body: JSON.stringify({ error: 'You need at least one catalogue — add another before removing this one.' }) };
        }

        let products = [];
        try {
          products = await productsStore().get('all', { type: 'json' });
        } catch (e) { /* ignore — treat as no products */ }
        const inUse = Array.isArray(products) ? products.filter((p) => p.cat === id).length : 0;
        if (inUse > 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: `${inUse} product${inUse === 1 ? ' uses' : 's use'} this catalogue. Move or delete ${inUse === 1 ? 'it' : 'them'} first, then remove the catalogue.`,
            }),
          };
        }

        const next = categories.filter((c) => c.id !== id);
        await store.setJSON('all', next);
        return { statusCode: 200, body: JSON.stringify({ success: true, categories: next }) };
      }

      if (action === 'reorder') {
        if (!Array.isArray(order)) return { statusCode: 400, body: JSON.stringify({ error: 'Missing order' }) };
        const byId = {};
        categories.forEach((c) => { byId[c.id] = c; });
        const ordered = order.filter((cid) => byId[cid]).map((cid) => byId[cid]);
        categories.forEach((c) => { if (!order.includes(c.id)) ordered.push(c); });
        await store.setJSON('all', ordered);
        return { statusCode: 200, body: JSON.stringify({ success: true, categories: ordered }) };
      }

      // Default action: create or rename ("upsert")
      if (!category || !category.label || !String(category.label).trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'A catalogue name is required' }) };
      }
      const label = String(category.label).trim();

      const isExisting = !!(category.id && categories.some((c) => c.id === category.id));
      if (isExisting) {
        const idx = categories.findIndex((c) => c.id === category.id);
        categories[idx] = { id: category.id, label };
        await store.setJSON('all', categories);
        return { statusCode: 200, body: JSON.stringify({ success: true, categories }) };
      }

      const base = slugify(category.id || label);
      if (!base) return { statusCode: 400, body: JSON.stringify({ error: 'Could not generate an id from that name' }) };
      let newId = base;
      let n = 2;
      while (categories.some((c) => c.id === newId)) {
        newId = base + '-' + n;
        n++;
      }
      categories.push({ id: newId, label });
      await store.setJSON('all', categories);
      return { statusCode: 200, body: JSON.stringify({ success: true, categories }) };
    } catch (err) {
      console.error('categories POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save catalogue' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
