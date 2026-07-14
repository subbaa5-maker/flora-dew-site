// netlify/functions/post-page.js
//
// Server-renders a blog post's page — title, meta description, canonical
// URL, Open Graph tags, JSON-LD, and the visible content — so link
// previews (WhatsApp, Facebook, Slack, etc.) and search engine crawlers
// see the real post immediately, instead of the generic site default.
//
// Why this exists: post.html (the client-rendered version) only fills in
// these values with JavaScript after fetching the post from blog.js. Most
// social-preview bots don't run JavaScript, so every post was showing the
// same generic title/image when shared, regardless of its actual content.
//
// This function owns its OWN copy of post.html's markup/styles (below),
// rather than reading the post.html file off disk at request time.
// That's a deliberate tradeoff: reading a bundled static file from a
// Netlify Function at runtime depends on the `included_files` build
// config working exactly as expected, and a path/bundling mistake there
// would break EVERY blog post at once with no easy way to catch it before
// it's live. A self-contained template is more code, but can't break that
// way. The cost: if the visual design of post.html ever changes, the
// <style> block and markup below need to be updated to match by hand.
//
// Routing: netlify.toml rewrites /blog/:slug to this function (instead of
// straight to post.html) via [[redirects]] + `to = "/.netlify/functions/post-page?slug=:slug"`.
// The function then returns a full HTML page directly — same visual
// result as post.html, but with the real values baked in from the start.
// The page still includes the same client-side <script> at the bottom,
// so once loaded in an actual browser it re-fetches and re-renders from
// blog.js like before — harmless redundancy, and it self-heals if this
// function's short-lived cache ever serves a slightly stale version.
//
// Required Netlify environment variable: none (public, read-only)

const { blogStore } = require('./lib/blobs');

const BASE_URL = 'https://www.floradew.in';

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch (err) {
    return '';
  }
}

// Same plain-text-to-paragraphs logic as post.html's client-side
// renderBody() — intentionally not HTML-escaped here either, matching
// the existing site-wide convention that Admin-authored content (typed
// by the shop owner, not public input) is trusted as-is.
function renderBody(body) {
  const raw = String(body || '');
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\n\s*\n/)
    .map((block) => '<p>' + block.trim().replace(/\n/g, '<br>') + '</p>')
    .join('');
}

