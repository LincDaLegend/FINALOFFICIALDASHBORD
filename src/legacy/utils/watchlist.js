import { load, save } from './storage.js';

// Watched items, with enough detail to show them on the Watchlist page.
// 'watchlist' (ids only) is still written so older code that checks ids keeps working.
const ITEMS_KEY = 'watchlistItems';
const IDS_KEY   = 'watchlist';
export const WATCHLIST_EVENT = 'watchlist-changed';

function persist(items) {
  save(ITEMS_KEY, items);
  save(IDS_KEY, items.map(i => i.itemId));
  try { window.dispatchEvent(new Event(WATCHLIST_EVENT)); } catch {}
}

export function getWatchlist() {
  const items = load(ITEMS_KEY, []);
  // Items watched before details were saved only exist as ids — keep them visible.
  const known = new Set(items.map(i => i.itemId));
  const orphans = load(IDS_KEY, [])
    .filter(id => id && !known.has(id))
    .map(id => ({ itemId: id, title: '', addedAt: null }));
  return [...items, ...orphans];
}

export function getWatchedIds() {
  return getWatchlist().map(i => i.itemId);
}

export function addToWatchlist(listing) {
  const items = getWatchlist().filter(i => i.itemId !== listing.itemId);
  items.unshift({
    itemId:       listing.itemId,
    title:        listing.title || '',
    imgUrl:       listing.imgUrl || '',
    viewUrl:      listing.viewUrl || '',
    price:        Number(listing.price) || 0,
    shippingCost: Number(listing.shippingCost) || 0,
    buyingOption: listing.buyingOption || '',
    endTime:      listing.endTime || null,
    grade:        listing.grade || '',
    aiScore:      Number.isFinite(listing.aiScore) ? listing.aiScore : null,
    marketValue:  listing.marketValue ?? null,
    addedAt:      new Date().toISOString(),
    syncedToEbay: false,
  });
  persist(items);
}

/** Replace the whole list (used by Clear Watchlist and backup import). */
export function setWatchlist(items) {
  persist((Array.isArray(items) ? items : []).filter(i => i && i.itemId));
}

export function removeFromWatchlist(itemId) {
  persist(getWatchlist().filter(i => i.itemId !== itemId));
}

export function markSynced(itemId) {
  persist(getWatchlist().map(i => (i.itemId === itemId ? { ...i, syncedToEbay: true } : i)));
}

/** Browse API ids look like "v1|123456789|0"; the eBay item page uses the middle number. */
export function ebayItemUrl(item) {
  if (item.viewUrl) return item.viewUrl;
  const legacyId = String(item.itemId).split('|')[1] || item.itemId;
  return `https://www.ebay.com/itm/${legacyId}`;
}
