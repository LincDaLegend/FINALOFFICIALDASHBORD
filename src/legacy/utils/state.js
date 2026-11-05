import { load, save } from './storage.js';
import { DEFAULT_RULES, DEFAULT_PLAYER_CATEGORIES, DEFAULT_SET_RARITY_TIERS, SAMPLE_DEALS } from './constants.js';

export const state = {
  tab: 'search',

  // Settings
  ebayKey:    load('ebayKey', ''),
  ebaySecret: load('ebaySecret', ''),
  ebayRuName:    load('ebayRuName', ''),
  ebayUser:      load('ebayUser', null),
  ebayToken:     load('ebayToken', null),
  ebayTokenExp:  load('ebayTokenExp', 0),
  ebayRefresh:   load('ebayRefresh', null),
  watchlist:     load('watchlist', []),   // local cache of watched itemIds
  mlFeatureWeights: load('mlFeatureWeights', null), // null = use DEFAULT_WEIGHTS
  phpRate: load('phpRate', 57.2),
  mlWeights: load('mlWeights', { roi: 0.6, speed: 0.4 }),

  // Search
  query: '',
  category: '',
  listingType: 'all',   // 'all' | 'fixed' | 'auction'
  itemLocation: 'us',   // 'all' | 'us'
  results: [],
  loading: false,
  verdictFilter: '',
  searchSort: 'score',  // 'score' | 'price_asc' | 'price_desc' | 'ending'
  notify: null,

  // Deals (ML training data)
  deals: load('deals', SAMPLE_DEALS),

  // Rules (per player-category scoring config)
  rules: load('rules', DEFAULT_RULES),

  // Player category membership — who falls under each demand tier
  playerCategories: load('playerCategories', DEFAULT_PLAYER_CATEGORIES),

  // Set rarity tier membership — which sets/keywords belong to each rarity class
  setRarityTiers: load('setRarityTiers', DEFAULT_SET_RARITY_TIERS),

  // Business dashboard — Google Sheets cache (transient, not persisted)
  sheetsCache: {},      // { sales: {rows,cols,error,loading}, inventory: {...}, summary: {...} }
  salesFilter: 'all',   // status filter for Sales tab

  // Transactions (primary business record — backed up to Google Sheets)
  transactions: load('transactions', []),

  // Budget tracking
  budgets:        load('budgets', []),        // [{ id, name, amount }] — monthly amounts per category
  budgetExpenses: load('budgetExpenses', []), // [{ id, category, amount, note, date }]

  // Google Apps Script web app URL — used for sheet write operations
  gasWriteUrl: load('gasWriteUrl', ''),
  rapidApiKey: load('rapidApiKey', load('scpToken', '')),
  anthropicKey: load('anthropicKey', ''), // Claude API key for AI features (this browser only)

  // Search tools
  targetMarginPct: load('targetMarginPct', 30),
  estShippingPhp:  load('estShippingPhp', 100),

  // New transaction form (transient)
  newTxn: { date: '', client: '', itemSearch: '', selectedItem: null, soldPrice: '' },
  logFormOpen: false,

  // Active subtab within the Player Tiers page (transient — not persisted)
  rulesTab: 'players',  // 'players' | 'sets'

  // New deal form
  newDeal: emptyDeal(),

  // Diagnostic session (transient, not persisted)
  diagnosticSession: null,

  // xlsx import session (transient)
  xlsxImport: null,

  // AI enrichment progress (transient)
  enrichmentProgress: null,

  // Buying segments identified from deal history (persisted)
  segments: load('segments', []),
  editingSegmentIdx: null, // null | number | 'new' — transient, not persisted

  // TensorFlow.js neural network (client-side, not persisted in state — model saves to localStorage via tf.io)
  tfModel: null,
  tfModelReady: false,   // true once model trained on ≥3 deals

  // TF-IDF semantic embedding model (in-memory, rebuilt from deals on startup/import/enrichment)
  embModel: null,        // { idf, topVec, bottomVec } — see utils/embedding.js

  // Diagnostic profile (persisted)
  diagnosticProfile: load('diagnosticProfile', null),

  // Suggested searches from diagnostic or trend analysis (persisted)
  suggestedSearches: load('suggestedSearches', []),
  suggestTrendNote: '',
  suggestLoading: false,

  // Card type preferences (persisted)
  cardPrefs: load('cardPrefs', {
    preferredSets: [],      // e.g. ['Prizm', 'Chrome']
    preferGraded: null,     // true=graded, false=raw
    preferredFinish: null,  // 'refractor'|'holo'|'standard'
    preferStars: null,      // true=established, false=emerging
    preferRare: null,       // true=numbered/SP, false=base
  }),
};

export function emptyDeal() {
  return {
    player: '', year: '', set: '', variant: '',
    grade: 'raw', buyPrice: '', sellPrice: '',
    days: '', category: 'volatile', aesthetic: '', notes: '',
  };
}

export function persistDeals()        { save('deals',          state.deals);          }
export function persistWatchlist()    { save('watchlist',      state.watchlist);      }
export function persistRules()        { save('rules',          state.rules);          }
export function persistTransactions() { save('transactions',   state.transactions);   }
export function persistBudgets() {
  save('budgets',        state.budgets);
  save('budgetExpenses', state.budgetExpenses);
}
export function persistSettings() {
  save('ebayKey',            state.ebayKey);
  save('ebaySecret',         state.ebaySecret);
  save('ebayRuName',    state.ebayRuName);
  save('ebayUser',      state.ebayUser);
  save('ebayToken',     state.ebayToken);
  save('ebayTokenExp',  state.ebayTokenExp);
  save('ebayRefresh',   state.ebayRefresh);
  save('phpRate',            state.phpRate);
  save('mlWeights',          state.mlWeights);
  save('cardPrefs',          state.cardPrefs);
  save('mlFeatureWeights',   state.mlFeatureWeights);
  save('diagnosticProfile',  state.diagnosticProfile);
  save('suggestedSearches',  state.suggestedSearches);
  save('segments',           state.segments);
  save('playerCategories',   state.playerCategories);
  save('setRarityTiers',     state.setRarityTiers);
  save('gasWriteUrl',        state.gasWriteUrl);
  save('rapidApiKey',        state.rapidApiKey);
  save('anthropicKey',       state.anthropicKey);
  save('targetMarginPct',    state.targetMarginPct);
  save('estShippingPhp',     state.estShippingPhp);
}

export function dealStats() {
  const d = state.deals;
  if (!d.length) return { count: 0, avgROI: 0, avgDays: 0, totalProfit: 0 };
  return {
    count:       d.length,
    avgROI:      +(d.reduce((a, x) => a + (x.roi || 0), 0) / d.length).toFixed(1),
    avgDays:     +(d.reduce((a, x) => a + (x.days || 0), 0) / d.length).toFixed(1),
    totalProfit: +d.reduce((a, x) => a + ((x.sellPrice - x.buyPrice) || 0), 0).toFixed(2),
  };
}
