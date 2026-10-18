import { EBAY_FINDING_API, PHP_RATE, DEFAULT_SET_RARITY_TIERS, DEFAULT_RULES } from './constants.js';
import { state } from './state.js';
import { extractFeatures, mlScore } from './ml.js';
import { listingEmbScore } from './embedding.js';


// ── Set / card rarity scoring ─────────────────────────────────────────────────
// Returns a 0–1 continuous score representing how scarce this card is to source.
// Operates entirely on the listing title — no external calls needed.
//
// Tier guide:
//   ~0.92  Ultra-premium set (NT, Flawless, Eminence, One and One) — base cards sell
//   ~0.78  High-end set (Obsidian, Immaculate, Spectra, Impeccable, Noir)
//   ~0.88  Case hit insert from any set (Dreamcatcher, Kaboom, Logoman…)
//   ~0.95  Any 1/1 — case hit or otherwise
//   ~0.55  Mid-tier set (Select, Crown Royale, Contenders Optic…)
//   ~0.28  Mass-produced parallel (Prizm Silver, Optic Holo, Donruss Holo…)
//   ~0.12  Mass-produced base card (plain Prizm, Optic, Donruss, Hoops base)
//   ~0.45  Unknown / unrecognised set — cautious neutral

export function computeSetRarity(title) {
  if (!title) return 0.45;
  const t  = title.toUpperCase();
  const st = state.setRarityTiers || DEFAULT_SET_RARITY_TIERS;
  const hit = (list) => (list || []).some(s => s && t.includes(s.toUpperCase()));

  // ── Step 1: base tier from set name ───────────────────────────────────────────
  // Case hits set base = 0.88 but do NOT return early — print-run boosts still apply.
  // e.g. a Kaboom 1/1 or Logoman 1/1 scores 0.95, not 0.88.
  let base;
  if      (hit(st.caseHits))  base = 0.88;
  else if (hit(st.premium))   base = 0.92;
  else if (hit(st.highEnd))   base = 0.78;
  else if (hit(st.midTier))   base = 0.55;
  else if (hit(st.massBase))  base = hit(st.parallels) ? 0.28 : 0.12;
  else                        base = 0.45;

  // ── Step 2: print-run boost — applied on top of every set tier ────────────
  // A Prizm /5 (5 copies worldwide) should outscore an Obsidian /75 (75 copies).
  // Math.max ensures higher base tiers are never downgraded by this check.
  const isOneOfOne = /\b1\/1\b/.test(title) || t.includes('1 OF 1') || t.includes('ONE OF ONE');
  const isUltraLow = !isOneOfOne && /\/[2-5]\b/.test(title);           // /2 – /5
  const isVeryLow  = !isUltraLow && /\/(6|7|8|9|10)\b/.test(title);   // /6 – /10
  const isLowPrint = !isVeryLow  && /\/(1[1-9]|2[0-5])\b/.test(title);// /11 – /25
  const isNumbered = !isLowPrint && /\/\d+/.test(title);               // /26+

  if (isOneOfOne)  return Math.max(base, 0.95);  // 1/1
  if (isUltraLow)  return Math.max(base, 0.88);  // /2–/5
  if (isVeryLow)   return Math.max(base, 0.80);  // /6–/10
  if (isLowPrint)  return Math.max(base, 0.70);  // /11–/25
  if (isNumbered)  return Math.max(base, 0.58);  // /26+

  return base;
}

export function extractGrade(title) {
  const t = title.toUpperCase();
  if (t.includes('PSA 10')) return 'PSA 10';
  if (t.includes('PSA 9'))  return 'PSA 9';
  if (t.includes('PSA 8'))  return 'PSA 8';
  if (t.includes('PSA 7'))  return 'PSA 7';
  if (t.includes('BGS 9.5')) return 'BGS 9.5';
  if (t.includes('BGS 9'))  return 'BGS 9';
  if (t.includes('SGC 9'))  return 'SGC 9';
  if (t.includes('SGC 8'))  return 'SGC 8';
  return 'raw';
}

