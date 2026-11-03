import { useCallback, useSyncExternalStore } from 'react';
import {
  getWatchlist, addToWatchlist, removeFromWatchlist, setWatchlist, WATCHLIST_EVENT,
} from '../../legacy/utils/watchlist.js';

// Cache the list so React sees the same array until something actually changes
let cache = null;
const snapshot = () => (cache ??= getWatchlist());

function subscribe(onChange) {
  const refresh = () => { cache = null; onChange(); };
  const onStorage = (e) => { if (e.key === 'watchlistItems' || e.key === 'watchlist') refresh(); };
  window.addEventListener(WATCHLIST_EVENT, refresh);
  window.addEventListener('storage', onStorage); // other open tabs
  return () => {
    window.removeEventListener(WATCHLIST_EVENT, refresh);
    window.removeEventListener('storage', onStorage);
  };
}

export function useWatchlist() {
  const items = useSyncExternalStore(subscribe, snapshot, () => []);
  const isWatched = useCallback((id) => items.some(i => i.itemId === id), [items]);

  /** Adds or removes; returns true if the card was added. */
  const toggle = useCallback((listing) => {
    if (getWatchlist().some(i => i.itemId === listing.itemId)) {
      removeFromWatchlist(listing.itemId);
      return false;
    }
    addToWatchlist(listing);
    return true;
  }, []);

  return { items, isWatched, toggle, remove: removeFromWatchlist, restore: setWatchlist };
}
