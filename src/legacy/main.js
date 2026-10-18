import { state, persistTransactions, persistBudgets } from './utils/state.js';
import { addToWatchlist, removeFromWatchlist, markSynced, getWatchedIds, WATCHLIST_EVENT } from './utils/watchlist.js';
import { buildModel, loadModel, trainOnDeals, saveModel } from './utils/tfModel.js';
import { buildEmbeddingModel } from './utils/embedding.js';
import { renderSearch, doSearch } from './components/Search.js';
import { renderRules, setRulesTab, updateCatROI, addPlayer, removePlayer, addSetToTier, removeSetFromTier, resetAllConfig, setMLWeight } from './components/Rules.js';
import {
  renderSettings, saveEbayKey, clearEbayKey,
  updateRate, exportAllData, importDataPrompt, nukeAllData, saveGasUrl, saveRapidApiKey,
} from './components/Settings.js';
import { renderBusinessSummary } from './components/BusinessSummary.js';
import { renderSalesLog } from './components/SalesLog.js';
import { renderInventory } from './components/Inventory.js';
import { renderHeldOrders } from './components/HeldOrders.js';
import { renderBudget } from './components/Budget.js';

const ICONS = {
  search:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>`,
  deals:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h4"/></svg>`,
  rules:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`,
  settings:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  summary:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
  sales:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  inventory: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  held:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
};

const CROWN_SVG = `<svg viewBox="0 0 22 26" fill="white" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="3.8" r="2.8"/>
  <path d="M8 7C7 8 6 11 6.5 15L10.5 15L10 22L14 22L13.5 15L17 14C17 11 15.5 8 14 7Q13 6.2 12 6.2Q10 6.2 8 7Z"/>
  <path d="M17 10L20.5 7.5L21.5 9.8L18.5 12.5Z"/>
  <circle cx="21.5" cy="6.5" r="2.2"/>
  <path d="M10 22L8.5 26L11 26L12 24Z"/>
  <path d="M14 22L15.5 26L13 26L12 24Z"/>
</svg>`;

const ICONS_EXTRA = {
  budget: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
};
Object.assign(ICONS, ICONS_EXTRA);

const NAV = [
  { id: 'search',    label: 'Search',       icon: 'search',    section: null },
  { id: 'summary',   label: 'Summary',      icon: 'summary',   section: 'Business' },
  { id: 'sales',     label: 'Sales',        icon: 'sales',     section: null },
  { id: 'inventory', label: 'Inventory',    icon: 'inventory', section: null },
  { id: 'held',      label: 'Held Orders',  icon: 'held',      section: null },
  { id: 'budget',    label: 'Budget',       icon: 'budget',    section: null },
  { id: 'rules',     label: 'Player Tiers', icon: 'rules',     section: 'Config' },
  { id: 'settings',  label: 'Settings',     icon: 'settings',  section: null },
];

function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;

  const PAGE_TITLES = {
    search: 'Search', summary: 'Summary', sales: 'Sales',
    inventory: 'Inventory', held: 'Held Orders', budget: 'Expenses',
    rules: 'Player Tiers', settings: 'Settings',
  };

  app.innerHTML = `
    <div class="app-body">
      <nav class="sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">${CROWN_SVG}</div>
          <div>
            <div class="logo-name">Baller</div>
            <div class="logo-sub">Business</div>
          </div>
        </div>

        <div class="sidebar-nav">
          ${NAV.map(n => `
            <button class="nav-item ${state.tab === n.id ? 'active' : ''}" onclick="window.setTab('${n.id}')">
              <span class="nav-icon">${ICONS[n.icon]}</span>
              <span>${n.label}</span>
              ${n.id === 'held' ? `<span class="nav-count">0</span>` : ''}
            </button>
          `).join('')}
        </div>
      </nav>

      <div class="main-area">
        <div class="top-bar">
          <div class="top-bar-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search…" />
          </div>
          <div class="top-bar-actions">
            <button class="top-bar-btn">Sync</button>
            <div class="top-bar-avatar">B</div>
          </div>
        </div>

        <main class="main-content">
          ${renderPage()}
        </main>
      </div>
    </div>

    <nav class="mobile-nav">
      ${NAV.map(n => `
        <button class="mobile-nav-item ${state.tab === n.id ? 'active' : ''}" onclick="window.setTab('${n.id}')">
          <span class="mobile-nav-icon">${ICONS[n.icon]}</span>
          <span>${n.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function renderPage() {
  switch (state.tab) {
    case 'search':    return renderSearch();
    case 'summary':   return renderBusinessSummary();
    case 'sales':     return renderSalesLog();
    case 'inventory': return renderInventory();
    case 'held':      return renderHeldOrders();
    case 'budget':    return renderBudget();
    case 'rules':     return renderRules();
    case 'settings':  return renderSettings();
    default:          return renderSearch();
  }
}

window.renderApp = renderApp;

// Map of tab → sheet key (for auto-loading on tab switch)
const SHEET_TABS = {
  summary:   'summary',
  sales:     'sales',
  inventory: 'inventory',
  held:      'sales',   // held orders reuse sales data
};

window.setTab = (tab) => {
  state.tab    = tab;
  state.notify = null;
  renderApp();
  window.scrollTo(0, 0);
  // Auto-load sheet data if not already cached
  const sheetKey = SHEET_TABS[tab];
  if (sheetKey && !state.sheetsCache[sheetKey]?.rows && !state.sheetsCache[sheetKey]?.loading) {
    window.loadSheetTab(sheetKey);
  }
};

// Sheet configs: key → { sheet name, optional range }
const SHEET_CONFIG = {
  summary:   { sheet: 'Summary 2026',  range: 'B22:J35' },
  sales:     { sheet: 'Baller Sales',  range: '' },
  inventory: { sheet: 'Baller Inventory', range: '' },
};

window.loadSheetTab = async (key) => {
  const cfg = SHEET_CONFIG[key];
  if (!cfg) return;
  if (!state.sheetsCache) state.sheetsCache = {};
  state.sheetsCache[key] = { ...(state.sheetsCache[key] || {}), loading: true, error: null };
  window.renderApp();
  try {
    const params = new URLSearchParams({ sheet: cfg.sheet });
    if (cfg.range) params.set('range', cfg.range);
    const resp = await fetch(`/api/sheets?${params}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    state.sheetsCache[key] = { rows: data.rows, cols: data.cols, loading: false, error: null };
  } catch (e) {
    state.sheetsCache[key] = { ...(state.sheetsCache[key] || {}), loading: false, error: e.message };
  }
  window.renderApp();
};

window.setSalesFilter = (f) => {
  state.salesFilter = f;
  window.renderApp();
};

window.toggleLogForm = () => {
  state.logFormOpen = !state.logFormOpen;
  window.renderApp();
};

window.setTargetMargin = (val) => {
  state.targetMarginPct = parseInt(val) || 0;
  import('./utils/state.js').then(({ persistSettings }) => persistSettings());
  window.renderApp();
};

window.setEstShipping = (val) => {
  state.estShippingPhp = parseFloat(val) || 0;
  import('./utils/state.js').then(({ persistSettings }) => persistSettings());
  window.renderApp();
};

window.setExpenseCatFilter = (f) => {
  state.expenseCatFilter = f;
  window.renderApp();
};

window.expenseSearch = (val) => {
  state.expenseSearch = val;
  window.renderApp();
};

window.setVerdictFilter = (v) => {
  state.verdictFilter = state.verdictFilter === v ? '' : v;
  renderApp();
};

window.setSearchSort = (v) => {
  state.searchSort = v;
  renderApp();
};

// Search
window.doSearch = doSearch;
window.setListingType  = (v) => { state.listingType  = v; renderApp(); };
window.setItemLocation = (v) => { state.itemLocation = v; renderApp(); };

// ── Transaction form ──────────────────────────────────────────────────────────
window.txnSet = (field, val) => {
  if (!state.newTxn) state.newTxn = {};
  state.newTxn[field] = val;
};

window.txnSearch = (val) => {
  if (!state.newTxn) state.newTxn = {};
  state.newTxn.itemSearch  = val;
  state.newTxn.selectedItem = null;
  window.renderApp();
};

window.txnSelectItem = (idx) => {
  const rows = state.sheetsCache?.inventory?.rows || [];
  const query = state.newTxn?.itemSearch || '';
  const matches = rows.filter(r =>
    String(r['Item Name'] || r['Item'] || '').toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);
  if (!matches[idx]) return;
  state.newTxn.selectedItem = matches[idx];
  state.newTxn.itemSearch   = matches[idx]['Item Name'] || matches[idx]['Item'] || '';
  window.renderApp();
  setTimeout(() => document.querySelector('input[type="number"][placeholder="0"]')?.focus(), 50);
};

window.txnClearItem = () => {
  state.newTxn.selectedItem = null;
  state.newTxn.itemSearch   = '';
  window.renderApp();
  setTimeout(() => document.getElementById('txn-item-input')?.focus(), 50);
};

window.submitTransaction = async () => {
  const txn = state.newTxn || {};
  const sel  = txn.selectedItem;
  const soldPrice = parseFloat(String(txn.soldPrice || '0').replace(/[₱,]/g, '')) || 0;

  if (!sel) {
    state.txnError = 'Select an item from inventory.';
    window.renderApp(); return;
  }
  if (!soldPrice) {
    state.txnError = 'Enter a sold price.';
    window.renderApp(); return;
  }

  state.txnError    = null;
  state.txnSubmitting = true;
  window.renderApp();

  const itemName = sel['Item Name'] || sel['Item'] || '';
  const cost     = parseFloat(String(sel['Cost'] || '0').replace(/[₱,]/g, '')) || 0;
  const profit   = soldPrice - cost;
  const date     = txn.date || new Date().toISOString().slice(0, 10);
  const client   = (txn.client || '').trim();

  const record = {
    id:        String(Date.now()),
    date,
    client,
    item:      itemName,
    cost,
    soldPrice,
    profit,
  };

  // Save locally
  if (!state.transactions) state.transactions = [];
  state.transactions.push(record);
  persistTransactions();

  // Sync to Google Sheet if configured
  if (state.gasWriteUrl) {
    try {
      // 1. Append to Baller Sales
      await fetch('/api/sheets/write', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          gasUrl: state.gasWriteUrl,
          action: 'append',
          sheet:  'Baller Sales',
          row:    [date, itemName, client, cost, soldPrice, soldPrice - cost, ''],
        }),
      });
      // 2. Mark item as Sold in Baller Inventory
      await fetch('/api/sheets/write', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          gasUrl:   state.gasWriteUrl,
          action:   'updateRow',
          sheet:    'Baller Inventory',
          matchCol: 'Item Name',
          matchVal: itemName,
          updates:  [
            { col: 'Target Price', val: soldPrice },
            { col: 'Status',       val: 'Sold'    },
          ],
        }),
      });
    } catch (e) {
      console.warn('[sheets write]', e);
    }
  }

  // Reset form
  state.newTxn       = { date: new Date().toISOString().slice(0, 10), client: '', itemSearch: '', selectedItem: null, soldPrice: '' };
  state.txnSubmitting = false;
  state.notify        = { type: 'ok', msg: `Transaction logged: ${itemName}` };
  window.renderApp();
};

