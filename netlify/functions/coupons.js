const { couponsStore } = require("./lib/blobs");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

async function loadCoupons() {
  try {
    const data = await couponsStore().get("all", { type: "json" });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveCoupons(coupons) {
  await couponsStore().setJSON("all", coupons);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  // ------------------------------------------------------------------
  // Validate a coupon (public)
  // GET /.netlify/functions/coupons?code=WELCOME100
  // ------------------------------------------------------------------
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};

    // Checkout validation
    if (params.code) {
      const coupons = await loadCoupons();
      const wanted = normalizeCode(params.code);

      const coupon = coupons.find(
        c => normalizeCode(c.code) === wanted
      );

      if (!coupon) {
        return json(200, {
          valid: false,
          error: "Invalid coupon code."
        });
      }

      return json(200, {
        valid: true,
        code: coupon.code,
        amountOff: Number(coupon.amountOff)
      });
    }

    // ------------------------------------------------------------
    // Admin listing
    // ------------------------------------------------------------
    const secret = params.secret || "";

    if (secret !== process.env.ADMIN_SECRET) {
      return json(401, {
        error: "Unauthorized"
      });
    }

    return json(200, await loadCoupons());
  }

  // ------------------------------------------------------------------
  // Admin create/delete
  // ------------------------------------------------------------------
  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "{}");

    if (body.secret !== process.env.ADMIN_SECRET) {
      return json(401, {
        success: false,
        error: "Unauthorized"
      });
    }

    let coupons = await loadCoupons();

    // ------------------------------------------------------------
    // Add / Update
    // ------------------------------------------------------------
    if (body.action === "upsert") {
      const coupon = body.coupon || {};

      const code = normalizeCode(coupon.code);
      const amountOff = Number(coupon.amountOff);

      if (!code) {
        return json(400, {
          success: false,
          error: "Coupon code is required."
        });
      }

      if (!amountOff || amountOff <= 0) {
        return json(400, {
          success: false,
          error: "Discount amount must be greater than zero."
        });
      }

      const existing = coupons.find(
        c => normalizeCode(c.code) === code
      );

      if (existing) {
        existing.amountOff = amountOff;
      } else {
        coupons.push({
          code,
          amountOff
        });
      }

      coupons.sort((a, b) =>
        a.code.localeCompare(b.code)
      );

      await saveCoupons(coupons);

      return json(200, {
        success: true,
        coupons
      });
    }

    // ------------------------------------------------------------
    // Delete
    // ------------------------------------------------------------
    if (body.action === "delete") {
      const code = normalizeCode(body.code);

      coupons = coupons.filter(
        c => normalizeCode(c.code) !== code
      );

      await saveCoupons(coupons);

      return json(200, {
        success: true,
        coupons
      });
    }

    return json(400, {
      success: false,
      error: "Unknown action."
    });
  }

  return json(405, {
    error: "Method not allowed."
  });
};
