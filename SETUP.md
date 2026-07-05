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

## What's new vs. the last version
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
- **Order status updates to the customer** (e.g. "shipped" email) — right
  now only the initial payment receipt is sent.
- **A polished admin dashboard** — Step 7 gives you raw JSON; a proper page
  with a table/search/filter is a natural next step once order volume grows.

## Ongoing deploys (optional but recommended)
Dragging a folder in each time works, but connecting Netlify to a GitHub
repo means every change auto-deploys. Ask if you'd like help setting that up.
