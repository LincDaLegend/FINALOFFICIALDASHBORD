'use client';

// Step 1 · Wishlist: collect everything you might want to do (AI suggestions, search, popular spots).
import { useMemo, useState } from 'react';
import { Search, X, Loader2, WandSparkles, Check, Heart } from 'lucide-react';
import { Segmented, Button, Chip } from '../business/ui.jsx';
import { useSettings } from '../business/stores.js';
import { SPOTS, REGIONS, catOf, fmtDur } from './tripData.js';
import {
  PlacePhoto, PlaceCard, MustStar, KeyPrompt, ErrorLine, NextButton, postTrip, tripPayload, isKeyProblem, HotelRow, HotelForm,
} from './tripUi.jsx';

const INTERESTS = ['Beaches', 'Waterfalls', 'Islands & diving', 'Food', 'History & churches', 'Views & hikes', 'Nature & parks', 'Shopping', 'Family-friendly', 'Hidden gems'];

export default function WishlistStep({ trip, ops, onNext }) {
  const inPool = useMemo(() => new Set([...trip.pool.map(p => p.id), ...(trip.hotels || []).map(h => h.id).filter(Boolean)]), [trip.pool, trip.hotels]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 items-start">
      <div className="space-y-8 min-w-0">
        <SuggestCard trip={trip} ops={ops} inPool={inPool} />
        <Discover isAdded={(p) => inPool.has(p.id)} onAdd={(p) => ops.add(p)} />
      </div>
      <div className="order-first lg:order-none lg:sticky lg:top-5">
        <PoolPanel trip={trip} ops={ops} onNext={onNext} />
      </div>
    </div>
  );
}

// ─── AI suggestions ──────────────────────────────────────────────────────────

