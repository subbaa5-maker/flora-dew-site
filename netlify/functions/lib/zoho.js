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
//
// Account is on the India data center, so we use the .in domains:
//   https://accounts.zoho.in  (OAuth token refresh)
//   https://www.zohoapis.in   (Invoice API)

const ACCOUNTS_DOMAIN = 'https://accounts.zoho.in';
const API_DOMAIN = 'https://www.zohoapis.in/invoice/v3';

// Cached in module scope so a warm Netlify function container can reuse an
// access token across invocations instead of refreshing on every call.
let cachedToken = null; // { accessToken, expiresAt }

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

// Creates the invoice itself from the order's line items.
async function createInvoice(customerId, order) {
  const line_items = order.items.map((it) => ({
    name: `${it.name} (${it.variant})`,
    rate: it.price,
    quantity: it.qty,
  }));

  const created = await zohoFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: customerId,
      line_items,
      reference_number: order.orderId,
      notes: `Payment ID: ${order.paymentId || ''}`,
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
