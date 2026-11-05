'use client';

// Shared pieces for the Cebu trip planner (temporary feature).
import { useEffect, useState } from 'react';
import {
  X, Plus, Check, Minus, BedDouble, MapPin, Droplets, TreePalm, Church, Landmark, Mountain, Utensils, ShoppingBag,
  Plane, Trees, Fish, Users, Star, CircleAlert, ArrowRight, Loader2,
} from 'lucide-react';
import { Button, Chip } from '../business/ui.jsx';
import { updateSettings } from '../business/stores.js';
import { DAYS, addDays, catOf, colorOf, fmtClock, fmtDur, gasCost, peso, stayOf, nightlyFor } from './tripData.js';

export const fmtDay = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', opts);
export const fmtKm = (v) => (v < 1 ? `${Math.round(v * 1000)} m` : `${v.toFixed(v < 10 ? 1 : 0)} km`);
export const clock = (hhmm) => fmtClock(+hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5));

// ─── Category glyphs + photos ────────────────────────────────────────────────

export const CAT_ICON = {
  water: Droplets, beach: TreePalm, dive: Fish, worship: Church, landmark: Landmark, view: Mountain,
  food: Utensils, shop: ShoppingBag, transport: Plane, park: Trees, stay: BedDouble, pin: MapPin,
};

// Photos come from Wikipedia / Wikimedia Commons via /api/trip?kind=photo; remembered per browser
const PHOTO_KEY = 'tripPhotos_v1';
const photoRequests = new Map();
let photoStore = null;
const store = () => {
  if (!photoStore) { try { photoStore = JSON.parse(localStorage.getItem(PHOTO_KEY)) || {}; } catch { photoStore = {}; } }
  return photoStore;
};
const photoKey = (p) => `${p.name}|${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`;