export function estimateAesthetic(title, condition) {
  const t = title.toUpperCase();
  let score = 5;
  if (t.includes('PRIZM'))       score += 1.5;
  if (t.includes('CHROME'))      score += 1.2;
  if (t.includes('OPTIC'))       score += 1.0;
  if (t.includes('GOLD'))        score += 1.2;
  if (t.includes('SILVER'))      score += 0.8;
  if (t.includes('HOLO'))        score += 0.8;
  if (t.includes('REFRACTOR'))   score += 1.0;
  if (t.includes('MOSAIC'))      score += 0.5;
  if (t.includes('CRACKED ICE')) score += 0.8;
  if (t.includes('HYPER'))       score += 1.0;
  if (t.includes('RC') || t.includes('ROOKIE')) score += 0.5;
  if (condition === 'Brand New' || condition === 'Like New') score += 0.5;
  return Math.min(10, Math.round(score * 10) / 10);
}

// Detect which player-demand tier a listing belongs to by matching title against
// the user's player category lists.  Returns 'strong'|'middle'|'volatile'|'ph-specific'|null.
export function getPlayerCategory(title, playerCategories) {
  if (!playerCategories || !title) return null;
  const t = title.toUpperCase();
  for (const [cat, players] of Object.entries(playerCategories)) {
    for (const p of players) {
      if (p && t.includes(p.toUpperCase())) return cat;
    }
  }
  return null;
}

// Parse any value to a finite number, or return fallback
function n(val, fallback = 0) {
  const x = parseFloat(val);
  return Number.isFinite(x) ? x : fallback;
}

// Extract the 4-digit season start year from a title (e.g. "2024-25" → "2024").
function extractYear(title) {
  const m = String(title || '').match(/\b(20\d{2})(?:-\d{2})?\b/);
  return m ? m[1] : 'unknown';
}

// Extract the specific parallel name from a title.
// Ordered from most-specific multi-word patterns down to single-word colours.
const PARALLEL_PATTERNS = [
  // Named multi-word parallels
  [/GOLD ICE/,        'gold-ice'],
  [/BLUE ICE/,        'blue-ice'],
  [/RED ICE/,         'red-ice'],
  [/SILVER ICE/,      'silver-ice'],
  [/WHITE ICE/,       'white-ice'],
  [/BLUE SHIMMER/,    'blue-shimmer'],
  [/GOLD SHIMMER/,    'gold-shimmer'],
  [/RED SHIMMER/,     'red-shimmer'],
  [/BLUE WAVE/,       'blue-wave'],
  [/GREEN WAVE/,      'green-wave'],
  [/RED WAVE/,        'red-wave'],
  [/DISCO DAZZLE/,    'disco-dazzle'],
  [/TIGER STRIPE/,    'tiger-stripe'],
  [/CRACKED ICE/,     'cracked-ice'],
  [/KABOOM/,          'kaboom'],
  [/LOGOMAN/,         'logoman'],
  [/PATCH AUTO|RPA/,  'rpa'],
  [/GOLD PRIZM/,      'gold-prizm'],
  [/RED PRIZM/,       'red-prizm'],
  [/BLUE PRIZM/,      'blue-prizm'],
  [/SILVER PRIZM/,    'silver-prizm'],
  [/HYPER PRIZM/,     'hyper-prizm'],
  [/NEON GREEN/,      'neon-green'],
  [/NEON BLUE/,       'neon-blue'],
  // Numbered print runs (treated as their own parallel type)
  [/\b1\/1\b|ONE OF ONE/, '1of1'],
  [/\/[2-9]\b/,       'ultra-low'],
  [/\/[1-2]\d\b/,     'low-print'],
  [/\/\d+/,           'numbered'],
  // Autos (non-patch)
  [/\bAUTO\b|\bAU\b/, 'auto'],
  // Single-word colour parallels
  [/\bGOLD\b/,        'gold'],
  [/\bRED\b/,         'red'],
  [/\bBLUE\b/,        'blue'],
  [/\bGREEN\b/,       'green'],
  [/\bPURPLE\b/,      'purple'],
  [/\bORANGE\b/,      'orange'],
  [/\bPINK\b/,        'pink'],
  [/\bSILVER\b/,      'silver'],
  [/\bHOLO\b/,        'holo'],
  [/\bREFRACTOR\b/,   'refractor'],
  [/\bPRIZM\b/,       'prizm-base'],
  [/\bOPTIC\b/,       'optic-base'],
];

function extractParallel(title) {
  const t = String(title || '').toUpperCase();
  for (const [pattern, label] of PARALLEL_PATTERNS) {
    if (pattern.test(t)) return label;
  }
  return 'base';
}

