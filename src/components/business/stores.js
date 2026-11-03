import { useSyncExternalStore } from 'react';
import { state, persistSettings } from '../../legacy/utils/state.js';
import { remove } from '../../legacy/utils/storage.js';
import {
  searchEbay, fetchSoldMarketValue, computeMarketFromListings, ruleMLScore, scoreVerdict,
} from '../../legacy/utils/api.js';
import { DEFAULT_RULES, SAMPLE_DEALS, DEFAULT_PLAYER_CATEGORIES } from '../../legacy/utils/constants.js';
import { buildEmbeddingModel } from '../../legacy/utils/embedding.js';

// Tiny observable store: components re-render when it changes
function createStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(patch) {
      value = { ...value, ...(typeof patch === 'function' ? patch(value) : patch) };
      listeners.forEach(l => l());
    },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  };
}
const useStore = (store) => useSyncExternalStore(store.subscribe, store.get, store.get);

// ─── Settings ────────────────────────────────────────────────────────────────
// Lives in the scoring code's own state (persisted to localStorage), so search uses it directly.

const SETTING_KEYS = ['ebayKey', 'ebaySecret', 'rapidApiKey', 'phpRate', 'targetMarginPct', 'estShippingPhp'];
const readSettings = () => Object.fromEntries(SETTING_KEYS.map(k => [k, state[k]]));

export const settingsStore = createStore(readSettings());

export function updateSettings(patch) {
  Object.assign(state, patch);
  persistSettings();
  if ('rapidApiKey' in patch) remove('scpToken'); // old SportsCardsPro token would otherwise be reused
  settingsStore.set(readSettings());
}

export const useSettings = () => useStore(settingsStore);

// ─── Verdicts ────────────────────────────────────────────────────────────────

export const VERDICTS = {
  buy:      { label: 'Buy',      text: 'Good price',  tone: 'green' },
  consider: { label: 'Consider', text: 'Maybe',       tone: 'orange' },
  skip:     { label: 'Skip',     text: 'Too pricey',  tone: 'red' },
};

// scoreVerdict() returns 'buy now' / 'consider' / 'skip' (cut-offs 70 / 45)
export const verdictOf = (score) => {
  const label = scoreVerdict(score || 0).label;
  return label === 'buy now' ? 'buy' : label;
};

/** What you'd pay landed in pesos, and what to sell for to hit the profit goal. */
export function pricing(listing, s) {
  const usd = (listing.price || 0) + (listing.shippingCost || 0);
  const costPhp = usd * (s.phpRate || 57.2);
  const margin = s.targetMarginPct ?? 30;
  const ship = s.estShippingPhp ?? 100;
  return {
    usd,
    costPhp,
    sellPhp: costPhp * (1 + margin / 100) + ship,
    profitPhp: costPhp * (margin / 100),
  };
}

// ─── Search ──────────────────────────────────────────────────────────────────

export const RESULTS_BATCH = 30;

export const searchStore = createStore({
  query: '',
  listingType: 'all',   // 'all' | 'fixed' | 'auction'
  usOnly: true,
  status: 'idle',       // 'idle' | 'loading' | 'done' | 'error'
  error: '',
  results: [],
  market: null,
  verdict: 'all',       // 'all' | 'buy' | 'consider' | 'skip'
  sort: 'score',        // 'score' | 'price_asc' | 'price_desc' | 'ending'
  showCount: RESULTS_BATCH,
  sample: false,
});

export const useSearch = () => useStore(searchStore);

let runId = 0;

/** Same steps as the original search tab: listings + sold prices → score → drop overpriced → rank. */
export async function runSearch(rawQuery) {
  const query = rawQuery.trim();
  if (!query) return;
  const id = ++runId; // a newer search makes this one's results irrelevant
  const { listingType, usOnly } = searchStore.get();
  searchStore.set({ query, status: 'loading', error: '', verdict: 'all', showCount: RESULTS_BATCH, sample: false });

  // The original app built this similarity model from the deal log at start-up; scoring uses it
  if (!state.embModel && state.deals?.length >= 2) state.embModel = buildEmbeddingModel(state.deals);
  if (!state.playerCategories) state.playerCategories = DEFAULT_PLAYER_CATEGORIES;

  try {
    const [listings, sold] = await Promise.all([
      searchEbay(query, '', listingType, usOnly ? 'us' : 'all'),
      fetchSoldMarketValue(query),
    ]);
    const market = sold || computeMarketFromListings(listings);

    const words = query.toUpperCase().split(/\s+/).filter(Boolean);
    const relevant = listings.filter(l => words.every(w => l.title.toUpperCase().includes(w)));
    for (const l of relevant) {
      try {
        const s = ruleMLScore(l, null, state.rules || DEFAULT_RULES, state.deals || SAMPLE_DEALS, state.mlFeatureWeights || null, market);
        l.aiScore = Number.isFinite(s) ? s : 0;
      } catch {
        l.aiScore = 0;
      }
    }
    // With enough sold data, drop listings priced more than 25% above market
    const kept = market?.count >= 3 ? relevant.filter(l => l.realRoiPct === undefined || l.realRoiPct >= -25) : relevant;

    if (id !== runId) return;
    searchStore.set({
      status: 'done',
      results: kept.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)),
      market: sold ? { price: sold.weightedMean, count: sold.count, trend: sold.trend, fromSales: true }
                   : market?.weightedMean ? { price: market.weightedMean, count: market.count, fromSales: false } : null,
      fetched: listings.length,
    });
  } catch (e) {
    if (id !== runId) return;
    searchStore.set({ status: 'error', error: e.message || String(e) });
  }
}

export function setSearchOption(patch, rerun = true) {
  searchStore.set({ ...patch, showCount: RESULTS_BATCH });
  const s = searchStore.get();
  if (rerun && s.query && !s.sample && s.status !== 'idle') runSearch(s.query);
}

// ─── Practice cards (no keys needed) ─────────────────────────────────────────

const SAMPLE_CARDS = [
  { title: '2023-24 Panini Prizm Victor Wembanyama Silver Prizm RC #136', price: 89, shippingCost: 4.5, aiScore: 82, marketValue: 128, realRoiPct: 37, grade: 'raw', buyingOption: 'FIXED_PRICE' },
  { title: '2023-24 Panini Prizm LeBron James Silver Prizm #1 PSA 10', price: 140, shippingCost: 0, aiScore: 58, marketValue: 155, realRoiPct: 11, grade: 'PSA 10', buyingOption: 'AUCTION', endsInMin: 95 },
  { title: '2022-23 Donruss Stephen Curry Base #1', price: 6.99, shippingCost: 1.25, aiScore: 24, marketValue: 3, realRoiPct: -64, grade: 'raw', buyingOption: 'FIXED_PRICE' },
];

export function loadSampleCards() {
  runId++; // cancel any search in flight
  searchStore.set({
    query: '',
    status: 'done',
    error: '',
    sample: true,
    verdict: 'all',
    showCount: RESULTS_BATCH,
    market: { price: 121, count: 14, fromSales: true, sample: true },
    results: SAMPLE_CARDS.map((c, i) => ({
      ...c,
      itemId: `demo-${i + 1}`,
      imgUrl: '',
      // a real eBay search for the same card, so the link never goes nowhere
      viewUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(c.title)}`,
      condition: c.grade === 'raw' ? 'Ungraded' : 'Graded',
      endTime: c.endsInMin ? new Date(Date.now() + c.endsInMin * 60000).toISOString() : null,
    })),
  });
}

export function clearSearch() {
  runId++;
  searchStore.set({ query: '', status: 'idle', results: [], market: null, sample: false, error: '' });
}
