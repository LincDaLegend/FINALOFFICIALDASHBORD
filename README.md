# Baller — eBay card search

A Next.js app for finding trading-card deals on eBay. It has three pages:

- **Search eBay** — live eBay listings, each with a deal score that compares the price against recent sold prices.
- **Watchlist** — every item you tap **♡ Watchlist** on. If your eBay account is connected, the item is also added to your eBay watchlist.
- **Settings & Data** — API keys, the exchange rate, and data backup.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the keys below
npm run dev                  # http://localhost:3000  (or: npx next dev -p 3001)
```

## API keys

Every key can be set in **either** of two places:

- **On the server**, in `.env.local` locally or in Vercel's environment variables. This is the better option: anyone using the deployment gets working search without typing keys.
- **In the app**, under **Settings & Data**. Those keys are stored in that browser only and override the server's.

| Variable | Needed for | Where to get it |
|---|---|---|
| `EBAY_APP_ID` | Search (required) | [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys) → Production → **App ID (Client ID)** |
| `EBAY_CLIENT_SECRET` | Search (required) | Same page → **Cert ID (Client Secret)** |
| `RAPIDAPI_KEY` | Sold prices (recommended) | See [Sold prices](#sold-prices-rapidapi) below |
| `EBAY_REDIRECT_URI` | Connecting your eBay account (optional) | Your **RuName**, from developer.ebay.com → User Tokens → *Get a Token from eBay via Your Application* |
| `NEXT_PUBLIC_APP_URL` | Connecting your eBay account (optional) | Your site's public URL, e.g. `https://your-app.vercel.app`. Defaults to the current site. |
| `ANTHROPIC_API_KEY` | Optional AI helpers | [console.anthropic.com](https://console.anthropic.com/) |

Search fails with *"eBay App ID and Client Secret are both required"* until both eBay keys are set.

## Sold prices (RapidAPI)

Deal scores are much more accurate when they can compare a listing against what the same card actually sold for. Those prices come from the **eBay Average Selling Price** API on RapidAPI.

1. Sign in at [rapidapi.com](https://rapidapi.com/) (free account).
2. Open [eBay Average Selling Price](https://rapidapi.com/ecommet/api/ebay-average-selling-price), click **Subscribe**, and pick a plan.
3. On the API page, copy the **`X-RapidAPI-Key`** value from the code examples.
4. Put the key in one of these places:
   - **Locally:** add `RAPIDAPI_KEY=your-key` to `.env.local` and restart `npm run dev`.
   - **On Vercel:** Project → Settings → Environment Variables → add `RAPIDAPI_KEY`, then redeploy.
   - **In the app:** Settings & Data → **Sold Prices (RapidAPI)** → paste → **Save Key**.

If no key is set anywhere, search still works, but each listing is only compared with the other live listings.

The request goes through the app's own `/api/ebay/sold` route, so the key is never exposed in the browser when it's set on the server.

## Deploy (Vercel)

1. Import this GitHub repo into Vercel (it detects Next.js automatically).
2. Add the environment variables above, at least `EBAY_APP_ID`, `EBAY_CLIENT_SECRET` and `RAPIDAPI_KEY`.
3. Deploy. Pushing to `main` redeploys.

## Where data lives

The watchlist, settings and older business records are stored in the browser's localStorage, so they're per browser and per device. Use **Settings & Data → Export Data** to back them up, and **Import Data** to move them to another browser.
