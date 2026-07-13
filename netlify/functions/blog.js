// netlify/functions/blog.js
//
// Manages blog posts — stored in Netlify Blobs, same pattern as
// categories.js and products.js, so posts can be added/edited/removed
// from Admin without a code deploy, and automatically flow into the
// dynamic sitemap (see sitemap.js) for SEO.
//
// GET  /.netlify/functions/blog
//      -> public, returns every PUBLISHED post (newest first), with
//         title/slug/excerpt/coverImage/publishedAt but WITHOUT the full
//         body — keeps the blog listing page fast to load.
//
// GET  /.netlify/functions/blog?slug=how-to-pick-a-natural-soap
//      -> public, returns the single full post (including body) for that
//         slug, but only if it's published. 404 otherwise.
//
// GET  /.netlify/functions/blog?admin=1&secret=...
//      -> admin-only, returns EVERY post (including drafts) with full
//         bodies, for the Admin dashboard's post list.
//
// POST /.netlify/functions/blog
//      body: { secret, action:"upsert", post:{ id?, title, slug?, excerpt,
//              body, coverImage?, status } }
//      -> admin-only. If post.id matches an existing post, updates it in
//         place. Otherwise creates a new post (slug auto-generated from
//         title if not given, made unique if needed). status is either
//         "draft" or "published".
//
// POST /.netlify/functions/blog  (action:"delete")
//      body: { secret, action:"delete", id }
//      -> admin-only, permanently removes a post.
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { blogStore } = require('./lib/blobs');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 60);
}

function summaryOf(post) {
  const { id, title, slug, excerpt, coverImage, status, publishedAt, updatedAt } = post;
  return { id, title, slug, excerpt, coverImage: coverImage || null, status, publishedAt: publishedAt || null, updatedAt };
}

exports.handler = async function (event) {
  const store = blogStore();
  const params = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    try {
      let posts = await store.get('all', { type: 'json' });
      if (!Array.isArray(posts)) posts = [];

      const isAdmin = params.admin === '1' && process.env.ADMIN_SECRET && params.secret === process.env.ADMIN_SECRET;

      if (params.slug) {
        const post = posts.find((p) => p.slug === params.slug && (isAdmin || p.status === 'published'));
        if (!post) return { statusCode: 404, body: JSON.stringify({ error: 'Post not found' }) };
        return {
          statusCode: 200,
          headers: { 'Cache-Control': isAdmin ? 'no-store' : 'public, max-age=60, stale-while-revalidate=600' },
          body: JSON.stringify(post),
        };
      }

      if (isAdmin) {
        const sorted = [...posts].sort((a, b) => new Date(b.updatedAt || b.publishedAt || 0) - new Date(a.updatedAt || a.publishedAt || 0));
        return { statusCode: 200, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(sorted) };
      }

      const published = posts
        .filter((p) => p.status === 'published')
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .map(summaryOf);

      return {
        statusCode: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
        body: JSON.stringify(published),
      };
    } catch (err) {
      console.error('blog GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load posts' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, action, post, id } = JSON.parse(event.body || '{}');

      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      let posts = await store.get('all', { type: 'json' });
      if (!Array.isArray(posts)) posts = [];

      if (action === 'delete') {
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
        const next = posts.filter((p) => p.id !== id);
        await store.setJSON('all', next);
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // Default action: create or update ("upsert")
      if (!post || !post.title || !String(post.title).trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'A title is required' }) };
      }
      if (!post.body || !String(post.body).trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Post content is required' }) };
      }

      const title = String(post.title).trim();
      const status = post.status === 'published' ? 'published' : 'draft';
      const now = new Date().toISOString();

      const isExisting = !!(post.id && posts.some((p) => p.id === post.id));

      if (isExisting) {
        const idx = posts.findIndex((p) => p.id === post.id);
        const existing = posts[idx];
        const wasPublished = existing.status === 'published';
        posts[idx] = {
          ...existing,
          title,
          excerpt: (post.excerpt || '').trim(),
          body: post.body,
          coverImage: post.coverImage || existing.coverImage || null,
          status,
          updatedAt: now,
          // Only set publishedAt the first time a post goes live, so its
          // place in "newest first" ordering doesn't jump around later.
          publishedAt: status === 'published' ? (existing.publishedAt || now) : existing.publishedAt || null,
        };
        await store.setJSON('all', posts);
        return { statusCode: 200, body: JSON.stringify({ success: true, post: posts[idx] }) };
      }

      const base = slugify(post.slug || title);
      if (!base) return { statusCode: 400, body: JSON.stringify({ error: 'Could not generate a URL slug from that title' }) };
      let newSlug = base;
      let n = 2;
      while (posts.some((p) => p.slug === newSlug)) {
        newSlug = base + '-' + n;
        n++;
      }

      const newPost = {
        id: 'post_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        title,
        slug: newSlug,
        excerpt: (post.excerpt || '').trim(),
        body: post.body,
        coverImage: post.coverImage || null,
        status,
        createdAt: now,
        updatedAt: now,
        publishedAt: status === 'published' ? now : null,
      };
      posts.push(newPost);
      await store.setJSON('all', posts);
      return { statusCode: 200, body: JSON.stringify({ success: true, post: newPost }) };
    } catch (err) {
      console.error('blog POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save post' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