window.removeTransaction = (id) => {
  state.transactions = (state.transactions || []).filter(t => t.id !== id);
  persistTransactions();
  window.renderApp();
};

window.resetTransactions = () => {
  if (!confirm('Clear all local sales transactions? This only removes data from this device — your Google Sheet is not affected.')) return;
  state.transactions = [];
  state.sheetsCache = { ...state.sheetsCache, sales: undefined };
  persistTransactions();
  state.notify = { type: 'ok', msg: 'Sales data cleared.' };
  window.renderApp();
};

window.resetInventory = () => {
  if (!confirm('Clear cached inventory data? This only clears the local cache — your Google Sheet is not affected.')) return;
  state.sheetsCache = { ...state.sheetsCache, inventory: undefined };
  state.notify = { type: 'ok', msg: 'Inventory cache cleared.' };
  window.renderApp();
};

// Exact column layout for each sheet tab
const SHEET_HEADERS = {
  'Baller Sales':      ['Date', 'Item Name', 'Buyer', 'Cost (PHP)', 'Sale Price (PHP)', 'Profit (PHP)', 'Notes'],
  'Baller Inventory':  ['Item Name', 'Category', 'Grade', 'Date Acquired', 'Seller', 'Buy Price', 'Fees', 'Shipping In', 'Total Cost', 'Target Price', 'Notes', 'Status'],
};

