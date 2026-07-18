// netlify/functions/verify-payment.js
//
// After checkout, Razorpay's browser widget calls back with a payment id,
// order id, and signature. That signature MUST be re-checked here using
// your secret key — never trust a "success" event from the browser alone.
//
// Once verified, this function:
//   1. Looks up the pending order (saved by create-order.js) in Netlify Blobs
//   2. Marks it "paid" and stores the payment id
//   3. Emails a receipt to the customer and a notification to the shop
//      owner, via Resend — only if RESEND_API_KEY is set.
//
// Required Netlify environment variable:
//   RAZORPAY_KEY_SECRET
//
// Optional (for email receipts):
//   RESEND_API_KEY, STORE_EMAIL, STORE_FROM_EMAIL

const crypto = require('crypto');
const { ordersStore } = require('./lib/blobs');
const { sendEmail, renderOrderRows, orderTotal, renderDiscountRow } = require('./lib/email');
const { createZohoInvoiceForOrder } = require('./lib/zoho');
const { redeemCoupon } = require('./coupons');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = JSON.parse(event.body || '{}');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return { statusCode: 400, body: JSON.stringify({ verified: false, error: 'Missing fields' }) };
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    const verified = expectedSignature === razorpay_signature;

    if (!verified) {
      return { statusCode: 200, body: JSON.stringify({ verified: false }) };
    }

    const store = ordersStore();
    const order = await store.get(razorpay_order_id, { type: 'json' });

    if (!order) {
      console.error('verify-payment: no pending order found for', razorpay_order_id);
      return { statusCode: 200, body: JSON.stringify({ verified: true }) };
    }

    order.status = 'paid';
    order.fulfillmentStatus = order.fulfillmentStatus || 'pending';
    order.paymentId = razorpay_payment_id;
    order.paidAt = new Date().toISOString();
    await store.setJSON(razorpay_order_id, order);

    // Only now — on confirmed payment, not at create-order.js time — count
    // this coupon as used. create-order.js runs on every checkout attempt,
    // including abandoned ones, so incrementing there would burn down a
    // usage-limited (or once-per-customer) coupon even for orders that
    // never actually completed.
    if (order.couponId) {
      try {
        await redeemCoupon(order.couponId, order.customer.email);
      } catch (err) {
        // Never let coupon bookkeeping block a successful, already-paid order.
        console.error('verify-payment: could not record coupon redemption', err);
      }
    }

    // Auto-generate and email a Zoho Invoice for this order. Best-effort —
    // if Zoho isn't configured or the API call fails, this returns null and
    // the checkout still succeeds; see lib/zoho.js.
    const zohoInvoice = await createZohoInvoiceForOrder(order);
    if (zohoInvoice) {
      order.zohoInvoiceId = zohoInvoice.invoiceId;
      order.zohoInvoiceNumber = zohoInvoice.invoiceNumber;
      await store.setJSON(razorpay_order_id, order);
    }

   const total = orderTotal(order.items);
    const discountRupees = order.discount ? Math.round(order.discount) / 100 : 0;
    const totalPaid = order.amount ? Math.round(order.amount) / 100 : (total - discountRupees);
    const rows = renderOrderRows(order.items) + renderDiscountRow(order);
    const addressBlock = `${order.customer.address}, ${order.customer.city}, ${order.customer.state} - ${order.customer.pincode}`;

    await sendEmail({
      to: order.customer.email,
      subject: 'Your Flora Dew order is confirmed',
      html: `
        <div style="font-family:sans-serif;color:#243623;">
          <h2>Thank you, ${order.customer.name}!</h2>
          <p>Your order has been received and payment confirmed.</p>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          <p><strong>Total paid: ₹${totalPaid}</strong></p>
          <p>Shipping to: ${addressBlock}</p>
          <p>Order ID: ${razorpay_order_id}<br>Payment ID: ${razorpay_payment_id}</p>
          <p>Track your order anytime at <a href="https://floradew.in/track.html">floradew.in/track.html</a> using this Order ID and your email.</p>
          <p>Thank you for choosing Flora Dew!</p>
        </div>
      `,
    });

    await sendEmail({
      to: process.env.STORE_EMAIL || 'hello@floradew.in',
      subject: `New order from ${order.customer.name} — ₹${totalPaid}`,
      html: `
        <div style="font-family:sans-serif;color:#243623;">
          <h2>New paid order</h2>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          <p><strong>Total: ₹${totalPaid}</strong></p>
          <p><strong>Customer:</strong> ${order.customer.name} · ${order.customer.phone} · ${order.customer.email}</p>
          <p><strong>Ship to:</strong> ${addressBlock}</p>
          <p>Payment ID: ${razorpay_payment_id} · Order ID: ${razorpay_order_id}</p>
        </div>
      `,
    });

    return { statusCode: 200, body: JSON.stringify({ verified: true }) };
  } catch (err) {
    console.error('verify-payment error:', err);
    return { statusCode: 500, body: JSON.stringify({ verified: false, error: 'Verification failed' }) };
  }
};
