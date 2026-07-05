# Flora Dew — Complete Site Setup

This folder is the whole website: storefront (`index.html`), SEO files
(`robots.txt`, `sitemap.xml`), and serverless functions that handle payment,
order storage, and email receipts.

```
index.html                            ← the website (shop, cart, checkout form, SEO tags)
robots.txt                            ← tells search engines what to crawl
sitemap.xml                           ← list of pages for search engines
netlify.toml                          ← tells Netlify where the functions live
package.json                          ← dependencies the functions need
netlify/functions/create-order.js     ← creates a Razorpay order + saves the pending order
netlify/functions/verify-payment.js   ← confirms payment, saves it as "paid", emails receipts
netlify/functions/list-orders.js      ← lets you view all saved orders (simple admin view)
```

## What's new in this update
- **Checkout form**: pincode now auto-fills city + state (India Post public
  API) as soon as you type a valid 6-digit pincode; state is now a proper
  dropdown of all Indian states/UTs.
- **Customer order tracking**: a new page, `track.html`, lets any customer
  check their order status by entering their Order ID + the email they
  checked out with — no login needed. It shows a Pending → Accepted →
  Shipped → Delivered progress bar, plus courier + tracking number once
  shipped. Linked from the site footer and from the post-payment success
  message.
- **Admin dashboard fulfillment controls**: each order in `admin.html` now
  has an editable fulfillment status (Pending/Accepted/Shipped/Delivered)
  plus courier name + AWB/tracking number fields, with a Save button.
- **Automatic "shipped" email**: the first time you mark an order Shipped
  with a courier + AWB filled in, the customer is automatically emailed
  their tracking details (requires email set up — Step 6).
- Two new functions: `netlify/functions/update-order.js` (admin-only,
  updates fulfillment status) and `netlify/functions/track-order.js`
  (public, customer-verified lookup).

## Setting up a real inbox at your domain (e.g. hello@floradew.in)
Right now, `hello@floradew.in` is used as a "from"/"reply-to" address in
emails but isn't necessarily a real inbox you can log into. To actually
send/receive mail as `you@floradew.in`, you need an email hosting provider
— Netlify only hosts your website, not email. Two common free/cheap options:

**Option A — Zoho Mail (free tier, recommended for a small business)**
1. Go to https://www.zoho.com/mail/ → sign up for the **Free plan** (up to
   5 users) using `floradew.in`
2. Zoho gives you DNS records to add (MX, TXT for verification, and
   optionally SPF/DKIM for deliverability)
3. Add those records wherever your domain's DNS lives:
   - If you're on **Netlify DNS** (Step 3 from the domain setup): Netlify
     site → **Domain management → DNS records → Add a record**, entering
     exactly what Zoho gives you
   - If you're on your registrar's DNS: add them there instead
4. Once verified, you can log into Zoho's webmail (or set it up in your
   phone's Mail app) to actually send/receive as `hello@floradew.in`

**Option B — Email forwarding only (simpler, no real inbox)**
If you just want mail sent to `hello@floradew.in` to land in your existing
personal Gmail, some registrars (Namecheap, Zoho itself, ImprovMX) offer
free forwarding-only setups — you can't *send* as that address, only
receive and have it redirected. Search "[your registrar name] free email
forwarding" for exact steps.

Either way, this is separate from Step 6 (Resend) below — Resend sends
*automated* transactional emails (receipts, shipping updates) from your
site; Zoho/forwarding is for a real inbox humans check.


- **Checkout now collects real customer details** — name, phone, email,
  and full delivery address — in a form before payment, so you can actually
  ship orders.
- **Orders are saved automatically** using Netlify Blobs (built into Netlify,
  no extra account needed). Every order — pending and paid — is stored with
  the customer's details and the exact items/variants/prices ordered.
- **Email receipts** (optional, takes 5 minutes to turn on) — the customer
  gets a confirmation email, and you get a notification email, once payment
  is verified.
- **SEO**: title/description/keywords tags, Open Graph + Twitter cards for
  link previews, JSON-LD structured data (Organization + a Product listing
  for every item in your catalog, so Google can show rich results), plus
  `robots.txt` and `sitemap.xml`.

---

## Step 1 — Create your Razorpay account
1. Go to https://razorpay.com → Sign Up
2. Start in **Test Mode** immediately, no KYC needed, to try the whole flow
3. To accept *real* payments later, Razorpay will ask for business + bank
   details (KYC) — usually approved within 1–2 days

