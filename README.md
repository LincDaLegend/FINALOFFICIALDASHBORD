# Baller — eBay card search

A Next.js app for finding basketball-card deals on eBay, designed after Apple's interface guidelines (system font, light/dark, translucent bars, spring motion). It has four pages:

- **Get Started** — three setup steps that tick themselves off, how to read a result, and sample cards to practise on.
- **Find Cards** — live eBay listings ranked best deal first. Each shows Buy / Consider / Skip and the price in pesos; tap one for what to sell it for, your profit, and how it compares with recent sold prices.
- **Watchlist** — every card you tap the heart on, saved in this browser. Swipe left (or use the trash button) to delete, with Undo.
- **Settings** — eBay and RapidAPI keys, your pricing (profit goal, shipping, exchange rate), and backup/restore.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the keys below
npm run dev                  # http://localhost:3000  (or: npx next dev -p 3001)
```

## API keys

Every key can be set in **either** of two places:

- **On the server**, in `.env.local` locally or in Vercel's environment variables. This is the better option: anyone using the deployment gets working search without typing keys.
- **In the app**, under **Settings**. Those keys are stored in that browser only and override the server's.

| Variable | Needed for | Where to get it |
|---|---|---|
| `EBAY_APP_ID` | Search (required) | [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys) → Production → **App ID (Client ID)** |
| `EBAY_CLIENT_SECRET` | Search (required) | Same page → **Cert ID (Client Secret)** |
| `RAPIDAPI_KEY` | Sold prices (recommended) | See [Sold prices](#sold-prices-rapidapi) below |
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
   - **In the app:** Settings → **Sold Prices** → paste the key (it saves when you leave the field).

If no key is set anywhere, search still works, but each listing is only compared with the other live listings.

The request goes through the app's own `/api/ebay/sold` route, so the key is never exposed in the browser when it's set on the server.

## Deploy (Vercel)

1. Import this GitHub repo into Vercel (it detects Next.js automatically).
2. Add the environment variables above, at least `EBAY_APP_ID`, `EBAY_CLIENT_SECRET` and `RAPIDAPI_KEY`.
3. Deploy. Pushing to `main` redeploys.

## Where data lives

The watchlist, settings and older business records are stored in the browser's localStorage, so they're per browser and per device. Use **Settings → Download Backup** to back them up, and **Restore from Backup** to move them to another browser.
