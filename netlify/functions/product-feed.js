// netlify/functions/product-feed.js
//
// Generates a product CSV feed compatible with both Pinterest Catalogs
// and Google Merchant Center, pulling live data from the same product
// catalog Admin manages (see products.js) — no manual export needed.
// Add/edit/remove a product in Admin, and this feed reflects it on the
// next fetch.
//
// Each size/weight variant becomes its own row (since each has its own
// price), grouped together via item_group_id so both platforms know
// they're options of the same product rather than separate products.
//
// Wired up via a redirect in netlify.toml:
//   /product-feed.csv  ->  /.netlify/functions/product-feed
// so it's reachable at a stable, memorable URL to give both Pinterest
// and Google Merchant Center — neither platform needs to know it's a
// function under the hood.
//
// Submit this URL in:
//   - Pinterest: Catalogs -> Add data source -> "Fetch from URL (CSV)"
//   - Google Merchant Center: Products -> Feeds -> Add feed -> Scheduled fetch
// Both platforms re-fetch this URL on their own schedule, so new
// products/price changes show up automatically without re-uploading
// anything.

const { productsStore, productImagesStore } = require('./lib/blobs');

const BASE_URL = 'https://www.floradew.in';
const FALLBACK_IMAGE = BASE_URL + '/og-image.jpg';

const HEADERS = [
  'id', 'title', 'description', 'link', 'image_link',
  'price', 'sale_price', 'availability', 'brand', 'condition',
  'item_group_id', 'identifier_exists',
];

function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(values) {
  return values.map(csvField).join(',');
}

function slugifyLabel(label) {
  return String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '');
}

exports.handler = async function () {
  let products = [];
  try {
    const store = productsStore();
    const all = await store.get('all', { type: 'json' });
    if (Array.isArray(all)) products = all;
  } catch (err) {
    console.error('product-feed: could not load products', err);
    return { statusCode: 500, body: 'Could not generate feed' };
  }

  const imagesStore = productImagesStore();
  const rows = [csvRow(HEADERS)];

  for (const product of products) {
    // First saved photo (if any) is used as the primary image for every
    // variant of this product — Admin's photo tagging supports
    // variant-specific photos, but a feed needs one clear "main" image
    // per row, so we keep this simple and consistent.
    let imageLink = FALLBACK_IMAGE;
    try {
      const images = await imagesStore.get(product.id, { type: 'json' });
      if (Array.isArray(images) && images.length > 0) {
        imageLink = BASE_URL + '/.netlify/functions/product-image?productId=' + encodeURIComponent(product.id) + '&index=0';
      }
    } catch (err) {
      // Missing/broken image metadata for one product shouldn't break
      // the whole feed — fall back to the site's default image.
      console.error('product-feed: could not load images for', product.id, err);
    }

    const availability = product.inStock === false ? 'out of stock' : 'in stock';
    const link = BASE_URL + '/product/' + product.id;

    for (const variant of product.variants || []) {
      const id = product.id + '--' + slugifyLabel(variant.l);
      const title = product.name + (variant.l ? ' (' + variant.l + ')' : '');
      const hasDiscount = variant.p < variant.m;

      rows.push(csvRow([
        id,
        title,
        product.desc || product.name,
        link,
        imageLink,
        (hasDiscount ? variant.m : variant.p).toFixed(2) + ' INR',
        hasDiscount ? variant.p.toFixed(2) + ' INR' : '',
        availability,
        'Flora Dew',
        'new',
        product.id,
        'no', // identifier_exists: we don't track GTIN/MPN for handmade goods
      ]));
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'inline; filename="flora-dew-product-feed.csv"',
    },
    body: rows.join('\n') + '\n',
  };
};