## Step 2 — Get your API keys
1. In the Razorpay Dashboard: **Settings → API Keys → Generate Test Key**
   (there's a separate "Generate Live Key" once KYC is approved)
2. Copy the **Key ID** (starts `rzp_test_...`) and **Key Secret**
3. Keep the Key Secret private — it only goes into Netlify's environment
   variables (Step 4), never into `index.html`.

## Step 3 — Deploy this folder to Netlify
1. Go to netlify.com → **Add new site → Deploy manually**
2. Drag this **entire folder** (not just `index.html`) into the upload box
3. Netlify auto-detects `netlify.toml` and sets up the functions

## Step 4 — Add environment variables
**Site configuration → Environment variables → Add a variable**

| Variable | Required? | Value |
|---|---|---|
| `RAZORPAY_KEY_ID` | Yes | your Razorpay test/live Key ID |
| `RAZORPAY_KEY_SECRET` | Yes | your Razorpay test/live Key Secret |
| `ADMIN_SECRET` | Recommended | any long random string you make up — this is your password for viewing orders (Step 7) |
| `RESEND_API_KEY` | Optional | needed only if you want email receipts (Step 6) |
| `STORE_EMAIL` | Optional | where new-order notifications go (defaults to `hello@floradew.in`) |
| `STORE_FROM_EMAIL` | Optional | the "from" address on outgoing mail (Step 6) |

After adding variables: **Site configuration → Deploys → Trigger deploy** to
redeploy so the functions pick them up.

## Step 5 — Add your public Razorpay Key ID to the site
1. Open `index.html`, find:
   ```js
   var RAZORPAY_KEY_ID = 'rzp_test_XXXXXXXXXXXX';
   ```
2. Replace with your real test Key ID (safe to expose — only the Key
   *Secret* must stay hidden)
3. Redeploy

## Step 6 — Turn on email receipts (optional, ~5 minutes)
1. Go to https://resend.com → sign up (free tier covers small stores easily)
2. **API Keys → Create API Key** → copy it into Netlify as `RESEND_API_KEY`
3. Verify a sending domain (**Domains → Add Domain**, e.g. `floradew.in`) so
   you can send from an address like `orders@floradew.in`. Until a domain is
   verified, Resend only lets you send test emails to your own signup
   address — fine for testing, but verify your domain before going live.
4. Set `STORE_FROM_EMAIL` to `Flora Dew <orders@floradew.in>` (or whatever
   address you verified)
5. Set `STORE_EMAIL` to the inbox where you want new-order alerts
6. Redeploy. If `RESEND_API_KEY` isn't set, orders still save correctly —
   you just won't get emails yet.

## Step 7 — View your orders
Visit:
```
https://YOUR-SITE.netlify.app/.netlify/functions/list-orders?secret=YOUR_ADMIN_SECRET
```
(replace with your real site URL and the `ADMIN_SECRET` you set in Step 4).
This returns every order — pending and paid — as JSON: customer name, phone,
email, address, items ordered, and payment status. Bookmark this URL for
day-to-day fulfillment until you want a nicer dashboard.

## Step 8 — Test the full flow
1. Visit your live site → add a product to cart → Checkout with Razorpay
2. Fill in the delivery-details form (any real-looking Indian phone/pincode
   pattern will pass validation) → Continue to payment
3. Razorpay's test mode gives you fake payment methods, e.g.:
   - Card: `4111 1111 1111 1111`, any future expiry, any CVV
   - Or UPI ID: `success@razorpay`
4. You should see a success message, the cart clears, and (if Step 6 is
   done) both you and the test customer get an email
5. Check Step 7's URL — the order should show up with `"status": "paid"`

## Troubleshooting: "Could not list orders" / MissingBlobsEnvironmentError
On some accounts, Netlify's automatic Blobs configuration doesn't reliably
kick in for functions, causing a `MissingBlobsEnvironmentError` in the
function logs even though everything else is set up correctly. The fix is
to configure it explicitly:

1. **Get your Site ID**: your site's dashboard → **Project configuration →
   General → Project details** → copy the **Site ID** (looks like
   `a1b2c3d4-...`)
2. **Create a Personal Access Token**: click your avatar (top-right) →
   **User settings → Applications → Personal access tokens → New access
   token** → name it anything (e.g. "Flora Dew Blobs") → generate → **copy
   it immediately** (it's only shown once)
3. In your site → **Project configuration → Environment variables**, add:
   - `BLOBS_SITE_ID` = the Site ID from step 1
   - `BLOBS_TOKEN` = the Personal Access Token from step 2
4. Redeploy (push any change to GitHub, or use **Deploys → Trigger deploy**
   if your site shows that option)
5. Retest the `list-orders` URL from Step 7 above

The functions already have this fallback built in — they'll use
`BLOBS_SITE_ID`/`BLOBS_TOKEN` automatically once set, and only rely on
auto-detection if those aren't present.

## Step 9 — SEO: point it at your real domain
The SEO tags, sitemap, and structured data currently use
`https://www.floradew.in` as a placeholder domain (matching the site's
existing contact email `hello@floradew.in`). Once your real domain is live:
1. Find-and-replace `https://www.floradew.in` throughout `index.html`,
   `sitemap.xml`, and `robots.txt` with your actual domain
2. Add a real `og-image.jpg` (1200x630px) and `logo.png` at your site root —
   referenced in the Open Graph tags but not yet created (needs your brand
   artwork)
3. Submit your sitemap in **Google Search Console** (search.google.com/search-console)
   -> Add property -> verify ownership -> Sitemaps -> submit `sitemap.xml`
4. Do the same in **Bing Webmaster Tools** for additional reach

## Step 10 — Go live with real payments
1. Once Razorpay approves your KYC, generate **Live** API keys
2. Swap `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in Netlify for the live ones
3. Update `RAZORPAY_KEY_ID` in `index.html` to the live key ID too
4. Redeploy — you're now accepting real payments

---

## Confirmed details already applied
- **Phone/WhatsApp**: +91 78928 34714
- **Instagram**: @flora_dew_official
- **Domain**: floradew.in (used throughout SEO tags, JSON-LD, and email addresses)

## Still not included (say the word and I'll build it next)
- **Inventory/stock tracking** — nothing currently checks or reduces stock
  counts per variant.
- **Courier tracking-link auto-detection** — the tracking page shows the
  courier name and AWB number as text; it doesn't yet auto-generate a
  clickable tracking URL per courier (e.g. Delhivery/BlueDart/India Post
  have different tracking URL formats).
- **"Delivered" confirmation email** — currently only "confirmed" and
  "shipped" trigger customer emails; a delivered notification could be
  added the same way.

## Ongoing deploys (optional but recommended)
Dragging a folder in each time works, but connecting Netlify to a GitHub
repo means every change auto-deploys. Ask if you'd like help setting that up.
