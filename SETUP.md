# Flora Dew — Complete Site Setup

This folder is the whole website: storefront (`index.html`), SEO files
(`robots.txt`, `sitemap.xml`), and serverless functions that handle payment,
order storage, and email receipts.

```
index.html                            ← the website (shop, cart, checkout form, SEO tags)
admin.html                            ← order dashboard + product manager + store status
robots.txt                            ← tells search engines what to crawl
sitemap.xml                           ← list of pages for search engines
netlify.toml                          ← tells Netlify where the functions live
package.json                          ← dependencies the functions need
netlify/functions/create-order.js     ← creates a Razorpay order + saves the pending order
netlify/functions/verify-payment.js   ← confirms payment, saves it as "paid", emails receipts
netlify/functions/list-orders.js      ← lets you view all saved orders (simple admin view)
netlify/functions/products.js         ← stores/serves the product catalog (name, price, sizes, etc.)
netlify/functions/categories.js       ← stores/serves the catalogue/category list (Soaps, Hair Oil, etc.)
netlify/functions/product-images.js   ← stores/serves up to 8 photos per product (admin uploads)
netlify/functions/site-images.js      ← stores/serves editable Hero/About/Why/Reviews/Footer-logo images
netlify/functions/store-settings.js   ← holiday/closure toggle read by the storefront + create-order
```

## What's new in this update
- **Full product management from the admin panel**: in `admin.html` →
  **Products** tab, you can now add a brand new product, or edit an
  existing one's name, category, badge/tag, description, key ingredients,
  placeholder icon, and any number of size/weight + price variants (e.g.
  "100 g" at ₹99 with an MRP of ₹179) — all without a code deploy. Use
  **+ Add new product** to create one from scratch (save it once to unlock
  photo uploads for it), or **Delete product** to remove one from the shop
  entirely (its saved photos are kept in storage in case you re-add the
  same product later). The storefront (`index.html`) now loads the
  catalog live from the server on every visit, instead of from a
  hardcoded list, and falls back to the original launch catalog if the
  server can't be reached. New function: `netlify/functions/products.js`.
- **Manage catalogues (categories) from the admin panel**: in `admin.html`
  → new **Catalogues** tab, you can add a brand new catalogue (e.g. "Body
  Scrubs"), rename one, reorder them with the ↑/↓ arrows (this controls
  the tab order shown on the shop), or delete one — all without a code
  deploy. A catalogue can't be deleted while any product still uses it,
  to avoid orphaning products; move or delete those products first. The
  **Products** tab's category dropdown, and the storefront's shop tabs,
  now both pull live from this list instead of a hardcoded one. New
  function: `netlify/functions/categories.js`.
- **Cancel an order from the admin panel**: in `admin.html` → **Orders**
  tab, every order that isn't already cancelled or delivered now has a
  **Cancel Order** button (next to Save). Clicking it asks for
  confirmation, marks the order "Cancelled", and automatically emails the
  customer a cancellation notice (if email is set up — Step 6). You can
  also select "Cancelled" directly from the fulfillment-status dropdown
  and hit Save — both do the same thing. Cancelled orders show a red
  "Cancelled" badge, can be filtered in the fulfillment dropdown, and are
  counted in a new "Cancelled" stat card. On `track.html`, a cancelled
  order shows a clear "Order cancelled" message instead of the usual
  progress bar. New function: `netlify/functions/update-order.js` now
  accepts `cancelled` as a fulfillment status.
- **Editable site images (Hero, About Us, Why Natural, Reviews, Footer
  logo)**: in `admin.html` → **Site Images** tab, upload a photo for any
  of these five sections and the live site swaps it in automatically (no
  redeploy needed, same as product photos). Each section falls back to
  its current default look until you upload something:
  - **Hero image** — replaces the illustration next to the homepage
    headline
  - **About Us / Mission image** — shown under the mission statement
  - **Why Natural image** — shown above the four commitment badges
  - **Reviews / Testimonials image** — shown above the review cards
  - **Footer logo** — small mark shown next to "Flora Dew" in the footer
  Photos are resized/compressed in your browser before upload, same as
  product photos. You can also crop a photo right after choosing it —
  reposition, zoom, and pick a suggested aspect ratio, or skip cropping to
  use the original. Click the × on a thumbnail to remove an image and
  revert that section to its default look. New function:
  `netlify/functions/site-images.js`.