function usePhoto(place, enabled = true) {
  const key = photoKey(place);
  const [val, setVal] = useState(() => store()[key]);
  useEffect(() => {
    if (!enabled) return;
    if (store()[key] !== undefined) { setVal(store()[key]); return; }
    let live = true;
    let req = photoRequests.get(key);
    if (!req) {
      const qs = new URLSearchParams({ kind: 'photo', name: place.name, area: place.area || '', lat: place.lat, lon: place.lon, wiki: place.wiki || '' });
      req = fetch(`/api/trip?${qs}`).then(r => (r.ok ? r.json() : Promise.reject())).then(d => {
        const v = d.url ? { url: d.url, page: d.page, source: d.source } : null;
        store()[key] = v;
        try { localStorage.setItem(PHOTO_KEY, JSON.stringify(store())); } catch {}
        return v;
      }).catch(() => null);
      photoRequests.set(key, req);
    }
    req.then(v => live && setVal(v));
    return () => { live = false; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return val;
}

/** A photo of the place, or its category colour + glyph while loading / when there's no photo. */
export function PlacePhoto({ place, className = '', iconSize = 22, lookup = true, children }) {
  const ph = usePhoto(place, lookup);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const Icon = CAT_ICON[place.cat || catOf(place)] || MapPin;
  const c = colorOf(place);
  return (
    <span className={`relative block overflow-hidden shrink-0 ${className}`} style={{ background: `linear-gradient(145deg, ${c}, ${c}B3)` }}>
      <span className="absolute inset-0 flex items-center justify-center text-white/90" aria-hidden><Icon style={{ width: iconSize, height: iconSize }} strokeWidth={2} /></span>
      {ph?.url && !broken && (
        <img src={ph.url} alt="" loading="lazy" title={`Photo: ${ph.source}`} onLoad={() => setLoaded(true)} onError={() => setBroken(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
      )}
      {children}
    </span>
  );
}

/** Photo-first card used for search results, popular spots and AI suggestions. */
export function PlaceCard({ p, added, onAdd, addedLabel = 'On your wishlist' }) {
  return (
    <div className="rounded-[16px] bg-surface overflow-hidden flex flex-col">
      <PlacePhoto place={p} className="w-full aspect-[4/3]" iconSize={34}>
        <button type="button" onClick={() => !added && onAdd(p)} aria-label={added ? `${p.name}: ${addedLabel}` : `Add ${p.name}`} aria-pressed={added}
          className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center pressable shadow-[0_2px_8px_rgba(0,0,0,0.25)] ${added ? 'bg-green text-white' : 'bg-white text-[#007AFF]'}`}>
          {added ? <Check className="w-5 h-5" strokeWidth={3} aria-hidden /> : <Plus className="w-5 h-5" strokeWidth={3} aria-hidden />}
        </button>
        {p.tag && <span className="absolute left-2 bottom-2 max-w-[calc(100%-16px)] truncate px-2 h-6 leading-6 rounded-full bg-black/55 text-white text-[12px] font-semibold backdrop-blur-sm">{p.tag}</span>}
      </PlacePhoto>
      <div className="px-3 py-2.5">
        <p className="text-headline leading-snug line-clamp-2">{p.name}</p>
        <p className="text-subhead text-label-2 truncate">{[p.area, p.mins ? fmtDur(p.mins) : null].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );
}

export function MustStar({ on, onToggle, name, size = 'md' }) {
  const box = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? `${name} is a must-do` : `Mark ${name} as a must-do`}
      title={on ? 'Must-do' : 'Mark as must-do'}
      className={`${box} rounded-full flex items-center justify-center pressable shrink-0 ${on ? 'text-orange' : 'text-label-3 hover:text-orange'}`}>
      <Star className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} fill={on ? 'currentColor' : 'none'} strokeWidth={2} aria-hidden />
    </button>
  );
}

export function PeopleStepper({ value, onChange }) {
  const btn = 'w-7 h-7 rounded-full flex items-center justify-center text-label pressable disabled:opacity-30 hover:bg-fill-2';
  return (
    <span className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full bg-surface text-[14px] font-semibold" role="group" aria-label="Number of people">
      <Users className="w-4 h-4 text-tint" aria-hidden />
      <span className="tabular min-w-[64px] text-center">{value} {value === 1 ? 'person' : 'people'}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="One less person"><Minus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></button>
      <button type="button" className={btn} onClick={() => onChange(Math.min(30, value + 1))} aria-label="One more person"><Plus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></button>
    </span>
  );
}

export function DurationStepper({ mins, onChange, name, compact = false }) {
  const btn = `${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-fill flex items-center justify-center text-label pressable disabled:opacity-30`;
  return (
    <span className="inline-flex items-center gap-1.5" role="group" aria-label={`Time at ${name}`}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(15, mins - 30))} disabled={mins <= 15} aria-label="30 minutes less"><Minus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></button>
      <span className={`${compact ? 'min-w-[52px] text-footnote' : 'min-w-[64px] text-subhead'} text-center font-medium tabular`}>{fmtDur(mins)}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(12 * 60, mins + 30))} aria-label="30 minutes more"><Plus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /></button>
    </span>
  );
}

// ─── Talking to /api/trip ────────────────────────────────────────────────────

export const tripPayload = (trip) => ({
  people: trip.guests,
  prefs: trip.prefs,
  fuel: trip.fuel,
  hotels: (trip.hotels || []).map(h => ({ uid: h.uid, name: h.name, area: h.area, lat: h.lat, lon: h.lon, nightly: nightlyFor(h) })),
  places: trip.pool.map(({ uid, name, area, lat, lon, mins, must }) => ({ uid, name, area, lat, lon, mins, must })),
  days: trip.days.map((d, i) => ({
    date: fmtDay(addDays(trip.startDate, i), { weekday: 'long', month: 'short', day: 'numeric' }),
    start: d.start,
    order: d.stops,
    hotel: i < DAYS - 1 ? d.hotel : null,
    stay: (() => { const h = i < DAYS - 1 ? stayOf(trip, i) : null; return h ? { name: h.name, area: h.area, lat: h.lat, lon: h.lon } : null; })(),
  })),
});

export async function postTrip(body, key) {
  const r = await fetch('/api/trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-anthropic-key': key } : {}) },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong'), { code: d.code });
  return d;
}

export const isKeyProblem = (code) => code === 'no_key' || code === 'bad_key';

/** Shown when the AI needs a (working) Claude key: paste it once, it's saved and the request retries. */
export function KeyPrompt({ onKey }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-2">
      <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => {
        e.preventDefault();
        const k = draft.trim();
        if (!k) return;
        updateSettings({ anthropicKey: k });
        setDraft('');
        onKey(k);
      }}>
        <input type="password" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Paste your Claude API key (sk-ant-…)"
          autoComplete="off" spellCheck={false} aria-label="Claude API key"
          className="flex-1 h-11 px-3.5 rounded-[12px] bg-surface text-callout font-mono placeholder:font-sans outline-none focus:ring-2 focus:ring-tint" />
        <Button type="submit" disabled={!draft.trim()}>Save</Button>
      </form>
      <p className="text-subhead text-label-2">
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-tint-ink">Get a key</a>
      </p>
    </div>
  );
}

export function ErrorLine({ children }) {
  return <p className="text-callout text-orange-ink flex items-center gap-2"><CircleAlert className="w-4 h-4 shrink-0" aria-hidden />{children}</p>;
}

// ─── Preview of a proposed plan (AI organiser or shortest driving) ───────────

export function PlanPreview({ res, trip, onApply, onBack, stale }) {
  const byId = Object.fromEntries(trip.pool.map(p => [p.uid, p]));
  const placeOf = (x) => (x.isNew ? x : byId[x.uid]);
  const hotelName = (u) => (trip.hotels || []).find(h => h.uid === u)?.name;
  const changed = (i) => JSON.stringify(res.days[i]?.stops.map(x => x.uid || x.name)) !== JSON.stringify(trip.days[i].stops)
    || (res.hotels && i < DAYS - 1 && (res.hotels[i] ?? null) !== (trip.days[i].hotel ?? null));
  const metric = res.metric === 'min' ? 'min' : 'km';
  const isCost = res.metric === 'cost';
  const left = (res.unscheduled || []).map(u => byId[u]).filter(Boolean);
  const mustLeft = left.filter(p => p.must);
  const nothing = res.days.every((_, i) => !changed(i));

  return (
    <div className="space-y-4">
      {isCost ? (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-footnote font-medium text-label-2">Total</p>
            <p className="text-[28px] font-bold tracking-[-0.02em] tabular leading-tight">
              {peso(res.after.total)}
              {res.before.total > res.after.total && <span className="text-callout font-semibold text-label-2 ml-2 line-through">{peso(res.before.total)}</span>}
            </p>
            {res.before.total > res.after.total && <p className="text-subhead font-semibold text-green-ink">Save {peso(res.before.total - res.after.total)}</p>}
          </div>
          <div>
            <p className="text-footnote font-medium text-label-2">Hotels</p>
            <p className="text-title-2 tabular">{peso(res.after.stay)}</p>
          </div>
          <div>
            <p className="text-footnote font-medium text-label-2">Gas · {res.after.km} km</p>
            <p className="text-title-2 tabular">{peso(res.after.gas)}</p>
          </div>
          {res.unpriced?.length > 0 && (
            <p className="basis-full text-subhead text-orange-ink">No price, left out: {res.unpriced.join(', ')}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-footnote font-medium text-label-2">{metric === 'km' ? 'Distance' : 'Driving'}</p>
          <p className="text-[28px] font-bold tracking-[-0.02em] tabular leading-tight">
            {metric === 'km' ? `${res.after.km} km` : fmtDur(res.after.min)}
            {(metric === 'km' ? res.before.km : res.before.min) > 0 && (
              <span className="text-callout font-semibold text-label-2 ml-2 line-through">{metric === 'km' ? `${res.before.km} km` : fmtDur(res.before.min)}</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-footnote font-medium text-label-2">{metric === 'km' ? 'Driving' : 'Distance'}</p>
          <p className="text-title-2 tabular">{metric === 'km' ? fmtDur(res.after.min) : `${res.after.km} km`}</p>
        </div>
        <div>
          <p className="text-footnote font-medium text-label-2">Gas</p>
          <p className="text-title-2 tabular">{peso(gasCost(res.after.km, trip.fuel))}</p>
        </div>
      </div>
      )}
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {res.days.map((d, i) => (
          <li key={i} className={`rounded-[14px] p-3 bg-surface ${changed(i) ? 'ring-2 ring-tint' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-headline">Day {i + 1}</p>
              {changed(i) ? <Chip tone="blue">Changed</Chip> : <span className="text-footnote text-label-3">Same</span>}
            </div>
            {d.title && <p className="text-subhead font-medium truncate">{d.title}</p>}
            <p className="text-subhead text-label-2 tabular">Leave {clock(d.start)}</p>
            {d.stops.length ? (
              <ol className="mt-2 space-y-1.5">
                {d.stops.map((x, k) => {
                  const place = placeOf(x);
                  if (!place) return null;
                  return (
                    <li key={k} className="flex items-center gap-2 text-subhead">
                      <PlacePhoto place={place} className="w-7 h-7 rounded-[8px]" iconSize={14} />
                      <span className="min-w-0 flex-1 truncate">{place.name}</span>
                      {x.isNew && <Chip tone="green">New</Chip>}
                    </li>
                  );
                })}
              </ol>
            ) : <p className="text-subhead text-label-2 mt-2">Free day</p>}
            {res.hotels && i < DAYS - 1 && (
              <p className="mt-2 pt-2 shadow-[inset_0_0.5px_0_var(--separator)] text-subhead flex items-center gap-1.5 min-w-0">
                <BedDouble className="w-4 h-4 text-[#5856D6] shrink-0" aria-hidden />
                <span className="truncate">{hotelName(res.hotels[i]) || 'No hotel'}</span>
              </p>
            )}
          </li>
        ))}
      </ol>

      {left.length > 0 && (
        <p className="text-subhead text-label-2">
          Not planned: {left.map((p, k) => <span key={p.uid} className={p.must ? 'text-orange-ink font-semibold' : ''}>{p.name}{p.must ? ' (must-do)' : ''}{k < left.length - 1 ? ', ' : ''}</span>)}
        </p>
      )}
      {isCost && res.noHotels && <ErrorLine>No hotels yet, so this counts gas only.</ErrorLine>}
      {mustLeft.length > 0 && <ErrorLine>Some must-dos didn't fit.</ErrorLine>}
      {stale && <ErrorLine>Trip changed. Run it again.</ErrorLine>}

      <div className="flex flex-wrap gap-2">
        {!nothing && <Button onClick={onApply} disabled={stale}><Check className="w-4 h-4" aria-hidden />Use this plan</Button>}
        {nothing && <p className="text-headline self-center mr-2">Already the best plan.</p>}
        <Button variant="gray" onClick={onBack}>Back</Button>
      </div>
    </div>
  );
}

/** Applies a proposed plan to the trip: new places join the wishlist, durations and leave times update. */
export function applyPlan(t, res, asPlace) {
  const pool = t.pool.map(p => ({ ...p }));
  const byId = Object.fromEntries(pool.map(p => [p.uid, p]));
  const days = t.days.map((d, i) => ({
    ...d,
    ...(res.hotels ? { hotel: i < t.days.length - 1 ? res.hotels[i] ?? null : null } : {}),
    start: res.days[i]?.start || d.start,
    stops: (res.days[i]?.stops || []).map(x => {
      if (x.isNew) { const np = asPlace(x); pool.push(np); return np.uid; }
      if (!byId[x.uid]) return null;
      byId[x.uid].mins = x.mins;
      return x.uid;
    }).filter(Boolean),
  }));
  return { ...t, pool, days };
}

export const planSig = (trip) => JSON.stringify([trip.pool.map(p => [p.uid, p.mins, p.must]), trip.days.map(d => [d.start, d.stops, d.hotel]), (trip.hotels || []).map(h => [h.uid, h.price, h.unit, h.sleeps]), trip.prefs, trip.guests, trip.fuel]);

export function NextButton({ children, onClick }) {
  return (
    <Button onClick={onClick} className="w-full">
      {children}<ArrowRight className="w-4 h-4" aria-hidden />
    </Button>
  );
}


// ─── Hotels (shared by the wishlist and the itinerary) ───────────────────────

export const isStay = (p) => (p.cat || catOf(p)) === 'stay';

/** Editable ₱ total per night for the group. */
export function PriceCell({ value, onCommit, label }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => { setDraft(String(value ?? '')); }, [value]);
  return (
    <span className="flex items-center gap-0.5 h-9 px-2.5 rounded-[10px] bg-fill text-callout shrink-0 focus-within:ring-2 focus-within:ring-tint">
      <span className="text-label-2">₱</span>
      <input type="number" inputMode="numeric" min={0} step={100} value={draft} aria-label={label}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const n = parseFloat(draft); if (n >= 0) onCommit(n); else setDraft(String(value)); }}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-[64px] bg-transparent text-right font-semibold tabular outline-none" />
    </span>
  );
}

export function HotelRow({ h, ops, sub }) {
  return (
    <li className="flex items-center gap-3 pl-4 pr-2 py-2" style={{ '--inset': '76px' }}>
      <PlacePhoto place={{ ...h, cat: 'stay' }} lookup={!!h.id} className="w-12 h-12 rounded-[12px]" iconSize={20} />
      <span className="min-w-0 flex-1">
        <span className="block text-headline leading-snug truncate">{h.name}</span>
        {(sub || h.address || h.area) && <span className="block text-subhead text-label-2 truncate">{sub || h.address || h.area}</span>}
      </span>
      <PriceCell value={h.price} label={`${h.name} price per night`} onCommit={n => ops.updateHotel(h.uid, { price: n })} />
      <button type="button" onClick={() => ops.removeHotel(h.uid)} aria-label={`Remove ${h.name}`}
        className="w-9 h-9 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-5 h-5" aria-hidden /></button>
    </li>
  );
}

const PRECISION = { exact: ['green', 'Exact'], street: ['blue', 'Street'], town: ['orange', 'Town only'] };

/** "Add hotel" button that opens a small form: name, address (found on the map as you type), ₱ per night. */
export function HotelForm({ trip, ops, near, onNear }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', address: '', price: '' });
  const [geo, setGeo] = useState({ loading: false, results: null, pick: 0 });
  const places = trip.pool;
  const at = places.find(p => p.uid === near);
  const input = 'h-10 px-3 rounded-[10px] bg-fill text-callout outline-none focus:ring-2 focus:ring-tint';
  const address = draft.address.trim();

  // Look the address up a moment after typing stops (OSM asks for ≤1 request a second)
  useEffect(() => {
    if (address.length < 3) { setGeo({ loading: false, results: null, pick: 0 }); return; }
    setGeo(g => ({ ...g, loading: true }));
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/trip?${new URLSearchParams({ kind: 'geocode', name: draft.name.trim(), address })}`, { signal: ctl.signal })
        .then(r => r.json())
        .then(d => setGeo({ loading: false, results: d.results || [], pick: 0 }))
        .catch(e => { if (e.name !== 'AbortError') setGeo({ loading: false, results: [], pick: 0 }); });
    }, 800);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [address, draft.name]);

  const hit = geo.results?.[geo.pick];
  const spot = address && hit ? { lat: hit.lat, lon: hit.lon, area: hit.area || '' } : at ? { lat: at.lat, lon: at.lon, area: at.area } : null;
  const ready = draft.name.trim() && spot && !geo.loading;
  const close = () => { setOpen(false); setDraft({ name: '', address: '', price: '' }); };

  const add = (e) => {
    e.preventDefault();
    if (!ready) return;
    // Just an option: nights are picked by you (or Cheapest), never filled automatically
    ops.addHotel({
      name: draft.name.trim(), address: address || null, ...spot, pinned: address && hit ? hit.precision : 'near',
      price: Math.max(0, parseFloat(draft.price) || 0),
    });
    close();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 pl-4 pr-3 py-3 text-left text-tint-ink font-semibold row-press">
        <span className="w-12 h-12 rounded-[12px] bg-tint-soft flex items-center justify-center shrink-0"><Plus className="w-5 h-5" strokeWidth={2.5} aria-hidden /></span>
        Add hotel
      </button>
    );
  }

  const nearSelect = (
    <select value={near || ''} onChange={e => onNear(e.target.value)} aria-label="Near" disabled={!places.length} className={`${input} min-w-0 flex-1`}>
      {places.length ? places.map(p => <option key={p.uid} value={p.uid}>Near {p.name}</option>) : <option value="">Add places first</option>}
    </select>
  );

  return (
    <form onSubmit={add} className="p-3 space-y-2 bg-surface-2">
      <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Hotel name" aria-label="Hotel name" className={`w-full ${input}`} />
      <label className="relative block">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" aria-hidden />
        <input value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
          placeholder="Address or Google Maps link" aria-label="Hotel address" className={`w-full pl-9 ${input}`} />
      </label>

      {!address ? (
        <div className="flex items-center gap-2">{nearSelect}</div>
      ) : geo.loading ? (
        <p className="flex items-center gap-2 px-1 text-subhead text-label-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Finding it on the map…</p>
      ) : geo.results?.length ? (
        <ul className="rounded-[10px] bg-surface overflow-hidden group-list" role="radiogroup" aria-label="Map match">
          {geo.results.map((r, k) => {
            const [tone, word] = PRECISION[r.precision] || PRECISION.town;
            return (
              <li key={k}>
                <button type="button" role="radio" aria-checked={k === geo.pick} onClick={() => setGeo(g => ({ ...g, pick: k }))}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left row-press">
                  <span className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${k === geo.pick ? 'bg-tint' : 'shadow-[inset_0_0_0_1.5px_var(--separator)]'}`}>
                    {k === geo.pick && <Check className="w-3 h-3 text-white" strokeWidth={3.5} aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1 text-subhead truncate">{r.label}</span>
                  <Chip tone={tone}>{word}</Chip>
                </button>
              </li>
            );
          })}
        </ul>
      ) : geo.results ? (
        <div className="flex items-center gap-2">
          <span className="text-subhead text-orange-ink shrink-0 px-1">Not found · pin</span>{nearSelect}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input value={draft.price} onChange={e => setDraft(d => ({ ...d, price: e.target.value }))} placeholder="₱ / night" inputMode="numeric" type="number" min={0}
          aria-label="Price per night for the group" className={`w-[110px] tabular ${input}`} />
        <span className="flex-1" />
        <Button size="sm" variant="gray" type="button" className="!h-10" onClick={close}>Cancel</Button>
        <Button size="sm" type="submit" className="!h-10" disabled={!ready}>Add</Button>
      </div>
    </form>
  );
}
