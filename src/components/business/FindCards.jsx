'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Search, X, Heart, ExternalLink, ImageOff, ChevronDown, Timer, TriangleAlert, SearchX, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import {
  useSearch, useSettings, runSearch, setSearchOption, searchStore, loadSampleCards, clearSearch,
  updateSettings, verdictOf, pricing, VERDICTS, RESULTS_BATCH,
} from './stores.js';
import { useWatchlist } from './watchlistHooks.js';
import { SHOW_WATCHLIST } from './Layout.jsx';
import { Page, Group, Row, Segmented, Switch, Button, Chip, EmptyState, useToast, SPRING } from './ui.jsx';

const SUGGESTIONS = ['Victor Wembanyama', 'LeBron James Prizm', 'Stephen Curry', 'Luka Doncic'];

export const peso = (n) => '₱' + Math.round(n).toLocaleString('en-PH');
const usd = (n) => '$' + n.toFixed(2);

export function timeLeft(endTime, now = Date.now()) {
  if (!endTime) return null;
  const ms = new Date(endTime) - now;
  if (isNaN(ms)) return null;
  if (ms <= 0) return { label: 'Ended', ms };
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return { label: `${Math.floor(h / 24)}d ${h % 24}h left`, ms };
  if (h >= 1)  return { label: `${h}h ${m}m left`, ms };
  return { label: `${Math.max(1, m)}m left`, ms };
}

