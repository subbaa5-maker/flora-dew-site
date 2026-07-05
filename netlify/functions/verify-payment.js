// netlify/functions/verify-payment.js
//
// After checkout, Razorpay's browser widget calls back with a payment id,
// order id, and signature. That signature MUST be re-checked here using
// your secret key — never trust a "success" event from the browser alone,
// since it can be faked by anyone poking at the page's JavaScript.
//
// Once verified, this function:
//   1. Looks up the pending order (saved by create-order.js) in Netlify Blobs
//   2. Marks it "paid" and stores the payment id
//   3. Emails a receipt to the customer and a notification to the shop
//      owner, via Resend (https://resend.com) — only if RESEND_API_KEY is
//      set. If it isn't set yet, the order is still verified & saved; you
//      just won't get emails until you add the key (see SETUP.md).
//
// Required Netlify environment variable:
//   RAZORPAY_KEY_SECRET
//
// Optional (for email receipts):
//   RESEND_API_KEY
//   STORE_EMAIL       — where new-order notifications are sent (defaults to hello@floradew.in)
//   STORE_FROM_EMAIL  — the "from" address for outgoing mail (must be a domain verified in Resend)

const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return; // emailing is optional until configured
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.STORE_FROM_EMAIL || 'Flora Dew <orders@floradew.in>',
        to,
        subject,
        html,
      }),
    });
  } catch (err) {
    // Email failures should never break checkout for the customer.
    console.error('sendEmail error:', err);
  }
}

function renderOrderRows(items) {
  return items
    .map(
      (it) =>
        `<tr><td style="padding:4px 8px;">${it.name} (${it.variant})</td><td style="padding:4px 8px;">×${it.qty}</td><td style="padding:4px 8px;">₹${it.price * it.qty}</td></tr>`
    )
    .join('');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = JSON.parse(event.body || '{}');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return {
        statusCode: 400,
        body: JSON.stringify({ verified: false, error: 'Missing fields' }),
      };
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    const verified = expectedSignature === razorpay_signature;

    if (!verified) {
      return {
        statusCode: 200,
        body: JSON.stringify({ verified: false }),
      };
    }

    const ordersStore = getStore('orders');
    const order = await ordersStore.get(razorpay_order_id, { type: 'json' });

    if (!order) {
      // Signature was valid but we have no record of this order — still
      // report verified so the customer isn't told payment failed, but log
      // it loudly since it means create-order.js's blob write didn't happen.
      console.error('verify-payment: no pending order found for', razorpay_order_id);
      return {
        statusCode: 200,
        body: JSON.stringify({ verified: true }),
      };
    }

    order.status = 'paid';
    order.paymentId = razorpay_payment_id;
    order.paidAt = new Date().toISOString();
    await ordersStore.setJSON(razorpay_order_id, order);

    const total = order.items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const rows = renderOrderRows(order.items);
    const addressBlock = `${order.customer.address}, ${order.customer.city}, ${order.customer.state} - ${order.customer.pincode}`;

    // Customer receipt
    await sendEmail({
      to: order.customer.email,
      subject: 'Your Flora Dew order is confirmed',
      html: `
        <div style="font-family:sans-serif;color:#243623;">
          <h2>Thank you, ${order.customer.name}!</h2>
          <p>Your order has been received and payment confirmed.</p>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          <p><strong>Total paid: ₹${total}</strong></p>
          <p>Shipping to: ${addressBlock}</p>
          <p>Payment ID: ${razorpay_payment_id}</p>
          <p>We'll be in touch if there's anything else we need. Thank you for choosing Flora Dew!</p>
        </div>
      `,
    });

    // Owner notification
    await sendEmail({
      to: process.env.STORE_EMAIL || 'hello@floradew.in',
      subject: `New order from ${order.customer.name} — ₹${total}`,
      html: `
        <div style="font-family:sans-serif;color:#243623;">
          <h2>New paid order</h2>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          <p><strong>Total: ₹${total}</strong></p>
          <p><strong>Customer:</strong> ${order.customer.name} · ${order.customer.phone} · ${order.customer.email}</p>
          <p><strong>Ship to:</strong> ${addressBlock}</p>
          <p>Payment ID: ${razorpay_payment_id} · Order ID: ${razorpay_order_id}</p>
        </div>
      `,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ verified: true }),
    };
  } catch (err) {
    console.error('verify-payment error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ verified: false, error: 'Verification failed' }),
    };
  }
};