window.initSheet = async (sheetName) => {
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) { alert('Unknown sheet: ' + sheetName); return; }
  if (!state.gasWriteUrl) { alert('Set your Google Apps Script URL in Settings first.'); return; }
  try {
    const resp = await fetch('/api/sheets/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasUrl: state.gasWriteUrl, action: 'initSheet', sheet: sheetName, headers }),
    });
    const data = await resp.json();
    state.notify = data.ok
      ? { type: 'ok',  msg: `✓ "${sheetName}" tab created with headers.` }
      : { type: 'err', msg: data.error || 'Failed to create sheet.' };
  } catch (e) {
    state.notify = { type: 'err', msg: 'Network error: ' + e.message };
  }
  window.renderApp();
};

// Import existing sheet rows as transactions (one-time migration)
window.importTransactionsFromSheet = () => {
  const { rows, cols } = state.sheetsCache?.sales || {};
  if (!rows?.length) {
    state.notify = { type: 'err', msg: 'No sheet data loaded — click "Load Sheet Data" first.' };
    window.renderApp(); return;
  }
  const parseMoney = v => parseFloat(String(v || '0').replace(/[₱,]/g, '')) || 0;
  // Baller Sales layout: Date(0) | Item Name(1) | Buyer(2) | Cost PHP(3) | Sale Price PHP(4) | Profit PHP(5) | Notes(6)
  const imported = rows.map((r, i) => {
    const dateRaw = r['Date']             || r[cols?.[0]] || '';
    const item    = r['Item Name']        || r['Item']    || r[cols?.[1]] || '';
    const buyer   = r['Buyer']            || r['Client']  || r[cols?.[2]] || '';
    const costRaw = r['Cost (PHP)']       || r['Cost']    || r[cols?.[3]] || '';
    const soldRaw = r['Sale Price (PHP)'] || r['Sale']    || r['Sold Price'] || r[cols?.[4]] || '';
    const cost      = parseMoney(costRaw);
    const soldPrice = parseMoney(soldRaw);
    return {
      id:        String(Date.now() + i),
      date:      dateRaw,
      client:    buyer,
      item,
      cost,
      soldPrice,
      profit:    soldPrice - cost,
      imported:  true,
    };
  });
  state.transactions = [...imported, ...(state.transactions || [])];
  persistTransactions();
  state.notify = { type: 'ok', msg: `Imported ${imported.length} rows from sheet.` };
  window.renderApp();
};

