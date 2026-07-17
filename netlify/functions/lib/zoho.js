// netlify/functions/lib/zoho.js
//
// Minimal Zoho Invoice API client used to auto-generate a GST invoice for
// every paid Razorpay order. Zoho invoicing is entirely optional — if
// ZOHO_CLIENT_ID isn't set, createZohoInvoiceForOrder() silently does
// nothing, the same way sendEmail() does for Resend, so checkout never
// fails because of it.
//
// Required Netlify environment variables:
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN
//   ZOHO_ORG_ID
//   ZOHO_GST_PERCENTAGE   e.g. "5" — fallback GST rate used only for line
//                         items whose product has no GST rate set in
//                         Admin. The shop is GST-registered, so every
//                         invoice line item must carry a tax_id or Zoho
//                         rejects the invoice (error 110802). Each
//                         product can carry its own GST rate (set per
//                         product in Admin, since the catalog spans
//                         multiple slabs e.g. 5% / 12% / 18%); this env
//                         var is only the fallback for older products
//                         that haven't been given a rate yet.
//
//   All rates used (per-product or this fallback) must exactly match a
//   tax rate already configured in Zoho Invoice under Settings > Taxes —
//   we look up the matching tax_id by percentage rather than hardcoding
//   one, so nothing breaks if a rate is edited in Zoho later.
//
//   Each line item also carries hsn_or_sac (Zoho's field name) from the
//   product's HSN/SAC code set in Admin. This is sent whenever a product
//   has one set; if left blank on a product, that line item is simply
//   sent without a code (Zoho only hard-requires one for GST e-invoicing
//   above the government's turnover threshold — see SETUP.md).
//
// Account is on the India data center, so we use the .in domains:
//   https://accounts.zoho.in  (OAuth token refresh)
//   https://www.zohoapis.in   (Invoice API)

const ACCOUNTS_DOMAIN = 'https://accounts.zoho.in';
const API_DOMAIN = 'https://www.zohoapis.in/invoice/v3';

// Cached in module scope so a warm Netlify function container can reuse an
// access token / tax list across invocations instead of re-fetching every call.
let cachedToken = null; // { accessToken, expiresAt }
let cachedTaxList = null; // { taxes: [{tax_id, tax_percentage}, ...], expiresAt }

function zohoConfigured() {
  return !!(
    process.env.ZOHO_CLIENT_ID &&
    process.env.ZOHO_CLIENT_SECRET &&
    process.env.ZOHO_REFRESH_TOKEN &&
    process.env.ZOHO_ORG_ID
  );
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken;
  }

  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${ACCOUNTS_DOMAIN}/oauth/v2/token?${params.toString()}`, {
    method: 'POST',
  });
  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Zoho token refresh failed: ' + JSON.stringify(data));
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
}

async function zohoFetch(path, options = {}) {
  const accessToken = await getAccessToken();
  const url = `${API_DOMAIN}${path}${path.includes('?') ? '&' : '?'}organization_id=${process.env.ZOHO_ORG_ID}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();

  // Zoho API responses use a "code" field: 0 means success.
  if (data.code !== undefined && data.code !== 0) {
    throw new Error('Zoho API error on ' + path + ': ' + JSON.stringify(data));
  }
  return data;
}

// Fetches (and caches for an hour) the full list of tax rates configured
// in Zoho Invoice under Settings > Taxes.
async function getTaxList() {
  if (cachedTaxList && cachedTaxList.expiresAt > Date.now()) {
    return cachedTaxList.taxes;
  }
  const data = await zohoFetch('/settings/taxes');
  const taxes = data.taxes || [];
  cachedTaxList = { taxes, expiresAt: Date.now() + 60 * 60 * 1000 };
  return taxes;
}

// Resolves a GST percentage (e.g. 5, 12, 18) to its Zoho tax_id. Throws if
// no matching rate is configured in Zoho, so the failure is visible in
// logs rather than silently omitting tax.
async function getTaxIdForPercentage(percentage) {
  const taxes = await getTaxList();
  const match = taxes.find((t) => parseFloat(t.tax_percentage) === percentage);

  if (!match) {
    throw new Error(
      `No tax rate of ${percentage}% found in Zoho Invoice (Settings > Taxes). ` +
        `Available rates: ${taxes.map((t) => t.tax_percentage).join(', ')}`
    );
  }
  return match.tax_id;
}