- **Product photos**: in `admin.html` → **Products** tab, pick a
  category, then upload photos for any product (drag/select multiple at
  once). Up to **8 images per product**. Each photo opens a crop editor
  first — reposition/zoom/crop to a suggested aspect ratio, or use the
  original as-is — then it's automatically resized (max 1000px, JPEG ~80%
  quality) so uploads stay small and fast. Delete any photo with the × on
  its thumbnail. The storefront (`index.html`) automatically shows the
  real photos (with prev/next arrows if there's more than one) instead of
  the placeholder icon, for any product that has at least one photo
  uploaded. New function: `netlify/functions/product-images.js`.
- **Holiday / temporary store closure**: in `admin.html` → **Store Status**
  tab, flip the toggle to "closed", optionally add a message and an
  expected reopen date, and Save. While closed:
  - the storefront shows a banner above the products and disables "Add to
    cart" + the checkout button (customers can still browse)
  - `create-order.js` also refuses to create new orders **server-side**,
    so the pause holds even if someone already had the checkout form open
  New function: `netlify/functions/store-settings.js`.
- **Returning customers skip re-typing their details**: once someone
  completes a payment, their name/phone/email/address are saved in their
  browser (not on your server). Next time they open the checkout form on
  the same device/browser, it's pre-filled automatically, with a small
  "Not you? Clear saved details" link if someone else is checking out on
  the same device.
- **Razorpay test key already set**: `RAZORPAY_KEY_ID` in `index.html` is
  set to `rzp_test_T9WrTgqzLwOq2z`. You still need to add the matching
  **Key Secret** as `RAZORPAY_KEY_SECRET` in Netlify's environment
  variables (Step 4) — that part can't be pre-filled since it's a private
  key tied to your Razorpay account. If this test key doesn't belong to
  your Razorpay account, generate your own Test Key ID + Secret (Step 2)
  and swap both.

## Previously added
- **Checkout form**: pincode auto-fills city + state (India Post public
  API) as soon as you type a valid 6-digit pincode; state is a proper
  dropdown of all Indian states/UTs.
- **Customer order tracking**: `track.html` lets any customer check their
  order status by entering their Order ID + the email they checked out
  with — no login needed. It shows a Pending → Accepted → Shipped →
  Delivered progress bar, plus courier + tracking number once shipped.
  Linked from the site footer and the post-payment success message.
- **Admin dashboard fulfillment controls**: each order in `admin.html`'s
  Orders tab has an editable fulfillment status (Pending/Accepted/
  Shipped/Delivered) plus courier name + AWB/tracking number fields.
- **Automatic "shipped" email**: the first time you mark an order Shipped
  with a courier + AWB filled in, the customer is automatically emailed
  their tracking details (requires email set up — Step 6).
- `netlify/functions/update-order.js` (admin-only, updates fulfillment
  status) and `netlify/functions/track-order.js` (public, customer-
  verified lookup).

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
This is **already done** — `index.html` currently has:
```js
var RAZORPAY_KEY_ID = 'rzp_test_T9WrTgqzLwOq2z';
```
If this test key isn't from your own Razorpay account, replace it with
your real Test/Live Key ID from Step 2 (safe to expose — only the Key
*Secret* must stay hidden, and that only ever goes into Netlify env vars,
never into `index.html`).

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

## Step 6b — Turn on Zoho Invoice auto-invoicing (optional)
Every time a Razorpay payment is verified, the site can auto-create a Zoho
Invoice for that order and email it to the customer. This is entirely
separate from the Resend receipt email above — the receipt is a quick
"thanks, we got your order" email, the Zoho invoice is the actual GST
invoice document.

You said your account is on Zoho's **India** data center
(`zoho.in` / `zohoapis.in`) and the product is **Zoho Invoice**, so the code
is already set up for that.

1. In the [Zoho API Console](https://api-console.zoho.in), create a
   **Self Client**.
2. Generate an authorization code with scope `ZohoInvoice.fullaccess.all`,
   then exchange it for a refresh token (the Self Client screen in the API
   Console walks you through this, or you can use a one-time curl/Postman
   call to `https://accounts.zoho.in/oauth/v2/token`).
3. In Zoho Invoice, go to **Settings → Organization Profile** to find your
   **Organization ID**.
4. In Zoho Invoice, go to **Settings → Taxes** and make sure every GST
   rate your products use (e.g. 5%, 12%, 18%) is set up there. Your org is
   GST-registered, so Zoho requires a tax (or an exemption) on every
   invoice line item — without a matching rate, invoice creation fails
   with error `110802`.
5. In Netlify, set these five environment variables (you've already added
   the first four; `ZOHO_GST_PERCENTAGE` is new):
   - `ZOHO_CLIENT_ID`
   - `ZOHO_CLIENT_SECRET`
   - `ZOHO_REFRESH_TOKEN`
   - `ZOHO_ORG_ID`
   - `ZOHO_GST_PERCENTAGE` — e.g. `5` (just the number, no `%` sign). This
     is only a **fallback** used for products that don't have their own
     GST rate set (see next step) — it's a safety net so an older product
     doesn't silently block its order's invoice.
6. **Set the GST rate and HSN/SAC code per product.** Since your catalogue
   spans multiple GST slabs, each product now has its own **GST rate (%)**
   and **HSN / SAC code** fields in `admin.html` (Product Manager → edit a
   product). Set the GST rate once per product — it must exactly match a
   rate already configured in Zoho Invoice (step 4); leave it blank to
   fall back to `ZOHO_GST_PERCENTAGE`. The HSN/SAC code is sent as-is to
   Zoho on each invoice line item (`hsn_or_sac`) — leaving it blank just
   means that line item's invoice won't carry a code, which Zoho only
   hard-requires for GST e-invoicing once your turnover crosses the
   government's threshold (currently ₹5 crore). Both fields travel with
   the order at checkout, so changing them later doesn't affect invoices
   already generated.
7. Redeploy the site (Netlify → **Deploys → Trigger deploy**) so the
   functions pick up the new variables and code.
8. Test with a real (or Razorpay test-mode) order. After payment is
   verified:
   - A Zoho **Contact** is created for the customer if one doesn't already
     exist (matched by email).
   - An **Invoice** is created with one line item per cart item, each
     taxed at its product's own GST rate.
   - The invoice is emailed to the customer directly by Zoho.
   - The invoice number appears next to the Order/Payment IDs in
     `admin.html` so you can cross-reference it.
9. If Zoho invoicing isn't configured yet (any of the four core variables
   missing) or the Zoho API call fails for any reason (e.g. a product's
   GST rate doesn't match any rate in Zoho), this step is simply
   skipped — checkout, payment verification, and the Resend receipt email
   all continue to work normally. Check the Netlify function logs
   (**Functions → verify-payment → Logs**) if an invoice doesn't show up
   and you expect one — look for a line starting with
   `createZohoInvoiceForOrder error:`, which includes Zoho's exact error.

**Not yet included, ask if you want it:**
- Marking the Zoho invoice as "paid" automatically (right now it's created
  as a standard sent invoice; recording the Razorpay payment against it in
  Zoho requires an extra `/invoices/{id}/payments` API call).
- A "Resend invoice" button in `admin.html` for cases where the auto-email
  fails or bounces.

## Step 7 — View your orders
The easiest way is `admin.html` on your live site (e.g.
`https://YOUR-SITE.netlify.app/admin.html`) — enter your `ADMIN_SECRET` to
unlock a dashboard with five tabs:
- **Orders** — search/filter, update fulfillment status, export CSV
- **Products** — add, edit, or remove products (name, price, sizes,
  description, photos — see below)
- **Catalogues** — add, rename, reorder, or remove the categories
  products belong to (see below)
- **Site Images** — set the Hero/About/Why/Reviews/Footer-logo photos
- **Store Status** — pause new orders for a holiday/break (see below)

If you ever want the raw JSON instead, you can still visit:
```
https://YOUR-SITE.netlify.app/.netlify/functions/list-orders?secret=YOUR_ADMIN_SECRET
```

### Adding, editing, or removing products
1. Open `admin.html` → **Products** tab
2. To add one: click **+ Add new product**, fill in the name, category,
   badge/tag, description, key ingredients, a placeholder icon (shown
   until you upload a real photo), and at least one size/weight with a
   price and MRP — then **Create product**. You can add more sizes with
   **+ Add size / weight**, or remove one with the × next to it.
3. To edit one: change any field on its card and click **Save changes**.
4. To remove one: click **Delete product** and confirm. This takes it out
   of the shop; any photos already uploaded for it stay in storage, so
   they come back automatically if you re-add a product with the same
   name later.
5. Changes go live on the storefront on next page load — no redeploy
   needed, since the catalog is stored in Netlify Blobs, not in
   `index.html` itself.

### Adding, renaming, reordering, or removing catalogues
Catalogues are the categories products belong to — they show up as the
tabs on the shop (Soaps, Hair Oil, Lip Balms, Lip Colour, and any you add).
1. Open `admin.html` → **Catalogues** tab
2. To add one: type a name in **New catalogue name** and click **+ Add
   catalogue**. It's added at the end of the list.
3. To rename one: change its name field and click **Save**.
4. To reorder: use the ↑/↓ arrows on a row — this changes the order the
   tabs appear in on the shop.
5. To remove one: click **Delete** and confirm. This only works if no
   product currently uses that catalogue — move or delete those products
   first (in the **Products** tab), then remove the catalogue. You always
   need to keep at least one catalogue.
6. Changes go live on the storefront (shop tabs) and in the Products
   tab's category dropdown on next page load — no redeploy needed.

### Uploading product photos
1. Open `admin.html` → **Products** tab (a product must already be saved
   before you can add photos to it)
2. Optionally filter by category, then find the product
3. If the product has more than one size/weight, pick a tag next to the
   file picker: **"All sizes (general)"** (the default — shown for any
   size that doesn't have its own photos) or a specific size. Most
   products can just use general photos; only tag photos to a specific
   size if that size actually looks different (e.g. a gift box vs a
   single bar).
4. Click the file picker and select one or more photos (JPG/PNG) — each
   one opens a quick crop editor first (drag/zoom, choose a suggested
   aspect ratio, or "Use original" to skip cropping), then it's resized
   in your browser automatically, so originals straight from a phone
   camera are fine
5. Up to 8 photos per product (combined across all sizes); delete any
   with the × on its thumbnail, or change which size a photo is tagged
   to any time using the dropdown under its thumbnail
6. The storefront picks these up automatically on next page load — no
   redeploy needed, since photos are stored in Netlify Blobs, not in the
   site's files. On the shop and product page, tapping a different size
   swaps to that size's own photos if it has any, otherwise it just
   keeps showing the general ones.

   One thing to know: photos are tagged by the size's label text (e.g.
   "100 g"), not something more permanent — if you rename a size's label
   later, any photos tagged to the old label stop showing anywhere until
   you re-tag them from the dropdown.

### Pausing orders for a holiday or break
1. Open `admin.html` → **Store Status** tab
2. Flip the toggle to mark the store closed, add a short message customers
   will see (and optionally a reopen date), then **Save store status**
3. The storefront shows your message and disables ordering immediately;
   flip the toggle back off (and Save) whenever you're ready to reopen

## Step 8 — Test the full flow
1. Visit your live site → add a product to cart → Checkout with Razorpay
2. Fill in the delivery-details form (any real-looking Indian phone/pincode
   pattern will pass validation) → Continue to payment
3. Razorpay's test mode gives you fake payment methods, e.g.:
   - Card: `4111 1111 1111 1111`, any future expiry, any CVV
   - Or UPI ID: `success@razorpay`
4. You should see a success message, the cart clears, and (if Step 6 is
   done) both you and the test customer get an email
5. Check Step 7's dashboard — the order should show up with `"status": "paid"`
6. Open the checkout form again (new cart) on the same browser — your
   details should already be filled in

## Troubleshooting: "Could not list orders" / MissingBlobsEnvironmentError
On some accounts, Netlify's automatic Blobs configuration doesn't reliably
kick in for functions, causing a `MissingBlobsEnvironmentError` in the
function logs even though everything else is set up correctly. This also
affects product photos, catalogues, and store status, since they use the same Blobs
storage under the hood. The fix is to configure it explicitly:

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
- **Saved customer details are per-browser, not per-account** — there's no
  login system, so "remembering" a customer works by saving their details
  in that browser's storage after checkout. It won't follow them to a
  different device/browser, and clearing browser data clears it. A real
  account system (email/OTP login with server-side saved addresses) is a
  bigger addition — say the word if you'd like that instead.
- **Automatic reopen date** — the store status toggle has to be flipped
  back to "open" manually; it doesn't auto-reopen on the date you enter
  (that field is just a message shown to customers).

## Ongoing deploys (optional but recommended)
Dragging a folder in each time works, but connecting Netlify to a GitHub
repo means every change auto-deploys. Ask if you'd like help setting that up.