function SuggestCard({ trip, ops, inPool }) {
  const { anthropicKey } = useSettings();
  const interests = trip.prefs.interests || [];
  const [note, setNote] = useState('');
  const [state, setState] = useState({ loading: false, places: null, error: null, code: null });

  const toggle = (x) => ops.setPrefs({ interests: interests.includes(x) ? interests.filter(i => i !== x) : [...interests, x] });

  const run = async (key = anthropicKey) => {
    setState({ loading: true, places: null, error: null, code: null });
    try {
      const d = await postTrip({ ...tripPayload(trip), mode: 'suggest', interests, note }, key);
      setState({ loading: false, places: d.places.map(p => ({ ...p, cat: p.cat || catOf(p) })), error: null, code: null });
    } catch (e) {
      setState({ loading: false, places: null, error: e.message, code: e.code });
    }
  };

  const fresh = (state.places || []).filter(p => !inPool.has(p.id));

  return (
    <section className="rounded-[18px] bg-surface overflow-hidden">
      <div className="p-4 sm:p-5 bg-gradient-to-br from-[var(--tint-soft)] to-transparent space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-tint text-white flex items-center justify-center shrink-0"><WandSparkles className="w-5 h-5" aria-hidden /></span>
          <div>
            <h2 className="text-title-2">Ask AI for ideas</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Interests">
          {INTERESTS.map(x => {
            const on = interests.includes(x);
            return (
              <button key={x} type="button" onClick={() => toggle(x)} aria-pressed={on}
                className={`h-9 px-3.5 rounded-full text-[15px] font-medium pressable transition-colors ${on ? 'bg-tint text-white' : 'bg-surface text-label shadow-[inset_0_0_0_1px_var(--separator)] hover:bg-fill'}`}>
                {on && <Check className="inline w-4 h-4 -mt-0.5 mr-1" strokeWidth={3} aria-hidden />}{x}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={400} disabled={state.loading}
            placeholder="Anything else?"
            className="flex-1 h-11 px-3.5 rounded-[12px] bg-surface text-callout outline-none focus:ring-2 focus:ring-tint" />
          <Button onClick={() => run()} disabled={state.loading}>
            {state.loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Finding places…</> : 'Suggest'}
          </Button>
        </div>
        {state.error && <ErrorLine>{state.error}</ErrorLine>}
        {isKeyProblem(state.code) && <KeyPrompt onKey={run} />}
      </div>

      {state.places && (
        <div className="p-4 sm:p-5 pt-1 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-headline">{state.places.length ? `${state.places.length} ideas` : 'No new ideas'}</p>
            {fresh.length > 1 && <Button size="sm" variant="tinted" onClick={() => fresh.forEach(p => ops.add(p, { quiet: true }))}>Add all {fresh.length}</Button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {state.places.map(p => <PlaceCard key={p.id} p={p} added={inPool.has(p.id)} onAdd={ops.add} />)}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Search + popular ────────────────────────────────────────────────────────

/** Search Cebu + popular spots. Also used in the itinerary to add straight to a day. */
export function Discover({ isAdded, onAdd, title = 'Search', addedLabel }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ loading: false, results: null, error: null, for: '' });
  const [region, setRegion] = useState(REGIONS[0]);

  const search = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setState({ loading: true, results: null, error: null, for: query });
    try {
      const r = await fetch(`/api/trip?kind=places&q=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ loading: false, results: d.results.map(p => ({ ...p, cat: catOf(p) })), error: null, for: query });
    } catch (err) {
      setState({ loading: false, results: null, error: err.message || 'Search failed', for: query });
    }
  };
  const clear = () => { setQ(''); setState({ loading: false, results: null, error: null, for: '' }); };
  const list = state.results || SPOTS.filter(s => s.region === region);

  return (
    <section className="space-y-3">
      {title && <h2 className="text-title-2 px-1">{title}</h2>}
      <form onSubmit={search} role="search">
        <label className="relative block">
          <span className="sr-only">Search places in Cebu</span>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-label-2" aria-hidden />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} enterKeyHint="search"
            placeholder="Search Cebu"
            className="w-full h-12 pl-11 pr-11 rounded-[14px] bg-surface text-callout text-label placeholder:text-label-2 outline-none focus:ring-2 focus:ring-tint" />
          {(q || state.results) && (
            <button type="button" onClick={clear} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-label-2">
              <span className="w-[18px] h-[18px] rounded-full bg-label-3 flex items-center justify-center"><X className="w-3 h-3 text-surface" strokeWidth={3} /></span>
            </button>
          )}
        </label>
      </form>
      {state.loading && <p className="text-callout text-label-2 px-1 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Searching Cebu…</p>}
      {state.error && <ErrorLine>{state.error}</ErrorLine>}
      {state.results ? (
        <p className="text-subhead text-label-2 px-1">
          {state.results.length ? `${state.results.length} results` : 'No matches in Cebu'}
        </p>
      ) : (
        <Segmented label="Popular in" size="sm" value={region} onChange={setRegion} options={REGIONS.map(r => ({ value: r, label: r }))} />
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {list.map(p => <PlaceCard key={p.id} p={p} added={isAdded(p)} onAdd={onAdd} addedLabel={addedLabel} />)}
      </div>
    </section>
  );
}

// ─── The wishlist itself ─────────────────────────────────────────────────────

function PoolPanel({ trip, ops, onNext }) {
  const dayOf = useMemo(() => { const m = new Map(); trip.days.forEach((d, i) => d.stops.forEach(u => m.set(u, i))); return m; }, [trip.days]);
  const hotels = trip.hotels || [];
  const [near, setNear] = useState('');
  const nearUid = trip.pool.some(p => p.uid === near) ? near : trip.pool[trip.pool.length - 1]?.uid || '';
  const nightsOf = (id) => trip.days.slice(0, -1).map((d, k) => (d.hotel === id ? k + 1 : null)).filter(Boolean);
  const musts = trip.pool.filter(p => p.must).length;
  return (
    <section className="rounded-[18px] bg-surface overflow-hidden">
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-title-2">Your wishlist</h2>
      </div>

      <div className="max-h-[60vh] lg:max-h-[calc(100dvh-220px)] overflow-y-auto">
        <SectionHead title="Places" note={`${trip.pool.length}${musts ? ` · ${musts} must-do${musts > 1 ? 's' : ''}` : ''}`} />
        {trip.pool.length === 0 ? (
          <Empty icon={Heart}>No places yet</Empty>
        ) : (
          <ul className="group-list">
            {trip.pool.map(p => {
              const day = dayOf.get(p.uid);
              return (
                <li key={p.uid} className="flex items-center gap-3 pl-4 pr-2 py-2.5" style={{ '--inset': '76px' }}>
                  <PlacePhoto place={p} className="w-12 h-12 rounded-[12px]" iconSize={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-headline leading-snug truncate">{p.name}</span>
                    <span className="flex items-center gap-1.5 text-subhead text-label-2 min-w-0">
                      {day != null ? <Chip tone="blue">Day {day + 1}</Chip> : <Chip>Not planned</Chip>}
                      <span className="truncate">{[p.area, fmtDur(p.mins)].filter(Boolean).join(' · ')}</span>
                    </span>
                  </span>
                  <MustStar on={p.must} name={p.name} onToggle={() => ops.update(p.uid, { must: !p.must })} />
                  <button type="button" onClick={() => ops.remove(p.uid)} aria-label={`Remove ${p.name} from wishlist`}
                    className="w-9 h-9 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-5 h-5" aria-hidden /></button>
                </li>
              );
            })}
          </ul>
        )}

        <SectionHead title="Hotels" note={`${hotels.length} · ₱ per night`} />
        {hotels.length > 0 && (
          <ul className="group-list shadow-[inset_0_-0.5px_0_var(--separator)]">
            {hotels.map(h => {
              const n = nightsOf(h.uid);
              return <HotelRow key={h.uid} h={h} ops={ops} sub={[n.length ? `Night ${n.join(', ')}` : 'No night yet', h.address || h.area].filter(Boolean).join(' · ')} />;
            })}
          </ul>
        )}
        <HotelForm trip={trip} ops={ops} near={nearUid} onNear={setNear} />
      </div>

      <div className="p-3 shadow-[inset_0_0.5px_0_var(--separator)]">
        <NextButton onClick={onNext}>Next: organize</NextButton>
      </div>
    </section>
  );
}

function SectionHead({ title, note }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1.5 shadow-[inset_0_-0.5px_0_var(--separator)]">
      <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-2">{title}</h3>
      <span className="text-footnote text-label-2 tabular">{note}</span>
    </div>
  );
}

function Empty({ icon: Icon, children }) {
  return (
    <p className="flex items-center gap-3 px-4 py-3 text-callout text-label-2">
      <span className="w-12 h-12 rounded-[12px] bg-fill flex items-center justify-center shrink-0"><Icon className="w-5 h-5" aria-hidden /></span>
      {children}
    </p>
  );
}
