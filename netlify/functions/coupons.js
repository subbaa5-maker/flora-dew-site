// netlify/functions/coupons.js
//
// Manages discount coupons (code + flat amount off, in rupees) so the
// shop owner can create/edit/remove coupons from the admin dashboard
// without a code deploy, and so the storefront checkout can validate a
// code and show the discount before payment. Stored as one JSON array
// under the key "all" — same pattern as products.js / categories.js.
//
// GET  /.netlify/functions/coupons?secret=...
//      -> admin-only, returns the full coupon array (including inactive/
//         expired ones, so Admin can show and edit everything). Secret is
//         passed as a query param since GET requests have no body.
//
// POST /.netlify/functions/coupons
//      body: { action:"validate", code, subtotal }
//      -> public. Looks up the code (case-insensitive), checks it's
//         active, not expired, under its usage limit, and that subtotal
//         meets minOrder. Returns the computed discount but never the
//         full coupon list, so this is safe to call without a secret.
//
// POST /.netlify/functions/coupons
//      body: { secret, action:"upsert", coupon }
//      -> admin-only. If coupon.id is missing or new, creates a new
//         coupon (id is slugified from the code, made unique if needed).
//         If coupon.id matches an existing one, replaces it in place.
//
// POST /.netlify/functions/coupons  (with action:"delete")
//      body: { secret, action:"delete", id }
//      -> admin-only, removes a coupon by id.
//
// Required Netlify environment variable:
//   ADMIN_SECRET

const { couponsStore } = require('./lib/blobs');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 60);
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function validateCoupon(c) {
  if (!c || typeof c !== 'object') return 'Invalid coupon data';
  if (!c.code || !String(c.code).trim()) return 'Coupon code is required';
  const amountOffNum = Number(c.amountOff);
  if (isNaN(amountOffNum) || amountOffNum <= 0) return 'Amount off must be a positive number';
  if (c.minOrder !== null && c.minOrder !== undefined && c.minOrder !== '') {
    const minNum = Number(c.minOrder);
    if (isNaN(minNum) || minNum < 0) return 'Minimum order must be a non-negative number';
  }
  if (c.usageLimit !== null && c.usageLimit !== undefined && c.usageLimit !== '') {
    const limitNum = Number(c.usageLimit);
    if (isNaN(limitNum) || limitNum <= 0 || !Number.isInteger(limitNum)) return 'Usage limit must be a positive whole number';
  }
  if (c.expiresAt !== null && c.expiresAt !== undefined && c.expiresAt !== '') {
    if (isNaN(Date.parse(c.expiresAt))) return 'Expiry date is not valid';
  }
  return null;
}

// Computes the discount for a given coupon + cart subtotal (both in
// rupees). Never discounts more than the order is worth.
function computeDiscount(coupon, subtotal) {
  return Math.max(Math.min(Math.round(Number(coupon.amountOff)), subtotal), 0);
}