// Compute market price reference from the already-fetched live listings.
// Groups by (grade + parallel tier) for accurate like-for-like comparison.
// Falls back to grade-only group when a tier group has fewer than 2 items.
// Fetch sold prices from RapidAPI (eBay Average Selling Price) via /api/ebay/sold.
// Uses the key from Settings if there is one; otherwise the server falls back to its
// RAPIDAPI_KEY env var, and returns an error (→ null here) if neither is set.
// Returns byGrade prices keyed to our grade system, or null on failure.
export async function fetchSoldMarketValue(query) {
  try {
    const headers = state.rapidApiKey ? { 'x-rapidapi-key': state.rapidApiKey } : {};
    const resp = await fetch(`/api/ebay/sold?q=${encodeURIComponent(query)}`, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error || !data.weightedMean) return null;
    return { ...data, source: 'rapidapi' };
  } catch (e) {
    console.warn('[sold] error:', e.message);
    return null;
  }
}

export function computeMarketFromListings(listings) {
  if (!listings?.length) return null;

  // Robust weighted mean:
  // 1. IQR outlier removal (Tukey fences) to drop extreme listings
  // 2. Combined weight = time_decay × centrality
  //    - time_decay: 7-day half-life so listings from this week outweigh
  //      stale GTC listings from months ago (e^(-ln2/7 · daysOld))
  //    - centrality: 1/(1+|p - simpleMean|) so prices near the centre
  //      outweigh edge prices within the clean group
  const DECAY = Math.LN2 / 7; // 7-day half-life
  const now   = Date.now();

  const robustMean = (entries) => {
    // entries: [{ price, daysOld }]
    if (!entries.length) return null;
    const prices = entries.map(e => e.price).sort((a, b) => a - b);
    if (prices.length < 2) return prices[0];

    const q1  = prices[Math.floor(prices.length * 0.25)];
    const q3  = prices[Math.floor(prices.length * 0.75)];
    const iqr = q3 - q1;
    const lo  = q1 - 1.5 * iqr;
    const hi  = q3 + 1.5 * iqr;
    const clean = entries.filter(e => e.price >= lo && e.price <= hi);
    if (!clean.length) return prices[Math.floor(prices.length / 2)];

    const simpleMean = clean.reduce((s, e) => s + e.price, 0) / clean.length;

    let sumW = 0, sumWP = 0;
    for (const e of clean) {
      const timeW    = Math.exp(-DECAY * e.daysOld);
      const centralW = 1 / (1 + Math.abs(e.price - simpleMean));
      const w        = timeW * centralW;
      sumW  += w;
      sumWP += w * e.price;
    }
    return sumWP / sumW;
  };

  // Build (grade + parallel) buckets AND grade-only buckets as fallback
  const tierBuckets  = {};   // key: "psa10__silver"
  const gradeBuckets = {};   // key: "psa10"
  const allPrices    = [];

  for (const l of listings) {
    const totalPrice = (l.price || 0) + (l.shippingCost || 0);
    if (totalPrice <= 0) continue;

    const gk       = GRADE_KEY_MAP[l.grade || 'raw'] || 'raw';
    const year     = extractYear(l.title || '');
    const parallel = extractParallel(l.title || '');
    const key      = `${year}__${gk}__${parallel}`;
    const daysOld  = l.listingDate
      ? (now - new Date(l.listingDate).getTime()) / 86_400_000
      : 30; // assume 30 days old if no date

    const isCN  = (l.country || '').toUpperCase() === 'CN';
    const entry = { price: totalPrice, daysOld, isCN };

    if (!tierBuckets[key])   tierBuckets[key]   = [];
    if (!gradeBuckets[gk])   gradeBuckets[gk]   = [];
    tierBuckets[key].push(entry);
    gradeBuckets[gk].push(entry);
    allPrices.push(entry);

    // Store key on listing so ruleMLScore can look it up
    l._marketKey = key;
    l._marketLabel = `${year} · ${parallel}`;
  }

  // Tier means (only for groups with ≥2 listings)
  const byTier = {};
  for (const [key, entries] of Object.entries(tierBuckets)) {
    if (entries.length >= 2) {
      const v = robustMean(entries);
      if (v != null) byTier[key] = Math.round(v * 100) / 100;
    }
  }

  // Grade means (fallback)
  const byGrade = {};
  for (const [gk, entries] of Object.entries(gradeBuckets)) {
    const v = robustMean(entries);
    if (v != null) byGrade[gk] = Math.round(v * 100) / 100;
  }

  const overall = robustMean(allPrices);
  return {
    byTier,
    byGrade,
    weightedMean: overall != null ? Math.round(overall * 100) / 100 : null,
    count: allPrices.length,
    trendDir: 'stable',
    trend: null,
  };
}

