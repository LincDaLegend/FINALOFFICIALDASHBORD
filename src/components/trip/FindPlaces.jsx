'use client';

// Find places for the pool: AI ideas, search, popular spots.
import { useState } from 'react';
import { Search, X, Loader2, WandSparkles, Check } from 'lucide-react';
import { Segmented, Button } from '../business/ui.jsx';
import { useSettings } from '../business/stores.js';
import { SPOTS, REGIONS, catOf } from './tripData.js';
import { PlaceCard, KeyPrompt, ErrorLine, postTrip, tripPayload, isKeyProblem } from './tripUi.jsx';

const INTERESTS = ['Beaches', 'Waterfalls', 'Islands & diving', 'Food', 'History & churches', 'Views & hikes', 'Nature & parks', 'Shopping', 'Family-friendly', 'Hidden gems'];

// ─── AI suggestions ──────────────────────────────────────────────────────────

export function SuggestCard({ trip, ops, inPool }) {
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