export function Thumb({ src, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  const cls = size === 'sm' ? 'w-12 h-16' : 'w-14 h-[74px]';
  if (!src || broken) {
    return <div className={`${cls} shrink-0 rounded-[8px] bg-fill flex items-center justify-center text-label-3`}><ImageOff className="w-5 h-5" aria-hidden /></div>;
  }
  return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={`${cls} shrink-0 rounded-[8px] object-cover bg-fill`} />;
}

// ─── One result ──────────────────────────────────────────────────────────────

function ResultRow({ listing: l, settings, open, onToggle }) {
  const reduce = useReducedMotion();
  const { isWatched, toggle } = useWatchlist();
  const toast = useToast();
  const v = VERDICTS[verdictOf(l.aiScore)];
  const p = pricing(l, settings);
  const left = l.buyingOption === 'AUCTION' ? timeLeft(l.endTime) : null;
  const watched = isWatched(l.itemId);
  const vsMarket = l.marketValue ? Math.round(((p.usd - l.marketValue) / l.marketValue) * 100) : null;

  const onWatch = (e) => {
    e.stopPropagation();
    const added = toggle(l);
    toast(added ? 'Added to Watchlist' : 'Removed from Watchlist',
      <Heart className="w-4 h-4 text-red" fill={added ? 'currentColor' : 'none'} aria-hidden />);
  };

  return (
    <div>
      <div className="flex items-stretch">
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-1 py-3 text-left row-press">
          <Thumb src={l.imgUrl} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 mb-1">
              <Chip tone={v.tone}>{v.label}</Chip>
              {l.grade && l.grade !== 'raw' && <Chip tone="blue">{l.grade}</Chip>}
              {left && <Chip tone={left.ms < 3600000 && left.ms > 0 ? 'red' : 'gray'}><Timer className="w-3 h-3" aria-hidden />{left.label}</Chip>}
            </span>
            <span className="block text-subhead font-medium leading-snug line-clamp-2">{l.title}</span>
          </span>
          <span className="shrink-0 text-right pl-1">
            <span className="block text-headline tabular">{peso(p.costPhp)}</span>
            <span className="block text-caption text-label-2 tabular">{usd(p.usd)}</span>
          </span>
        </button>
        {SHOW_WATCHLIST && <button type="button" onClick={onWatch} aria-pressed={watched} aria-label={watched ? 'Remove from Watchlist' : 'Add to Watchlist'}
          className="w-12 shrink-0 flex items-center justify-center text-red pressable">
          <Heart className="w-[22px] h-[22px]" fill={watched ? 'currentColor' : 'none'} strokeWidth={2} aria-hidden />
        </button>}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="details"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden">
            <div className="px-4 pb-4 pt-1">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="You pay" value={peso(p.costPhp)} note="incl. shipping to you" />
                <Stat label="Sell for" value={peso(p.sellPhp)} note={`${settings.targetMarginPct}% goal + ₱${Math.round(settings.estShippingPhp)} ship`} />
                <Stat label="Profit" value={peso(p.profitPhp)} tone="green" note="if it sells at that price" />
              </div>

              <div className="mt-3 rounded-[10px] bg-surface-2 px-3.5 py-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3 text-subhead">
                  <span className="text-label-2">Usually sells for</span>
                  <span className="font-semibold tabular">
                    {l.marketValue != null ? `~${usd(l.marketValue)}` : 'Not enough data'}
                    {vsMarket != null && (
                      <span className={`ml-2 font-medium ${vsMarket < 0 ? 'text-green-ink' : 'text-orange-ink'}`}>
                        {vsMarket < 0 ? `${-vsMarket}% under` : vsMarket > 0 ? `${vsMarket}% over` : 'same'}
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-subhead mb-1.5">
                    <span className="text-label-2">Deal score</span>
                    <span className="font-semibold tabular">{l.aiScore ?? 0}<span className="text-label-2 font-normal"> / 100</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-fill overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={l.aiScore ?? 0} aria-label="Deal score">
                    <motion.div className={`h-full rounded-full ${{ green: 'bg-green', orange: 'bg-orange', red: 'bg-red' }[v.tone]}`}
                      initial={{ width: 0 }} animate={{ width: `${Math.max(3, l.aiScore ?? 0)}%` }} transition={SPRING} />
                  </div>
                </div>
                {l.condition && l.condition !== 'Unknown' && (
                  <div className="flex items-center justify-between text-subhead">
                    <span className="text-label-2">Condition</span><span>{l.condition}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-3">
                {SHOW_WATCHLIST && (
                  <Button variant={watched ? 'gray' : 'tinted'} className="flex-1" onClick={onWatch}>
                    <Heart className="w-4 h-4" fill={watched ? 'currentColor' : 'none'} aria-hidden />
                    {watched ? 'In Watchlist' : 'Add to Watchlist'}
                  </Button>
                )}
                {l.viewUrl && (
                  <a href={l.viewUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-[12px] bg-fill text-label font-semibold pressable flex-1">
                    View on eBay <ExternalLink className="w-4 h-4" aria-hidden />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, note, tone }) {
  return (
    <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 min-w-0">
      <div className="text-caption text-label-2">{label}</div>
      <div className={`text-headline tabular truncate ${tone === 'green' ? 'text-green-ink' : ''}`}>{value}</div>
      {note && <div className="text-caption text-label-2 leading-tight mt-0.5">{note}</div>}
    </div>
  );
}

// ─── Pricing assumptions (progressive disclosure) ────────────────────────────

export function NumberRow({ label, prefix, suffix, value, onCommit, step = 1 }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <Row title={label}>
      <span className="flex items-center gap-1 text-body text-label-2">
        {prefix}
        <input type="number" inputMode="decimal" step={step} min={0} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { const n = parseFloat(draft); if (n >= 0) onCommit(n); else setDraft(String(value)); }}
          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label={label}
          style={{ width: `${Math.max(1, draft.length) + 0.4}ch` }}
          className="text-right bg-transparent text-label tabular outline-none focus:text-tint-ink" />
        {suffix}
      </span>
    </Row>
  );
}

function PricingGroup({ settings }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  return (
    <Group>
      <Row title="Pricing" onClick={() => setOpen(o => !o)}
        subtitle={`${settings.targetMarginPct}% profit goal · ₱${Math.round(settings.estShippingPhp)} shipping · $1 = ₱${settings.phpRate}`}>
        <ChevronDown className={`w-[17px] h-[17px] text-label-3 transition-transform duration-300 ease-apple ${open ? 'rotate-180' : ''}`} strokeWidth={2.5} aria-hidden />
      </Row>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="p" className="overflow-hidden group-list"
            initial={reduce ? { opacity: 0 } : { height: 0 }} animate={reduce ? { opacity: 1 } : { height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { height: 0 }} transition={SPRING}>
            <NumberRow label="Profit goal" suffix="%" value={settings.targetMarginPct} onCommit={n => updateSettings({ targetMarginPct: n })} />
            <NumberRow label="Shipping to your buyer" prefix="₱" value={settings.estShippingPhp} onCommit={n => updateSettings({ estShippingPhp: n })} />
            <NumberRow label="Exchange rate" prefix="$1 = ₱" step={0.1} value={settings.phpRate} onCommit={n => updateSettings({ phpRate: n })} />
          </motion.div>
        )}
      </AnimatePresence>
    </Group>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FindCards({ setActiveTab }) {
  const s = useSearch();
  const settings = useSettings();
  const [input, setInput] = useState(s.query);
  const [openId, setOpenId] = useState(null);

  const submit = (e) => { e?.preventDefault(); setOpenId(null); runSearch(input); };
  const counts = { buy: 0, consider: 0, skip: 0 };
  for (const l of s.results) counts[verdictOf(l.aiScore)]++;

  const ends = (l) => (l.endTime ? new Date(l.endTime).getTime() : Infinity);
  const total = (l) => l.price + (l.shippingCost || 0);
  const list = s.results
    .filter(l => s.verdict === 'all' || verdictOf(l.aiScore) === s.verdict)
    .sort((a, b) => s.sort === 'price_asc' ? total(a) - total(b)
      : s.sort === 'price_desc' ? total(b) - total(a)
      : s.sort === 'ending' ? ends(a) - ends(b)
      : (b.aiScore || 0) - (a.aiScore || 0));
  const shown = list.slice(0, s.showCount);
  const needsKeys = /App ID and Client Secret/i.test(s.error);

  return (
    <Page title="eBay Search" subtitle="Live eBay listings, best deals first." wide>
      {/* Search */}
      <div className="space-y-3">
        <form onSubmit={submit} role="search" className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Player or card</span>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-label-2" aria-hidden />
            <input type="search" value={input} onChange={e => setInput(e.target.value)} enterKeyHint="search"
              placeholder="Player or card, e.g. Wembanyama Prizm"
              className="w-full h-11 pl-10 pr-10 rounded-[11px] bg-fill text-label placeholder:text-label-2 outline-none focus:ring-2 focus:ring-tint" />
            {input && (
              <button type="button" onClick={() => setInput('')} aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-label-2">
                <span className="w-[18px] h-[18px] rounded-full bg-label-3 flex items-center justify-center"><X className="w-3 h-3 text-surface" strokeWidth={3} /></span>
              </button>
            )}
          </label>
          <Button type="submit" disabled={!input.trim() || s.status === 'loading'} className="hidden sm:inline-flex">Search</Button>
        </form>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="w-full sm:w-auto sm:min-w-[300px]">
            <Segmented label="Listing type" value={s.listingType} onChange={v => setSearchOption({ listingType: v })}
              options={[{ value: 'all', label: 'All' }, { value: 'fixed', label: 'Buy It Now' }, { value: 'auction', label: 'Auctions' }]} />
          </div>
          <label className="flex items-center gap-2.5 text-subhead">
            <Switch checked={s.usOnly} onChange={v => setSearchOption({ usOnly: v })} label="US sellers only" />
            US sellers only
          </label>
        </div>
        {s.listingType === 'auction' && <p className="text-footnote text-label-2">Only auctions ending in the next 24 hours.</p>}
      </div>

      <PricingGroup settings={settings} />

      {/* Results */}
      {s.status === 'idle' && (
        <EmptyState icon={<Search className="w-6 h-6" aria-hidden />} title="Search for a player"
          action={
            <div className="space-y-4">
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(q => (
                  <Button key={q} size="sm" variant="gray" onClick={() => { setInput(q); runSearch(q); }}>{q}</Button>
                ))}
              </div>
              <Button size="sm" variant="plain" onClick={loadSampleCards}><Sparkles className="w-4 h-4" aria-hidden /> Try sample cards</Button>
            </div>
          }>
        </EmptyState>
      )}

      {s.status === 'loading' && (
        <div aria-busy="true" aria-label="Searching eBay">
          <p className="text-footnote text-label-2 px-4 pb-1.5">Searching eBay…</p>
          <div className="bg-surface rounded-group overflow-hidden group-list">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-14 h-[74px] rounded-[8px] bg-fill" />
                <div className="flex-1 space-y-2"><div className="h-3 w-16 rounded bg-fill" /><div className="h-3.5 w-4/5 rounded bg-fill" /></div>
                <div className="h-4 w-14 rounded bg-fill" />
              </div>
            ))}
          </div>
        </div>
      )}

      {s.status === 'error' && (
        <Group>
          <div className="flex items-start gap-3 px-4 py-4">
            <TriangleAlert className="w-5 h-5 text-orange shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-headline">{needsKeys ? 'Add your eBay keys first' : 'The search didn’t work'}</p>
              <p className="text-subhead text-label-2 mt-0.5 break-words">{needsKeys ? 'Search needs your free eBay App ID and Client Secret.' : s.error}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {needsKeys && <Button size="sm" onClick={() => setActiveTab('settings')}>Open Settings</Button>}
                <Button size="sm" variant="gray" onClick={loadSampleCards}>Try sample cards</Button>
              </div>
            </div>
          </div>
        </Group>
      )}

      {s.status === 'done' && (
        <>
          {s.sample && (
            <div className="flex items-center gap-3 rounded-group bg-tint-soft px-4 py-3">
              <Sparkles className="w-5 h-5 text-tint shrink-0" aria-hidden />
              <p className="text-subhead flex-1"><b>Practice cards.</b> Not real listings — search above for real ones.</p>
              <Button size="sm" variant="plain" onClick={() => { clearSearch(); setInput(''); }}>Clear</Button>
            </div>
          )}

          {s.market?.price ? (
            <Group header={s.sample ? 'Market' : `Market · ${s.query}`}
              footer={s.market.fromSales ? undefined : 'No sold-price data. Add a RapidAPI key in Settings.'}>
              <div className="px-4 py-3.5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-footnote text-label-2">{s.market.fromSales ? 'Recently sold for about' : 'Listed for about'}</p>
                  <p className="text-[28px] font-bold tracking-tight tabular leading-tight">{peso(s.market.price * settings.phpRate)}</p>
                  <p className="text-footnote text-label-2 tabular">{usd(s.market.price)} · {s.market.count} {s.market.fromSales ? 'sales' : 'listings'}</p>
                </div>
                {s.market.trend != null && (
                  <Chip tone={s.market.trend > 5 ? 'green' : s.market.trend < -5 ? 'red' : 'gray'}>
                    {s.market.trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" aria-hidden /> : <TrendingDown className="w-3.5 h-3.5" aria-hidden />}
                    {s.market.trend > 0 ? '+' : ''}{s.market.trend}% this week
                  </Chip>
                )}
              </div>
            </Group>
          ) : null}

          {s.results.length === 0 ? (
            <EmptyState icon={<SearchX className="w-6 h-6" aria-hidden />} title="No matches">
              {s.fetched ? `eBay found ${s.fetched} listings, but none had every word you typed. Try fewer words.` : 'Try a shorter search, or turn off “US sellers only”.'}
            </EmptyState>
          ) : (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5">
                <div className="w-full sm:w-auto sm:min-w-[360px]">
                  <Segmented size="sm" label="Show" value={s.verdict} onChange={v => { setOpenId(null); searchStore.set({ verdict: v, showCount: RESULTS_BATCH }); }}
                    options={[
                      { value: 'all', label: `All ${s.results.length}` },
                      { value: 'buy', label: `Buy ${counts.buy}` },
                      { value: 'consider', label: `Consider ${counts.consider}` },
                      { value: 'skip', label: `Skip ${counts.skip}` },
                    ]} />
                </div>
                <label className="flex items-center gap-1.5 text-subhead text-label-2">
                  Sort
                  <select value={s.sort} onChange={e => searchStore.set({ sort: e.target.value, showCount: RESULTS_BATCH })}
                    className="bg-transparent text-tint-ink font-semibold outline-none cursor-pointer text-[15px]">
                    <option value="score">Best deal</option>
                    <option value="price_asc">Lowest price</option>
                    <option value="price_desc">Highest price</option>
                    <option value="ending">Ending soonest</option>
                  </select>
                </label>
              </div>

              {shown.length === 0 ? (
                <EmptyState icon={<SearchX className="w-6 h-6" aria-hidden />} title={`No “${VERDICTS[s.verdict]?.label}” cards this time`} />
              ) : (
                <div className="bg-surface rounded-group overflow-hidden group-list" style={{ '--inset': '84px' }}>
                  {shown.map(l => (
                    <ResultRow key={l.itemId || l.viewUrl} listing={l} settings={settings}
                      open={openId === l.itemId} onToggle={() => setOpenId(id => (id === l.itemId ? null : l.itemId))} />
                  ))}
                </div>
              )}

              {list.length > shown.length && (
                <div className="flex justify-center pt-4">
                  <Button variant="gray" onClick={() => searchStore.set({ showCount: s.showCount + RESULTS_BATCH })}>
                    Show {Math.min(RESULTS_BATCH, list.length - shown.length)} more
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </Page>
  );
}