// ── Budget ────────────────────────────────────────────────────────────────────
window.addBudget = () => {
  const nameInput = document.getElementById('budget-cat-input');
  const amtInput  = document.getElementById('budget-amt-input');
  const name   = (nameInput?.value || '').trim();
  const amount = parseFloat(amtInput?.value || '0') || 0;
  if (!name || !amount) { return; }
  if ((state.budgets || []).some(b => b.name === name)) {
    state.notify = { type: 'err', msg: `Budget for "${name}" already exists.` };
    window.renderApp(); return;
  }
  if (!state.budgets) state.budgets = [];
  state.budgets.push({ id: String(Date.now()), name, amount });
  persistBudgets();
  if (nameInput) nameInput.value = '';
  if (amtInput)  amtInput.value  = '';
  window.renderApp();
};

window.removeBudget = (id) => {
  state.budgets = (state.budgets || []).filter(b => b.id !== id);
  persistBudgets();
  window.renderApp();
};

window.addBudgetExpense = () => {
  const catSel   = document.getElementById('expense-cat-select');
  const amtInput = document.getElementById('expense-amt-input');
  const noteInput = document.getElementById('expense-note-input');
  const dateInput = document.getElementById('expense-date-input');
  const category = catSel?.value || '';
  const amount   = parseFloat(amtInput?.value || '0') || 0;
  if (!category || !amount) return;
  if (!state.budgetExpenses) state.budgetExpenses = [];
  state.budgetExpenses.push({
    id:       String(Date.now()),
    category,
    amount,
    note:     (noteInput?.value || '').trim(),
    date:     dateInput?.value || new Date().toISOString().slice(0, 10),
  });
  persistBudgets();
  if (amtInput)  amtInput.value  = '';
  if (noteInput) noteInput.value = '';
  window.renderApp();
};

