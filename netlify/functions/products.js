// netlify/functions/products.js
//
// Manages the product catalog (name, category, tag, description, key
// ingredients, icon, and size/weight + price variants) so the shop owner
// can add, edit, or remove products from the admin dashboard without a
// code deploy. Product photos are stored separately (see
// product-images.js) — this function only stores each product's text
// and pricing data, kept together as one JSON array under the key "all".
//
// GET  /.netlify/functions/products
//      -> public, returns the full product array. The very first time
//         this runs (before any admin edits exist) it seeds the store
//         with the original launch catalog below, so the site keeps
//         working unmodified until someone changes something in Admin.
//
// POST /.netlify/functions/products
//      body: { secret, action:"upsert", product }
//      -> admin-only. If product.id is missing or new, creates a new
//         product (id is slugified from the name, made unique if
//         needed). If product.id matches an existing product, replaces
//         it in place.
//
// POST /.netlify/functions/products  (with action:"delete")
//      body: { secret, action:"delete", id }
//      -> admin-only, removes a product by id. Its photos in
//         product-images are left as-is (harmless if unused, and reused
//         automatically if a new product is later given the same id).
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { productsStore, categoriesStore } = require('./lib/blobs');

// Fallback only — used if the categories store hasn't been seeded yet.
// The real, admin-editable list of valid categories lives in
// categories.js; see loadValidCategoryIds() below.
const DEFAULT_CATEGORY_IDS = ['soap', 'oil', 'balm', 'lipstick'];
const VALID_ICONS = ['soap', 'soapDeco', 'oil', 'balm', 'lipstick'];

async function loadValidCategoryIds() {
  try {
    const categories = await categoriesStore().get('all', { type: 'json' });
    if (Array.isArray(categories) && categories.length) {
      return categories.map((c) => c.id);
    }
  } catch (err) {
    console.error('products: could not load categories, falling back to defaults', err);
  }
  return DEFAULT_CATEGORY_IDS;
}

