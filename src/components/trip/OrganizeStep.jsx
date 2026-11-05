'use client';

// Step 2 · Organize: sort the wishlist into days, by hand (board) or with AI under your constraints.
import { useMemo, useState } from 'react';
import { WandSparkles, Loader2, Route, BedDouble, Inbox, PiggyBank } from 'lucide-react';
import { Button, useToast } from '../business/ui.jsx';
import { useSettings } from '../business/stores.js';
import { DAYS, addDays, asPlace, fmtDur, stayOf } from './tripData.js';
import {
  PlacePhoto, MustStar, KeyPrompt, ErrorLine, PlanPreview, NextButton, postTrip, tripPayload, isKeyProblem, applyPlan, planSig, fmtDay,
} from './tripUi.jsx';

const toMin = (t) => { const [h, m] = (t || '08:00').split(':').map(Number); return h * 60 + (m || 0); };

export default function OrganizeStep({ trip, setTrip, ops, costs, onNext }) {
  return (
    <div className="space-y-6">
      <AiOrganizer trip={trip} setTrip={setTrip} ops={ops} />
      <Board trip={trip} ops={ops} costs={costs} />
      <div className="max-w-sm mx-auto"><NextButton onClick={onNext}>Next: itinerary</NextButton></div>
    </div>
  );
}

// ─── AI organiser + constraints ──────────────────────────────────────────────

function AiOrganizer({ trip, setTrip, ops }) {
  const { anthropicKey } = useSettings();
  const toast = useToast();
  const prefs = trip.prefs;
  const [state, setState] = useState({ loading: null, res: null, error: null, code: null, sig: null });
  const set = (p) => ops.setPrefs(p);

  const run = async (kind, key = anthropicKey) => {
    const sig = planSig(trip);
    setState({ loading: kind, res: null, error: null, code: null, sig });
    try {
      const body = kind === 'route' ? { ...tripPayload(trip), mode: 'route', scope: 'trip', arrange: true, metric: 'km' }
        : kind === 'cost' ? { ...tripPayload(trip), mode: 'cost' }
        : tripPayload(trip);
      const res = await postTrip(body, kind === 'ai' ? key : undefined);
      setState({ loading: null, res: { ...res, kind }, error: null, code: null, sig });
    } catch (e) {
      setState({ loading: null, res: null, error: e.message, code: e.code, sig });
    }
  };

  const apply = () => {
    const prev = trip;
    setTrip(t => applyPlan(t, state.res, asPlace));
    setState({ loading: null, res: null, error: null, code: null, sig: null });
    toast('Days organized', <WandSparkles className="w-4 h-4 text-tint" aria-hidden />, { label: 'Undo', onClick: () => setTrip(prev) });
  };


  return (
    <section className="rounded-[18px] bg-surface overflow-hidden">
      <div className="p-4 sm:p-5 bg-gradient-to-br from-[var(--tint-soft)] to-transparent space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-tint text-white flex items-center justify-center shrink-0"><WandSparkles className="w-5 h-5" aria-hidden /></span>
          <div>
            <h2 className="text-title-2">Organize your days</h2>
          </div>
        </div>

        {!state.res && (
          <>
            {/* One open box: the traveller writes their own criteria and constraints */}
            <label className="block">
              <span className="sr-only">How should AI plan your days?</span>
              <textarea value={prefs.note} onChange={e => set({ note: e.target.value })} maxLength={1500} rows={4}
                placeholder={'Your rules, e.g.\n- Kawasan Falls is a must\n- Back at the hotel by 9 PM\n- Max 3 h of driving a day'}
                className="w-full px-4 py-3 rounded-[14px] bg-surface text-callout leading-relaxed outline-none focus:ring-2 focus:ring-tint resize-y min-h-[116px] placeholder:text-label-3" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => run('ai')} disabled={!!state.loading || !trip.pool.length}>
                {state.loading === 'ai' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Organizing…</> : <><WandSparkles className="w-4 h-4" aria-hidden />Organize with AI</>}
              </Button>
              <Button variant="gray" title="Fewest km. No AI." onClick={() => run('route')} disabled={!!state.loading || !trip.pool.length}>
                {state.loading === 'route' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Working…</> : <><Route className="w-4 h-4" aria-hidden />Least driving</>}
              </Button>
              <Button variant="gray" title="Cheapest gas + hotels. No AI." onClick={() => run('cost')} disabled={!!state.loading || !trip.days.some(d => d.stops.length)}>
                {state.loading === 'cost' ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Working…</> : <><PiggyBank className="w-4 h-4" aria-hidden />Lowest cost</>}
              </Button>
            </div>
            {state.error && <ErrorLine>{state.error}</ErrorLine>}
            {isKeyProblem(state.code) && <KeyPrompt onKey={(k) => run('ai', k)} />}
          </>
        )}

        {state.res && (
          <PlanPreview res={state.res} trip={trip} stale={planSig(trip) !== state.sig} onApply={apply}
            onBack={() => setState({ loading: null, res: null, error: null, code: null, sig: null })} />
        )}
      </div>
    </section>
  );
}

// ─── Board: wishlist tray on top, one column per day below ───────────────────