window.removeBudgetExpense = (id) => {
  state.budgetExpenses = (state.budgetExpenses || []).filter(e => e.id !== id);
  persistBudgets();
  window.renderApp();
};

// Scoring config (Rules tab)
window.setRulesTab        = setRulesTab;
window.updateCatROI       = updateCatROI;
window.addPlayer          = addPlayer;
window.removePlayer       = removePlayer;
window.addSetToTier       = addSetToTier;
window.removeSetFromTier  = removeSetFromTier;
window.resetAllConfig     = resetAllConfig;
window.setMLWeight        = setMLWeight;

// Only the id is passed from the button — titles can contain quotes that break inline onclick handlers.
window.toggleWatch = async (itemId) => {
  const listing = (state.results || []).find(r => r.itemId === itemId) || { itemId };
  const title   = listing.title || 'item';
  const already = getWatchedIds().includes(itemId);

  if (already) {
    // Removed locally only (eBay has no removeFromWatchlist API)
    removeFromWatchlist(itemId);
    state.watchlist = getWatchedIds();
    state.notify = { type: 'ok', msg: `Removed from watchlist: ${title}` };
    window.renderApp();
    return;
  }

  // Add locally first so UI responds immediately
  addToWatchlist(listing);
  state.watchlist = getWatchedIds();
  window.renderApp();

  // Sync to eBay if user token is available
  if (state.ebayToken) {
    try {
      const resp = await fetch('/api/ebay/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, userToken: state.ebayToken, appId: state.ebayKey }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `eBay error ${resp.status}`);
      }
      markSynced(itemId);
      state.notify = { type: 'ok', msg: `♥ Added to your watchlist and your eBay watchlist: ${title}` };
    } catch (err) {
      state.notify = { type: 'err', msg: `Added to your watchlist — eBay sync failed: ${err.message}` };
    }
  } else {
    state.notify = { type: 'ok', msg: `♥ Added to your watchlist. Connect eBay in Settings to also sync it to eBay.` };
  }
  window.renderApp();
};

// Removing an item on the Watchlist page updates the hearts on search results too.
window.addEventListener(WATCHLIST_EVENT, () => { state.watchlist = getWatchedIds(); });