// Map listing.grade strings → sold-data grade keys
const GRADE_KEY_MAP = {
  'PSA 10':  'psa10',
  'BGS 9.5': 'bgs9.5',
  'PSA 9':   'psa9',
  'PSA 8':   'psa8',
  'BGS 9':   'bgs9',
  'SGC 10':  'sgc10',
  'SGC 9':   'sgc9',
  'raw':     'raw',
};

export function ruleMLScore(listing, _category, rules, deals, featureWeights, marketData) {
  const title = String(listing?.title || '');
  const price = Math.max(0, n(listing?.price, 0));
  const totalPrice = price + Math.max(0, n(listing?.shippingCost, 0));

  // ── 1. Player tier ─────────────────────────────────────────────────────────
  const cat = getPlayerCategory(title, state.playerCategories);

  // ── 2. minROI — pulled from rules, always a safe number ───────────────────
  const safeRules = (rules && typeof rules === 'object') ? rules : DEFAULT_RULES;
  const catRule   = (cat && safeRules[cat]) || DEFAULT_RULES[cat] || {};
  const minROI    = Math.max(1, n(catRule.minROI, 25));

  // ── 3. Deal-history ROI multiplier ────────────────────────────────────────
  const safeDealsList = Array.isArray(deals) ? deals : [];
  const catDeals = cat ? safeDealsList.filter(d => d?.category === cat) : [];
  const mult = catDeals.length >= 2
    ? 1 + Math.min(1.5, Math.max(0,
        catDeals.reduce((s, d) => s + n(d.roi, 0), 0) / catDeals.length / 100))
    : 1.20;

  // ── 4. ROI signal (0–1) — real market data takes priority ─────────────────
  let marketRoiSignal = null;
  if (marketData && totalPrice > 0) {
    const gk  = GRADE_KEY_MAP[listing?.grade || 'raw'] || 'raw';
    // Prefer exact tier match → grade fallback → overall
    const mv = (listing._marketKey && marketData.byTier?.[listing._marketKey])
             ?? marketData.byGrade?.[gk]
             ?? marketData.weightedMean;
    if (mv && mv > 0) {
      const realRoi = (mv - totalPrice) / totalPrice; // positive = underpriced
      listing.marketValue = Math.round(mv * 100) / 100;
      listing.realRoiPct  = Math.round(realRoi * 100);
      listing.trendDir    = marketData.trendDir  || 'stable';
      listing.trend       = marketData.trend     ?? null;
      // Signal 0–1: scales from 0% upside (signal=0) to 50%+ upside (signal=1)
      marketRoiSignal = Math.min(1, Math.max(0, realRoi / 0.50));
    }
  }

  const roi      = price > 0 ? (mult - 1) * 100 : 20;
  const roiScore = Math.min(1, Math.max(0, roi / minROI));

  // ── 5. Set rarity (0–1) ────────────────────────────────────────────────────
  const rarityScore = computeSetRarity(title);

  // ── 6. Card features ───────────────────────────────────────────────────────
  const features    = extractFeatures(listing);
  const hasPremium  = !!(features.auto  || features.patch || features.logoman || features.rpa);
  const hasTopGrade = !!(features.psa10 || features.bgs10);
  const hasMidGrade = !!(features.psa9  || features.psa8);
  const isPremiumSet = rarityScore >= 0.78;

  // ── 7. Suitability for player tier (0–1) ──────────────────────────────────
  let suitability;
  const isValuable = hasPremium || hasTopGrade || hasMidGrade || isPremiumSet
                  || features.sp || features.ssp || features.oneOfOne;
  if (cat === 'strong')   suitability = isValuable ? 1.0 : 0.82;
  else if (cat === 'middle')   suitability = isValuable ? 1.0 : 0.38;
  else if (cat === 'volatile') suitability = isValuable ? 0.78 : 0.12;
  else if (cat === 'ph-specific') {
    const isDylanRC = title.toUpperCase().includes('DYLAN HARPER') && features.rookie;
    if      (hasPremium)   suitability = 1.0;
    else if (isPremiumSet) suitability = 0.82;
    else if (hasTopGrade)  suitability = 0.72;
    else if (isDylanRC)    suitability = 0.72;
    else if (hasMidGrade)  suitability = 0.55;
    else                   suitability = 0.35;
  }
  else suitability = 0.62;

  // ── 8. Aesthetic boost (small, ±0.05) ─────────────────────────────────────
  const aestheticBoost = Math.min(0.08, Math.max(-0.05, (n(listing?.aestheticScore, 5) - 5) / 50));

  // ── 9. Deal-history boost ─────────────────────────────────────────────────
  let mlBoost = 0;
  if (catDeals.length > 0) {
    const avgROI = catDeals.reduce((s, d) => s + n(d.roi, 0), 0) / catDeals.length;
    mlBoost = Math.min(0.18, (roi / Math.max(1, n(avgROI, 1))) * 0.16);
  }

  // ── 10. Rule composite (suitability + roi + boosts) ────────────────────────
  const roiW    = Math.min(1, Math.max(0, n(state.mlWeights?.roi, 0.6)));
  const ruleRaw = suitability * 0.42
                + roiScore   * (0.50 * roiW / 0.6)
                + mlBoost
                + aestheticBoost;

  // ── 11. ML feature score (0–1) ─────────────────────────────────────────────
  const player       = title.split(/\s+/).slice(0, 3).join(' ');
  const featureScore = n(mlScore(features, featureWeights || null, player), 50) / 100;

  // ── 12. Semantic embedding (optional) ──────────────────────────────────────
  const embScore = listingEmbScore(title, state.embModel); // 0–1 or null

  // ── 13. Blend ──────────────────────────────────────────────────────────────
  let blended;
  if (marketRoiSignal !== null) {
    // Market-data path: real ROI is dominant (45%). Aesthetic + rarity + features fill the rest.
    blended = marketRoiSignal * 0.45   // how much below market price it is
            + suitability    * 0.22    // player-tier desirability
            + rarityScore    * 0.18    // set/print-run scarcity
            + featureScore   * 0.10    // card features (grade, auto, patch…)
            + aestheticBoost           // small ±0.05 visual boost
            + mlBoost;                 // deal-history context
  } else {
    // Rule-only path (no sold data): fall back to original blend
    blended = embScore !== null
      ? ruleRaw * 0.40 + featureScore * 0.25 + embScore * 0.18 + rarityScore * 0.17
      : ruleRaw * 0.45 + featureScore * 0.33 + rarityScore * 0.22;
  }

  const rawScore = Math.min(100, Math.max(0, Math.round(n(blended, 0) * 100)));

  // Cap listings that are at or above market value into skip territory
  if (listing.realRoiPct !== undefined && listing.realRoiPct < 0) {
    return Math.min(rawScore, 28);
  }
  return rawScore;
}