function renderPostPage(post) {
  const title = escapeHtml(post.title) + ' — Flora Dew Blog';
  const description = escapeHtml(post.excerpt || post.title);
  const url = BASE_URL + '/blog/' + encodeURIComponent(post.slug);
  const image = post.coverImage ? escapeHtml(post.coverImage) : BASE_URL + '/og-image.jpg';
  const dateLabel = fmtDate(post.publishedAt);
  const bodyHtml = renderBody(post.body);
  const coverImgTag = post.coverImage
    ? `<img class="post-cover" id="post-cover" src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}">`
    : `<img class="post-cover" id="post-cover" style="display:none;" alt="">`;

  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt || post.title,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: { '@type': 'Organization', name: 'Flora Dew' },
    publisher: { '@type': 'Organization', name: 'Flora Dew', logo: { '@type': 'ImageObject', url: BASE_URL + '/logo.png' } },
    image: post.coverImage || BASE_URL + '/og-image.jpg',
    mainEntityOfPage: url,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#243623">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Flora Dew">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,450;0,9..144,600;1,9..144,450;1,9..144,600&family=Work+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${articleSchema}</script>
<style>
  :root{
    --moss-ink:#243623; --milk-sage:#eef1e6; --milk-sage-2:#e3e8d6;
    --rosewater:#c4707c; --rosewater-deep:#a5525e; --honey-oil:#c2963a;
    --fern:#4e6b4c; --paper:#f8f8f3; --line: rgba(36,54,35,0.14);
    --shadow-soft: 0 20px 40px -24px rgba(36,54,35,0.35);
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{
    background:var(--milk-sage); color:var(--moss-ink);
    font-family:'Work Sans', sans-serif; line-height:1.6;
  }
  h1,h2,h3{font-family:'Fraunces', serif; font-weight:450; letter-spacing:-0.01em;}
  a{color:var(--fern);}
  header{
    display:flex; justify-content:space-between; align-items:center;
    padding:22px clamp(20px,5vw,60px);
  }
  .logo{display:flex; align-items:center; gap:8px; font-family:'Fraunces',serif; font-size:1.2rem; font-weight:600; color:var(--moss-ink); text-decoration:none;}
  .logo .dot{width:9px;height:9px;border-radius:50%;background:var(--rosewater);}
  .back-link{font-size:0.85rem; color:rgba(36,54,35,0.65); text-decoration:none;}
  main{max-width:720px; margin:0 auto; padding:20px clamp(20px,5vw,40px) 100px;}
  .post-loading, .post-error{text-align:center; padding:80px 20px; color:rgba(36,54,35,0.55); display:none;}
  .post-date{font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:rgba(36,54,35,0.5); margin-bottom:10px;}
  .post-title{font-size:clamp(1.8rem,4vw,2.4rem); margin-bottom:22px; line-height:1.15;}
  .post-cover{width:100%; border-radius:18px; margin-bottom:26px; display:block;}
  .post-body{font-size:1.02rem; color:rgba(36,54,35,0.88);}
  .post-body p{margin-bottom:18px;}
  .post-body h2{font-size:1.4rem; margin:30px 0 14px;}
  .post-body h3{font-size:1.15rem; margin:24px 0 10px;}
  .post-body ul, .post-body ol{margin:0 0 18px 22px;}
  .post-body li{margin-bottom:8px;}
  .post-body img{max-width:100%; border-radius:12px; margin:10px 0;}
  .post-cta{
    margin-top:40px; padding:24px; background:var(--paper); border-radius:16px;
    text-align:center; box-shadow:var(--shadow-soft);
  }
  .post-cta a{
    display:inline-block; margin-top:12px; background:var(--moss-ink); color:var(--milk-sage);
    padding:12px 26px; border-radius:100px; font-weight:600; font-size:0.9rem; text-decoration:none;
  }
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXBFZ3DWRL"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXBFZ3DWRL');
</script>
</head>
<body>

<header>
  <a href="index.html" class="logo"><span class="dot"></span>Flora Dew</a>
  <a href="blog.html" class="back-link">← Back to Journal</a>
</header>

<main>
  <div id="post-content">
    <div class="post-date" id="post-date">${escapeHtml(dateLabel)}</div>
    <h1 class="post-title" id="post-title">${escapeHtml(post.title)}</h1>
    ${coverImgTag}
    <div class="post-body" id="post-body">${bodyHtml}</div>

    <div class="post-cta">
      <div>Ready to try our handmade, chemical-free skincare?</div>
      <a href="index.html">Shop Flora Dew →</a>
    </div>
  </div>
</main>

<script>
  // Re-hydrates from the live API once a real browser loads this page —
  // keeps content fresh even if this function's short cache window ever
  // serves a slightly stale render, and matches how every other page on
  // the site fetches its own data client-side.
  function fmtDate(iso){
    if(!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  }
  function renderBody(body){
    if(/<[a-z][\\s\\S]*>/i.test(body)) return body;
    return body.split(/\\n\\s*\\n/).map(function(block){ return '<p>' + block.trim().replace(/\\n/g, '<br>') + '</p>'; }).join('');
  }
  fetch('/.netlify/functions/blog?slug=${encodeURIComponent(post.slug)}')
    .then(function(res){ return res.ok ? res.json() : null; })
    .then(function(post){
      if(!post) return;
      document.getElementById('post-date').textContent = fmtDate(post.publishedAt);
      document.getElementById('post-title').textContent = post.title;
      if(post.coverImage){
        var coverEl = document.getElementById('post-cover');
        coverEl.src = post.coverImage;
        coverEl.alt = post.title;
        coverEl.style.display = 'block';
      }
      document.getElementById('post-body').innerHTML = renderBody(post.body);
    })
    .catch(function(){ /* keep the server-rendered content as-is */ });
</script>

</body>
</html>
`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Post not found — Flora Dew Blog</title>
<meta name="robots" content="noindex">
</head>
<body>
<p>We couldn't find that post. <a href="/blog.html">Back to the journal</a></p>
</body>
</html>
`;
}

exports.handler = async function (event) {
  // Normally the slug arrives via the query string, forwarded by the
  // netlify.toml redirect rule for /blog/*. As a safety net — in case a
  // future redirect-config change or Netlify quirk ever stops that
  // forwarding from working — also fall back to pulling it directly off
  // the request path itself, e.g. "/blog/how-to-pick-a-soap" or
  // "/.netlify/functions/post-page/how-to-pick-a-soap".
  let slug = (event.queryStringParameters || {}).slug;
  if (!slug && event.path) {
    const parts = event.path.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== 'post-page') slug = decodeURIComponent(last);
  }
  if (!slug) {
    return { statusCode: 302, headers: { Location: '/blog.html' }, body: '' };
  }

  try {
    const store = blogStore();
    let posts = await store.get('all', { type: 'json' });
    if (!Array.isArray(posts)) posts = [];

    const post = posts.find((p) => p.slug === slug && p.status === 'published');
    if (!post) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: notFoundPage(),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Short cache — a newly published/edited post should show up
        // for link-preview bots within a minute or so, not be stuck
        // behind a long cache.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
      },
      body: renderPostPage(post),
    };
  } catch (err) {
    console.error('post-page error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: notFoundPage(),
    };
  }
};