// Settings
window.placeBid = async (itemId, title) => {
  const input = document.getElementById(`bid-${itemId}`);
  const maxBid = parseFloat(input?.value);
  if (!maxBid || maxBid <= 0) {
    state.notify = { type: 'err', msg: 'Enter a valid max bid amount.' };
    window.renderApp();
    return;
  }
  if (!state.ebayToken) {
    state.notify = { type: 'err', msg: 'Connect your eBay account in Settings first.' };
    window.renderApp();
    return;
  }
  state.notify = { type: 'info', msg: `Placing bid on "${title.slice(0, 40)}..."` };
  window.renderApp();
  try {
    const resp = await fetch('/api/ebay/bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, maxBid, userToken: state.ebayToken }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Bid failed');
    state.notify = { type: 'ok', msg: `Bid placed! Max: $${maxBid.toFixed(2)}` };
  } catch (e) {
    state.notify = { type: 'err', msg: `Bid failed: ${e.message}` };
  }
  window.renderApp();
};

window.connectEbayAccount = () => {
  if (!state.ebayKey || !state.ebaySecret || !state.ebayRuName) {
    state.notify = { type: 'err', msg: 'Save your App ID, Client Secret, and RuName in Settings first.' };
    window.renderApp();
    return;
  }
  const params = new URLSearchParams({
    app_id:        state.ebayKey,
    client_secret: state.ebaySecret,
    ru_name:       state.ebayRuName,
  });
  window.location.href = `/api/ebay/auth?${params}`;
};
window.disconnectEbayUser = () => {
  state.ebayUser = null;
  import('./utils/state.js').then(({ persistSettings }) => persistSettings());
  state.notify = { type: 'info', msg: 'eBay account disconnected.' };
  renderApp();
};
window.saveEbayKey      = saveEbayKey;
window.clearEbayKey     = clearEbayKey;
window.updateRate       = updateRate;
window.exportAllData    = exportAllData;
window.importDataPrompt = importDataPrompt;
window.nukeAllData      = nukeAllData;
window.saveGasUrl       = saveGasUrl;
window.saveRapidApiKey  = saveRapidApiKey;

// Bid popup
window.openBidPopup = (url) => {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};


// Debounce renderApp — batches rapid calls into a single RAF paint
let _rafPending = false;
const _renderAppImmediate = renderApp;
window.renderApp = () => {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => { _rafPending = false; _renderAppImmediate(); });
};

// Handle eBay OAuth callback — reads ?ebay_user= or ?ebay_error= from URL
(function handleEbayOAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const user  = params.get('ebay_user');
  const err   = params.get('ebay_error');
  if (user || err) {
    // Clean the query string without a page reload
    history.replaceState(null, '', window.location.pathname);
    if (user) {
      state.ebayUser     = user;
      state.ebayToken    = params.get('ebay_token')     || null;
      state.ebayTokenExp = parseInt(params.get('ebay_token_exp') || '0', 10);
      state.ebayRefresh  = params.get('ebay_refresh')   || null;
      import('./utils/state.js').then(({ persistSettings }) => persistSettings());
      state.notify = { type: 'ok', msg: `eBay account connected: ${user}` };
    } else if (err) {
      state.notify = { type: 'err', msg: `eBay connect failed: ${err}` };
    }
  }
})();

// Initialise semantic embedding model — synchronous, runs immediately from deals in localStorage.
if (state.deals.length >= 2) {
  state.embModel = buildEmbeddingModel(state.deals);
}

renderApp();

// Initialise TensorFlow.js model — async, non-blocking.
// Only trains if no saved model exists; otherwise loads weights as-is.
(async () => {
  try {
    const saved = await loadModel();
    if (saved) {
      // Model already trained and saved — just load it, no retraining needed
      state.tfModel      = saved;
      state.tfModelReady = state.deals.length >= 3;
    } else if (state.deals.length >= 3) {
      // First run — build and train from scratch
      const model   = buildModel();
      state.tfModel = model;
      const trained = await trainOnDeals(model, state.deals);
      if (trained) { await saveModel(model); state.tfModelReady = true; }
    } else {
      state.tfModel = buildModel(); // ready to receive training later
    }
  } catch (e) {
    console.warn('[TF init]', e);
  }
})();
