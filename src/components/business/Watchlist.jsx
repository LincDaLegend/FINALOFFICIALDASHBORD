import { useState, useEffect, useMemo } from 'react';
import { Heart, ExternalLink, Trash2, Clock, CheckCircle, Search, ImageOff } from 'lucide-react';
import { getWatchlist, removeFromWatchlist, ebayItemUrl, WATCHLIST_EVENT } from '../../legacy/utils/watchlist.js';
import { fmt } from './store.js';

function timeLeft(endTime, now) {
  if (!endTime) return null;
  const ms = new Date(endTime) - now;
  if (isNaN(ms)) return null;
  if (ms <= 0) return { label: 'Ended', ms };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return { label: `${Math.floor(h / 24)}d ${h % 24}h left`, ms };
  if (h >= 1)  return { label: `${h}h ${m}m left`, ms };
  return { label: `${Math.max(1, m)}m left`, ms };
}

function fmtAdded(iso) {
  if (!iso) return 'Added earlier';
  const d = new Date(iso);
  return isNaN(d) ? '' : `Added ${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function Thumb({ src }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="w-20 h-24 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
        <ImageOff className="w-6 h-6" />
      </div>
    );
  }
  return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="w-20 h-24 shrink-0 rounded-xl bg-slate-100 object-contain" />;
}

export default function Watchlist({ phpRate = 57.2, setActiveTab }) {
  const [items, setItems] = useState(getWatchlist);
  const [sort, setSort]   = useState('added');
  const [now, setNow]     = useState(() => Date.now());

  // Stay in sync with hearts clicked on the Search tab (and other open tabs)
  useEffect(() => {
    const refresh = () => setItems(getWatchlist());
    const onStorage = (e) => { if (e.key === 'watchlistItems' || e.key === 'watchlist') refresh(); };
    window.addEventListener(WATCHLIST_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.removeEventListener(WATCHLIST_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      clearInterval(t);
    };
  }, []);

  const total = (i) => (i.price || 0) + (i.shippingCost || 0);

  const sorted = useMemo(() => {
    const ends = (i) => (i.endTime ? new Date(i.endTime).getTime() : Infinity);
    return [...items].sort((a, b) => {
      if (sort === 'ending')    return ends(a) - ends(b);
      if (sort === 'price_asc') return total(a) - total(b);
      return (b.addedAt || '').localeCompare(a.addedAt || '');
    });
  }, [items, sort]);

  const auctions = items.filter(i => i.buyingOption === 'AUCTION' && timeLeft(i.endTime, now)?.label !== 'Ended').length;
  const totalUsd = items.reduce((s, i) => s + total(i), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Watching', value: items.length, color: 'text-slate-700', Icon: Heart },
          { label: 'Live Auctions', value: auctions, color: 'text-amber-600', Icon: Clock },
          { label: 'Total Value', value: fmt(totalUsd * phpRate), color: 'text-emerald-600', Icon: CheckCircle },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
              <Icon className="w-4 h-4 text-slate-300" />
            </div>
            <div className={`text-2xl sm:text-3xl font-bold tracking-tight ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Watchlist</h2>
            <p className="text-xs text-slate-400 mt-0.5">Every item you’ve watched from Search eBay. Prices are from when you added them.</p>
          </div>
          {items.length > 1 && (
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="w-auto text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
            >
              <option value="added">Newest first</option>
              <option value="ending">Ending soonest</option>
              <option value="price_asc">Cheapest first</option>
            </select>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Heart className="w-10 h-10 text-slate-200 mx-auto" />
            <p className="mt-3 font-bold text-slate-700">No watched items yet</p>
            <p className="mt-1 text-sm text-slate-400">Tap <b>♡ Watchlist</b> on any search result and it’ll show up here.</p>
            {setActiveTab && (
              <button
                onClick={() => setActiveTab('search')}
                className="mt-5 inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-700 transition-colors"
              >
                <Search className="w-4 h-4" /> Search eBay
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map(item => {
              const left = item.buyingOption === 'AUCTION' ? timeLeft(item.endTime, now) : null;
              const leftCls = !left || left.label === 'Ended'
                ? 'bg-slate-100 text-slate-500'
                : left.ms < 3600000 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700';
              const usd = total(item);
              return (
                <li key={item.itemId} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex gap-4 min-w-0 flex-1">
                    <Thumb src={item.imgUrl} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {left && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${leftCls}`}>⏱ {left.label}</span>}
                        {item.grade && item.grade !== 'raw' && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{item.grade}</span>}
                        {item.aiScore != null && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Deal score {item.aiScore}</span>}
                        {item.syncedToEbay && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">On eBay watchlist</span>}
                      </div>
                      <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 break-words">
                        {item.title || `eBay item ${String(item.itemId).split('|')[1] || item.itemId}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">{fmtAdded(item.addedAt)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    {item.title ? (
                      <div className="sm:text-right">
                        <div className="text-lg font-bold text-slate-900">${usd.toFixed(2)}</div>
                        <div className="text-xs text-slate-400">≈ {fmt(usd * phpRate)}{item.shippingCost > 0 ? ' incl. ship' : ''}</div>
                      </div>
                    ) : <div className="text-xs text-slate-400">Details not saved</div>}
                    <div className="flex gap-2">
                      <a
                        href={ebayItemUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-solid border-slate-200 text-sm font-bold text-slate-600 no-underline hover:bg-slate-50"
                      >
                        View <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => removeFromWatchlist(item.itemId)}
                        title="Remove from watchlist (stays on your eBay watchlist)"
                        aria-label={`Remove ${item.title || 'item'} from watchlist`}
                        className="flex items-center px-3 py-2 rounded-lg border border-solid border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
