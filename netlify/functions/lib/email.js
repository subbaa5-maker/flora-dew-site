// netlify/functions/lib/email.js
//
// Shared email helper (via Resend, https://resend.com). Emailing is
// entirely optional — if RESEND_API_KEY isn't set, sendEmail() silently
// does nothing so checkout/order updates never fail because of it.

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return;
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

function orderTotal(items) {
  return items.reduce((sum, it) => sum + it.price * it.qty, 0);
}

// One extra HTML row for the discount, shown between the item rows and
// the total — only when the order actually had a coupon applied.
function renderDiscountRow(order) {
  if (!order || !order.discount) return '';
  const rupees = Math.round(order.discount) / 100;
  const label = order.couponCode ? `Coupon (${order.couponCode})` : 'Coupon discount';
  return `<tr><td style="padding:4px 8px;">${label}</td><td></td><td style="padding:4px 8px;">−₹${rupees}</td></tr>`;
}

module.exports = { sendEmail, renderOrderRows, orderTotal, renderDiscountRow };

