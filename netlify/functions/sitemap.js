// netlify/functions/sitemap.js
//
// Generates sitemap.xml dynamically on every request, so every product
// currently in the catalog (added/edited/removed via Admin) is
// automatically included — no manual sitemap editing needed when the
// catalog changes. Static pages (homepage, policy pages) are still
// listed directly here since they don't come from Blobs.
//
// Wired up via a redirect in netlify.toml:
//   /sitemap.xml  ->  /.netlify/functions/sitemap
// so it's reachable at the normal https://floradew.in/sitemap.xml URL
// search engines expect — nothing about the public URL changes.

const { productsStore } = require('./lib/blobs');

const BASE_URL = 'https://www.floradew.in';

const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/terms.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy-policy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund-policy.html', changefreq: 'yearly', priority: '0.4' },
  { path: '/shipping-policy.html', changefreq: 'yearly', priority: '0.4' },
];

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]));
}

exports.handler = async function () {
  let products = [];
  try {
    const store = productsStore();
    const all = await store.get('all', { type: 'json' });
    if (Array.isArray(all)) products = all;
  } catch (err) {
    console.error('sitemap: could not load products, continuing with static pages only', err);
  }

  const urls = [
    ...STATIC_PAGES.map(
      (p) => `  <url>\n    <loc>${escapeXml(BASE_URL + p.path)}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    ),
    ...products.map(
      (prod) =>
        `  <url>\n    <loc>${escapeXml(BASE_URL + '/product/' + prod.id)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    ),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // refresh at most hourly
    },
    body: xml,
  };
};