// Finds an existing contact by email, or creates a new one from the
// order's customer details. Returns the Zoho contact_id.
async function findOrCreateContact(customer) {
  const search = await zohoFetch(`/contacts?email=${encodeURIComponent(customer.email)}`);

  if (search.contacts && search.contacts.length > 0) {
    return search.contacts[0].contact_id;
  }

  const created = await zohoFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      contact_name: customer.name,
      contact_persons: [
        {
          email: customer.email,
          phone: customer.phone,
          is_primary_contact: true,
        },
      ],
      billing_address: {
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zip: customer.pincode,
        country: 'India',
      },
    }),
  });

  return created.contact.contact_id;
}

// Creates the invoice itself from the order's line items. Each line item
// carries its own GST tax_id: the rate set on the product at checkout
// time (order.items[i].gst), falling back to ZOHO_GST_PERCENTAGE for
// items that don't have a per-product rate. It also carries hsn_or_sac
// when the product has an HSN/SAC code set in Admin. This Zoho org is
// GST-enabled and requires a tax or exemption per item.
async function createInvoice(customerId, order) {
  const fallbackPercentage = parseFloat(process.env.ZOHO_GST_PERCENTAGE);

  // Resolve each distinct percentage's tax_id once, not once per line item.
  const percentagesNeeded = Array.from(
    new Set(
      order.items.map((it) => {
        const p = typeof it.gst === 'number' && !isNaN(it.gst) ? it.gst : fallbackPercentage;
        if (isNaN(p)) {
          throw new Error(
            `Item "${it.name}" has no GST rate set (add one in Admin) and ZOHO_GST_PERCENTAGE fallback is not set either.`
          );
        }
        return p;
      })
    )
  );

  const taxIdByPercentage = {};
  for (const p of percentagesNeeded) {
    taxIdByPercentage[p] = await getTaxIdForPercentage(p);
  }

  const line_items = order.items.map((it) => {
    const p = typeof it.gst === 'number' && !isNaN(it.gst) ? it.gst : fallbackPercentage;
    const item = {
      name: `${it.name} (${it.variant})`,
      rate: it.price,
      quantity: it.qty,
      tax_id: taxIdByPercentage[p],
    };
    if (it.hsn) item.hsn_or_sac = it.hsn;
    return item;
  });

const created = await zohoFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: customerId,
      line_items,
      reference_number: order.orderId,
      notes: order.couponCode ? `Payment ID: ${order.paymentId || ''} · Coupon: ${order.couponCode}` : `Payment ID: ${order.paymentId || ''}`,
      // Website prices already include GST (e.g. ₹159 is the final price
      // the customer paid). Without this flag, Zoho treats `rate` as
      // pre-tax and adds GST on top, inflating the total (e.g. ₹166.96
      // instead of ₹159). This tells Zoho to back-calculate the GST
      // breakdown out of the inclusive rate instead, so the invoice total
      // matches what was actually charged.
      is_inclusive_tax: true,
      // A flat rupee amount taken off the invoice total when a coupon was
      // applied at checkout (see create-order.js). Applied after tax so
      // the invoice total matches the discounted amount actually charged
      // via Razorpay. Double-check this against a real test invoice —
      // Zoho's own discount/tax interaction rules apply here.
      ...(order.discount ? { discount: Math.round(order.discount) / 100, is_discount_before_tax: false } : {}),
    }),
  });

  return created.invoice;
}

// Emails the invoice to the customer via Zoho's own send endpoint (this
// uses Zoho's configured "from" address and email template, separate from
// the Resend receipt email in lib/email.js).
async function emailInvoice(invoiceId, customerEmail) {
  await zohoFetch(`/invoices/${invoiceId}/email`, {
    method: 'POST',
    body: JSON.stringify({
      to_mail_ids: [customerEmail],
    }),
  });
}

// Main entry point: call this after an order is marked "paid". Best-effort
// — any failure is logged and swallowed so it never breaks the checkout
// response. Returns { invoiceId, invoiceNumber } on success, or null.
async function createZohoInvoiceForOrder(order) {
  if (!zohoConfigured()) return null;

  try {
    const contactId = await findOrCreateContact(order.customer);
    const invoice = await createInvoice(contactId, order);
    await emailInvoice(invoice.invoice_id, order.customer.email);

    return { invoiceId: invoice.invoice_id, invoiceNumber: invoice.invoice_number };
  } catch (err) {
    console.error('createZohoInvoiceForOrder error:', err);
    return null;
  }
}

module.exports = { createZohoInvoiceForOrder, zohoConfigured };