export function scoreVerdict(score) {
  if (score >= 70) return { label: 'buy now',  cls: 'badge-buy' };
  if (score >= 45) return { label: 'consider', cls: 'badge-consider' };
  return              { label: 'skip',      cls: 'badge-skip' };
}

export function toPhp(usd, rate = PHP_RATE) {
  return '₱' + (usd * rate).toLocaleString('en-PH', { maximumFractionDigits: 0 });
}

// Note: In Next.js/Vercel we proxy eBay requests via /api/ebay/search.
// This keeps eBay calls off the browser and avoids CORS issues.
export async function searchEbay(query, category, listingType = 'all', itemLocation = 'us') {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);
  if (listingType && listingType !== 'all') params.set('listingType', listingType);
  if (itemLocation && itemLocation !== 'all') params.set('itemLocation', itemLocation);

  const headers = {};
  if (state.ebayKey)    headers['x-ebay-key']    = state.ebayKey;
  if (state.ebaySecret) headers['x-ebay-secret']  = state.ebaySecret;

  const resp = await fetch(`/api/ebay/search?${params.toString()}`, { headers });
  if (!resp.ok) {
    let message = `eBay proxy error: ${resp.status}`;
    try {
      const data = await resp.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }

  const data = await resp.json();
  return Array.isArray(data?.items) ? data.items : [];
}

// Fetch a single top listing — used by diagnostic to pull real cards
export async function searchEbayQuick(query) {
  const params = new URLSearchParams({ q: query, max: '3' });
  const headers = {};
  if (state.ebayKey)    headers['x-ebay-key']    = state.ebayKey;
  if (state.ebaySecret) headers['x-ebay-secret']  = state.ebaySecret;
  try {
    const resp = await fetch(`/api/ebay/search?${params.toString()}`, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data?.items || [])[0] || null;
  } catch {
    return null;
  }
}

// Keep exported constant for compatibility (not used in client now)
export { EBAY_FINDING_API };