// The original launch catalog — used only to seed the store the very
// first time this function runs. Keep this in sync with what shipped in
// index.html's old hardcoded PRODUCTS array; after the first GET, the
// blob store (editable from Admin) is the real source of truth.
const DEFAULT_PRODUCTS = [
  { id: 'aloe-vera-soap', cat: 'soap', name: 'Aloe Vera Handmade Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Pure aloe vera and herbal essential oils, handmade in small batches for soft, glowing skin. Gentle enough for dry, sensitive and acne-prone skin.',
    ing: ['Aloe Vera', 'Herbal Extracts'],
    variants: [{ l: '100 g', p: 99, m: 179 }, { l: '70–80 g Prism', p: 99, m: 219 }, { l: 'Combo of 2 (200 g)', p: 179, m: 358 }, { l: 'Combo of 3 (100 g)', p: 249, m: 537 }] },
  { id: 'charcoal-soap', cat: 'soap', name: 'Charcoal Handmade Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Activated charcoal draws out dirt, excess oil and impurities, leaving skin clean and rejuvenated. Suited to oily and acne-prone skin.',
    ing: ['Activated Charcoal'],
    variants: [{ l: '100 g', p: 99, m: 179 }, { l: 'Combo of 2', p: 179, m: 358 }, { l: 'Combo of 3', p: 249, m: 537 }] },
  { id: 'charcoal-multani-mitti-soap', cat: 'soap', name: 'Charcoal & Multani Mitti Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Cold-processed with Multani mitti to deep-cleanse pores, exfoliate gently and absorb excess oil for a clearer, healthier complexion.',
    ing: ['Charcoal', 'Multani Mitti'],
    variants: [{ l: '100 g', p: 139, m: 219 }] },
  { id: 'neem-soap', cat: 'soap', name: 'Neem Handmade Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Pure neem extracts with antibacterial and antifungal properties help fight pimples and acne for clearer skin.',
    ing: ['Neem', 'Herbal Extracts'],
    variants: [{ l: '100 g', p: 99, m: 179 }, { l: 'Sunburst 100 g', p: 99, m: 219 }, { l: 'Combo of 2', p: 179, m: 358 }, { l: 'Combo of 3', p: 249, m: 537 }] },
  { id: 'sandalwood-soap', cat: 'soap', name: 'Sandalwood Handmade Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Pure sandalwood extracts soothe skin, reduce blemishes and improve complexion, with a long-lasting natural fragrance.',
    ing: ['Sandalwood'],
    variants: [{ l: '100 g', p: 99, m: 179 }, { l: 'Sunflower 100 g', p: 130, m: 219 }, { l: 'Combo of 2', p: 179, m: 358 }, { l: 'Combo of 3', p: 249, m: 537 }] },
  { id: 'hibiscus-aloe-vera-soap', cat: 'soap', name: 'Hibiscus & Aloe Vera Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Improves skin elasticity and natural glow while soothing and calming sensitive, dry skin with antioxidants and minerals.',
    ing: ['Hibiscus', 'Aloe Vera'],
    variants: [{ l: '100 g', p: 139, m: 219 }] },
  { id: 'kesar-oats-soap', cat: 'soap', name: 'Kesar Oats Bath Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Handcrafted with pure saffron and oats to gently cleanse, nourish and brighten normal to dry skin.',
    ing: ['Kesar (Saffron)', 'Oats'],
    variants: [{ l: '100 g', p: 159, m: 249 }] },
  { id: 'avarampoo-soap', cat: 'soap', name: 'Avarampoo Cold-Processed Soap', tag: 'Bathing', icon: 'soap',
    desc: 'Avarampoo extract brightens skin tone and supports a natural glow, rich in antioxidants to purify and rejuvenate.',
    ing: ['Avarampoo Extract'],
    variants: [{ l: '100 g', p: 139, m: 219 }] },
  { id: 'gentle-baby-soap', cat: 'soap', name: 'Gentle Baby Soap', tag: 'Baby Care', icon: 'soap',
    desc: 'Vanilla essential oil, olive oil, cocoa and shea butter cleanse while nourishing delicate skin, with vitamins A & E. For kids above 2 years.',
    ing: ['Cocoa Butter', 'Shea Butter', 'Vanilla'],
    variants: [{ l: 'Standard bar', p: 139, m: 199 }] },
  { id: 'hanging-grape-soap', cat: 'soap', name: 'Handcrafted Hanging Grape Bunch Soap', tag: 'Decorative', icon: 'soapDeco',
    desc: 'A luxurious, mess-free hanging soap for kitchen or bathroom that gently cleanses while leaving hands soft and hydrated.',
    ing: ['Glycerin Base'],
    variants: [{ l: 'Blue', p: 189, m: 219 }, { l: 'Green', p: 189, m: 219 }, { l: 'Lavender', p: 189, m: 219 }, { l: 'Orange', p: 189, m: 219 }, { l: 'Pink', p: 189, m: 219 }, { l: 'Strawberry', p: 189, m: 219 }, { l: 'Yellow', p: 189, m: 219 }] },
  { id: '12-herbs-hair-oil', cat: 'oil', name: '12 Herbs Hair Growth Oil', tag: 'Haircare', icon: 'oil',
    desc: 'An Ayurvedic blend of 12 herbs — Bhringraj, Amla, Brahmi, Neem, Hibiscus and more — that nourishes the scalp, reduces hair fall and restores shine.',
    ing: ['Rosemary', 'Castor', 'Coconut', 'Amla'],
    variants: [{ l: '100 ml', p: 149, m: 219 }, { l: '200 ml', p: 269, m: 429 }] },
  { id: 'beetroot-shea-lip-balm', cat: 'balm', name: 'Beetroot & Shea Butter Lip Balm', tag: 'Lip Care', icon: 'balm',
    desc: 'Beetroot adds a subtle pinkish tint while shea butter keeps lips hydrated, soft and smooth all day — free from parabens and sulfates.',
    ing: ['Beetroot', 'Shea Butter'],
    variants: [{ l: 'Pack of 1', p: 109, m: 199 }] },
  { id: 'natural-creamy-lip-balm', cat: 'balm', name: 'Natural Creamy Lip Balm', tag: 'Lip Care', icon: 'balm',
    desc: 'A lightweight, creamy lemon-scented balm that glides on smooth and keeps lips nourished through the day.',
    ing: ['Lemon', 'Vitamin E'],
    variants: [{ l: 'Lemon', p: 109, m: 199 }] },
  { id: 'semi-matte-lipstick', cat: 'lipstick', name: 'Semi-Matte Lipstick', tag: 'Lip Colour', icon: 'lipstick',
    desc: 'A moisturising, creamy semi-matte lipstick with buildable, long-lasting coverage — comfortable enough for daily wear.',
    ing: ['Moisturising Base'],
    variants: [{ l: 'Tomato Red', p: 219, m: 299 }, { l: 'Velvet Maroon', p: 219, m: 299 }, { l: 'Pink Blush', p: 219, m: 299 }] }
];

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 60);
}

