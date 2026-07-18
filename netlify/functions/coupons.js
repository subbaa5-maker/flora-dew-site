// netlify/functions/coupons.js
//
// Manages discount coupons (code + flat amount off, in rupees) so the
// shop owner can create/edit/remove coupons from the admin dashboard
// without a code deploy, and so the storefront checkout can validate a
// code and show the discount before payment. Stored as one JSON array
// under the key "all" — same pattern as products.js / categories.js.
//
// Supported limits, all enforced server-side (never trust the browser):
//   - minOrder / maxOrder   — subtotal must fall within this range
//   - usageLimit            — total redemptions across all customers
//   - oncePerCustomer       — each email address (see redeemedBy) may
//                             redeem this coupon at most once, regardless
//                             of usageLimit
//   - expiresAt / active    — standard on/off switches
//
// GET  /.netlify/functions/coupons?secret=...
//      -> admin-only, returns the full coupon array (including inactive/
//         expired ones, so Admin can show and edit everything). Secret is
//         passed as a query param since GET requests have no body.
//
// POST /.netlify/functions/coupons
//      body: { action:"validate", code, subtotal, email? }
//      -> public. Looks up the code (case-insensitive), checks it's
//         active, not expired, under its usage limit, within min/max
//         order value, and — if `email` is provided — not already
//         redeemed by that customer. `email` is optional here because
//         the storefront asks for a coupon code before it has asked for
//         the customer's email; when omitted, the once-per-customer rule
//         is skipped at this step and enforced for real at order-creation
//         time instead (see create-order.js), where the email is always
//         known before anything is charged.
//
// POST /.netlify/functions/coupons
//      body: { secret, action:"upsert", coupon }
//      -> admin-only. If coupon.id is missing or new, creates a new
//         coupon (id is slugified from the code, made unique if needed).
//         If coupon.id matches an existing one, replaces it in place.
//         `usedCount` and `redeemedBy` are always carried over from the
//         existing record — never trusted from the admin form — since
//         they're server-managed usage history, not editable settings.
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateCouponInput(c) {
  if (!c || typeof c !== 'object') return 'Invalid coupon data';
  if (!c.code || !String(c.code).trim()) return 'Coupon code is required';
  const amountOffNum = Number(c.amountOff);
  if (isNaN(amountOffNum) || amountOffNum <= 0) return 'Amount off must be a positive number';
  if (c.minOrder !== null && c.minOrder !== undefined && c.minOrder !== '') {
    const minNum = Number(c.minOrder);
    if (isNaN(minNum) || minNum < 0) return 'Minimum order must be a non-negative number';
  }
  if (c.maxOrder !== null && c.maxOrder !== undefined && c.maxOrder !== '') {
    const maxNum = Number(c.maxOrder);
    if (isNaN(maxNum) || maxNum <= 0) return 'Maximum order must be a positive number';
    if (c.minOrder && maxNum < Number(c.minOrder)) return 'Maximum order must be greater than the minimum order';
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

// Runs every server-side rule for a coupon against a subtotal (and,
// when known, a customer email). Shared by the public "validate" action
// here and by create-order.js's own authoritative re-check before
// charging anyone — so the two can never drift apart and disagree.
function checkCouponRules(found, subtotalNum, email) {
  if (found.active === false) return 'This coupon is no longer active';
  if (found.expiresAt && Date.parse(found.expiresAt) < Date.now()) return 'This coupon has expired';
  if (found.usageLimit && Number(found.usedCount || 0) >= Number(found.usageLimit)) {
    return 'This coupon has reached its usage limit';
  }
  if (found.minOrder && subtotalNum < Number(found.minOrder)) {
    return `Add items worth ₹${found.minOrder - subtotalNum} more to use this coupon`;
  }
  if (found.maxOrder && subtotalNum > Number(found.maxOrder)) {
    return `This coupon can only be used on orders up to ₹${found.maxOrder}`;
  }
  if (found.oncePerCustomer && email) {
    const normalizedEmail = normalizeEmail(email);
    const redeemedBy = Array.isArray(found.redeemedBy) ? found.redeemedBy : [];
    if (redeemedBy.includes(normalizedEmail)) return 'You\'ve already used this coupon';
  }
  return null;
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
      const { secret, action, coupon, id, code, subtotal, email } = JSON.parse(event.body || '{}');
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

        // `email` isn't known yet at this point in checkout for a
        // first-time visitor — checkCouponRules simply skips the
        // once-per-customer check when email is empty. It's re-run with
        // the real email in create-order.js before anything is charged.
        const ruleError = checkCouponRules(found, subtotalNum, email);
        if (ruleError) {
          return { statusCode: 200, body: JSON.stringify({ valid: false, error: ruleError }) };
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
      const validationError = validateCouponInput(coupon);
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
        maxOrder: (coupon.maxOrder === null || coupon.maxOrder === undefined || coupon.maxOrder === '') ? null : Number(coupon.maxOrder),
        oncePerCustomer: coupon.oncePerCustomer === true,
        usageLimit: (coupon.usageLimit === null || coupon.usageLimit === undefined || coupon.usageLimit === '') ? null : Number(coupon.usageLimit),
        // Usage history is server-managed — never trust a value sent
        // from Admin for these; keep whatever was already recorded.
        usedCount: existingRecord ? Number(existingRecord.usedCount || 0) : 0,
        redeemedBy: existingRecord && Array.isArray(existingRecord.redeemedBy) ? existingRecord.redeemedBy : [],
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

exports.checkCouponRules = checkCouponRules;
exports.normalizeCode = normalizeCode;
exports.normalizeEmail = normalizeEmail;
exports.computeDiscount = computeDiscount;

// Called by verify-payment.js once payment is actually confirmed (never
// at create-order.js time, since that runs on every checkout attempt
// including abandoned ones — incrementing usage there would burn down a
// limited coupon's count for orders that never completed). Records both
// the usage count and, for once-per-customer coupons, the customer's
// email so they can't reuse the same code on a future order.
exports.redeemCoupon = async function redeemCoupon(id, customerEmail) {
  const store = couponsStore();
  const coupons = (await store.get('all', { type: 'json' })) || [];
  const idx = coupons.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  coupons[idx].usedCount = Number(coupons[idx].usedCount || 0) + 1;
  if (customerEmail) {
    const normalizedEmail = normalizeEmail(customerEmail);
    const redeemedBy = Array.isArray(coupons[idx].redeemedBy) ? coupons[idx].redeemedBy : [];
    if (!redeemedBy.includes(normalizedEmail)) redeemedBy.push(normalizedEmail);
    coupons[idx].redeemedBy = redeemedBy;
  }
  await store.setJSON('all', coupons);
  return coupons[idx];
};