exports.handler = async function (event) {
  const store = couponsStore();

  if (event.httpMethod === 'GET') {
    try {
      const secret = (event.queryStringParameters || {}).secret;
      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      const coupons = (await store.get('all', { type: 'json' })) || [];
      return { statusCode: 200, body: JSON.stringify(coupons) };
    } catch (err) {
      console.error('coupons GET error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not load coupons' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { secret, action, coupon, id, code, subtotal } = JSON.parse(event.body || '{}');
      let coupons = (await store.get('all', { type: 'json' })) || [];

      if (action === 'validate') {
        if (!code || !String(code).trim()) {
          return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Enter a coupon code' }) };
        }
        const subtotalNum = Number(subtotal);
        if (isNaN(subtotalNum) || subtotalNum < 0) {
          return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Invalid order amount' }) };
        }

        const wanted = normalizeCode(code);
        const found = coupons.find((c) => normalizeCode(c.code) === wanted);

        if (!found) {
          return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'This coupon code does not exist' }) };
        }
        if (found.active === false) {
          return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'This coupon is no longer active' }) };
        }
        if (found.expiresAt && Date.parse(found.expiresAt) < Date.now()) {
          return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'This coupon has expired' }) };
        }
        if (found.usageLimit && Number(found.usedCount || 0) >= Number(found.usageLimit)) {
          return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'This coupon has reached its usage limit' }) };
        }
        if (found.minOrder && subtotalNum < Number(found.minOrder)) {
          return {
            statusCode: 200,
            body: JSON.stringify({ valid: false, error: `Add items worth ₹${found.minOrder - subtotalNum} more to use this coupon` }),
          };
        }

        const discount = computeDiscount(found, subtotalNum);
        return {
          statusCode: 200,
          body: JSON.stringify({
            valid: true,
            coupon: { id: found.id, code: found.code, amountOff: found.amountOff },
            discount,
          }),
        };
      }

      // Every action below this point is admin-only.
      if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      if (action === 'delete') {
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
        const next = coupons.filter((c) => c.id !== id);
        await store.setJSON('all', next);
        return { statusCode: 200, body: JSON.stringify({ success: true, coupons: next }) };
      }

      // Default action: create or update ("upsert")
      const validationError = validateCoupon(coupon);
      if (validationError) {
        return { statusCode: 400, body: JSON.stringify({ error: validationError }) };
      }

      const normalizedCode = normalizeCode(coupon.code);
      const isExisting = !!(coupon.id && coupons.some((c) => c.id === coupon.id));

      // Coupon codes must be unique (case-insensitive), regardless of id.
      const codeClash = coupons.some((c) => normalizeCode(c.code) === normalizedCode && c.id !== coupon.id);
      if (codeClash) {
        return { statusCode: 400, body: JSON.stringify({ error: 'A coupon with this code already exists' }) };
      }

      let couponId = coupon.id;
      if (!isExisting) {
        const base = slugify(coupon.id || coupon.code);
        if (!base) return { statusCode: 400, body: JSON.stringify({ error: 'Could not generate an id from that code' }) };
        couponId = base;
        let n = 2;
        while (coupons.some((c) => c.id === couponId)) {
          couponId = base + '-' + n;
          n++;
        }
      }

      const existingRecord = coupons.find((c) => c.id === couponId);

      const cleanCoupon = {
        id: couponId,
        code: normalizedCode,
        amountOff: Number(coupon.amountOff),
        minOrder: (coupon.minOrder === null || coupon.minOrder === undefined || coupon.minOrder === '') ? 0 : Number(coupon.minOrder),
        usageLimit: (coupon.usageLimit === null || coupon.usageLimit === undefined || coupon.usageLimit === '') ? null : Number(coupon.usageLimit),
        // Usage count is server-managed — never trust a value sent from
        // Admin for this; keep whatever was already recorded.
        usedCount: existingRecord ? Number(existingRecord.usedCount || 0) : 0,
        expiresAt: coupon.expiresAt ? String(coupon.expiresAt) : null,
        active: coupon.active === false ? false : true,
        createdAt: existingRecord ? existingRecord.createdAt : new Date().toISOString(),
      };

      const existingIdx = coupons.findIndex((c) => c.id === couponId);
      if (existingIdx >= 0) {
        coupons[existingIdx] = cleanCoupon;
      } else {
        coupons.push(cleanCoupon);
      }

      await store.setJSON('all', coupons);
      return { statusCode: 200, body: JSON.stringify({ success: true, coupon: cleanCoupon, coupons: coupons }) };
    } catch (err) {
      console.error('coupons POST error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save coupon' }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};

// Exported so a later step (verify-payment.js, once payment succeeds) can
// atomically bump usedCount without going through HTTP. Not wired up yet —
// that's a separate step once verify-payment.js is in scope.
exports.redeemCoupon = async function redeemCoupon(id) {
  const store = couponsStore();
  const coupons = (await store.get('all', { type: 'json' })) || [];
  const idx = coupons.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  coupons[idx].usedCount = Number(coupons[idx].usedCount || 0) + 1;
  await store.setJSON('all', coupons);
  return coupons[idx];
};