function Board({ trip, ops, costs }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const byId = useMemo(() => Object.fromEntries(trip.pool.map(p => [p.uid, p])), [trip.pool]);
  const planned = useMemo(() => new Set(trip.days.flatMap(d => d.stops)), [trip.days]);
  const unplanned = trip.pool.filter(p => !planned.has(p.uid));

  const drop = (col, before) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/plain') || drag;
    if (id) ops.move(id, col === 'pool' ? null : col, before);
    setDrag(null); setOver(null);
  };
  const dragOver = (key) => (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key); };
  const isOver = (col) => over != null && String(over).startsWith(`${col}:`);

  const card = (p, col) => (
    <div key={p.uid}>
      {over === `${col}:${p.uid}` && drag !== p.uid && <div className="h-1 rounded-full bg-tint mb-1.5" aria-hidden />}
      <div draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.uid); e.dataTransfer.effectAllowed = 'move'; setDrag(p.uid); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={dragOver(`${col}:${p.uid}`)} onDrop={drop(col, p.uid)}
        className={`rounded-[12px] bg-surface p-2 cursor-grab active:cursor-grabbing shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-opacity ${drag === p.uid ? 'opacity-40' : ''}`}>
        <div className="flex items-center gap-2.5">
          <PlacePhoto place={p} className="w-10 h-10 rounded-[9px]" iconSize={18} />
          <span className="min-w-0 flex-1 text-subhead font-semibold leading-snug line-clamp-2">{p.name}</span>
        </div>
        <div className="flex items-center gap-1 mt-1.5 pl-0.5">
          <span className="text-footnote text-label-2 tabular">{fmtDur(p.mins)}</span>
          <MustStar size="sm" on={p.must} name={p.name} onToggle={() => ops.update(p.uid, { must: !p.must })} />
          {/* Tap-friendly way to move a card (phones can't drag and drop) */}
          <select value={col === 'pool' ? 'pool' : String(col)} aria-label={`Move ${p.name}`}
            onChange={e => ops.move(p.uid, e.target.value === 'pool' ? null : +e.target.value)}
            className="ml-auto h-7 max-w-[96px] pl-2 pr-1 rounded-[8px] bg-fill text-footnote font-semibold text-tint-ink outline-none focus:ring-2 focus:ring-tint cursor-pointer">
            <option value="pool">Not planned</option>
            {trip.days.map((_, i) => <option key={i} value={i}>Day {i + 1}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  const dropHint = <p className="flex-1 flex items-center justify-center text-center text-subhead text-label-3 rounded-[12px] border-2 border-dashed border-separator px-3 py-6">Drop here</p>;

  return (
    <section className="space-y-4">
      <div className="px-1">
        <h2 className="text-title-2">Your days</h2>
      </div>

      {/* Wishlist tray: everything not on a day yet */}
      <section onDragOver={dragOver('pool:end')} onDrop={drop('pool', null)} aria-label="Not planned yet"
        className={`rounded-[16px] p-3 transition-colors ${isOver('pool') ? 'bg-tint-soft ring-2 ring-tint' : 'bg-fill'}`}>
        <p className="text-headline flex items-center gap-1.5 px-1 pb-2"><Inbox className="w-4 h-4 text-label-2" aria-hidden />Not planned yet <span className="text-subhead font-normal text-label-2">· {unplanned.length}</span></p>
        {unplanned.length ? (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">{unplanned.map(p => card(p, 'pool'))}</div>
        ) : <p className="text-subhead text-label-2 px-1 pb-1">All planned.</p>}
      </section>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
        {trip.days.map((d, i) => {
          const c = costs[i];
          const total = c.visit + c.min;
          const windowMin = toMin(trip.prefs.backBy) - toMin(d.start);
          const long = d.stops.length > 0 && total > windowMin;
          const items = d.stops.map(u => byId[u]).filter(Boolean);
          return (
            <section key={i} onDragOver={dragOver(`${i}:end`)} onDrop={drop(i, null)} aria-label={`Day ${i + 1}`}
              className={`rounded-[16px] p-2.5 flex flex-col gap-2 min-h-[180px] transition-colors ${isOver(i) ? 'bg-tint-soft ring-2 ring-tint' : 'bg-fill'}`}>
              <div className="px-1.5 pt-0.5">
                <p className="text-headline">Day {i + 1} <span className="text-subhead font-normal text-label-2">· {fmtDay(addDays(trip.startDate, i), { weekday: 'short', day: 'numeric' })}</span></p>
                <p className={`text-footnote tabular ${long ? 'text-orange-ink font-semibold' : 'text-label-2'}`}>
                  {items.length ? `${fmtDur(total)}${long ? ' · too long' : ''}` : 'Free'}
                </p>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {items.length ? items.map(p => card(p, i)) : dropHint}
                {over === `${i}:end` && items.length > 0 && <div className="h-1 rounded-full bg-tint" aria-hidden />}
              </div>
              {i < DAYS - 1 && (
                <p className="px-1.5 text-footnote text-label-2 flex items-center gap-1 truncate">
                  <BedDouble className="w-3.5 h-3.5 shrink-0" aria-hidden />{stayOf(trip, i)?.name || 'No hotel yet'}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