function validateProduct(p, validCategoryIds) {
  if (!p || typeof p !== 'object') return 'Invalid product data';
  if (!p.name || !String(p.name).trim()) return 'Product name is required';
  if (!validCategoryIds.includes(p.cat)) return 'Please choose a valid catalogue/category';
  if (!Array.isArray(p.variants) || p.variants.length === 0) return 'Add at least one size/weight with a price';
  for (const v of p.variants) {
    if (!v || !v.l || !String(v.l).trim()) return 'Each size/weight needs a label (e.g. "100 g")';
    if (typeof v.p !== 'number' || isNaN(v.p) || v.p <= 0) return 'Each size/weight needs a valid selling price';
    if (typeof v.m !== 'number' || isNaN(v.m) || v.m <= 0) return 'Each size/weight needs a valid MRP';
  }
  return null;
}

exports.handler = async function (event) {
  const store = productsStore();

  if (event.httpMethod === 'GET') {
    try {
      let products = await store.get('all', { type: 'json' });
      if (!Array.isArray(products)) {
        products = DEFAULT_PRODUCTS;
        await store.setJSON('all', products);
      }
      // Public GET, same response for every visitor — cache at the edge.
      // See site-images.js for the same pattern and reasoning.
      return {
        statusCode: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
        body: JSON.stringify(products),
      };
    } catch (err) {
      console.error('products GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load products' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, action, product, id } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      let products = await store.get('all', { type: 'json' });
      if (!Array.isArray(products)) products = DEFAULT_PRODUCTS;

      if (action === 'delete') {
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
        const next = products.filter((p) => p.id !== id);
        await store.setJSON('all', next);
        return { statusCode: 200, body: JSON.stringify({ success: true, products: next }) };
      }

      // Default action: create or update ("upsert")
      const validCategoryIds = await loadValidCategoryIds();
      const validationError = validateProduct(product, validCategoryIds);
      if (validationError) {
        return { statusCode: 400, body: JSON.stringify({ error: validationError }) };
      }

      let productId = product.id;
      const isExisting = !!(product.id && products.some((p) => p.id === product.id));

      if (!isExisting) {
        const base = slugify(product.id || product.name);
        if (!base) return { statusCode: 400, body: JSON.stringify({ error: 'Could not generate an id from that name' }) };
        productId = base;
        let n = 2;
        while (products.some((p) => p.id === productId)) {
          productId = base + '-' + n;
          n++;
        }
      }

      const cleanProduct = {
        id: productId,
        cat: product.cat,
        name: String(product.name).trim(),
        tag: String(product.tag || '').trim(),
        desc: String(product.desc || '').trim(),
        icon: VALID_ICONS.includes(product.icon) ? product.icon : 'soap',
        ing: Array.isArray(product.ing) ? product.ing.map(String).map((s) => s.trim()).filter(Boolean) : [],
        variants: product.variants.map((v) => ({
          l: String(v.l).trim(),
          p: Math.round(Number(v.p)),
          m: Math.round(Number(v.m)),
        })),
      };

      const existingIdx = products.findIndex((p) => p.id === productId);
      if (existingIdx >= 0) {
        products[existingIdx] = cleanProduct;
      } else {
        products.push(cleanProduct);
      }

      await store.setJSON('all', products);
      return { statusCode: 200, body: JSON.stringify({ success: true, product: cleanProduct, products: products }) };
    } catch (err) {
      console.error('products POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save product' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
