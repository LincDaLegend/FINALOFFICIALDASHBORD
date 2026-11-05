'use client';

// Step 2 · Organize: sort the wishlist into days, by hand (board) or with AI under your constraints.
import { useMemo, useState } from 'react';
import { WandSparkles, Loader2, Route, BedDouble, Inbox, PiggyBank, X } from 'lucide-react';
import { Button, useToast } from '../business/ui.jsx';
import { useSettings } from '../business/stores.js';
import { DAYS, addDays, asPlace, fmtDur, stayOf, nightlyFor, peso } from './tripData.js';
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
  const hotels = trip.hotels || [];
  const nightsOf = (id) => trip.days.slice(0, DAYS - 1).flatMap((d, k) => (d.hotel === id ? [k + 1] : []));
  const endDrag = () => { setDrag(null); setOver(null); };

  // drag = { kind: 'place' | 'hotel', id, from: 'pool' | 'tray' | day index }
  const drop = (col, before) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag;
    setDrag(null); setOver(null);
    if (!d) return;
    if (d.kind === 'hotel') {
      if (typeof col === 'number' && col < DAYS - 1) {
        ops.setNight(col, d.id);
        if (typeof d.from === 'number' && d.from !== col) ops.setNight(d.from, null); // moved from another night
      } else if (col === 'pool' || col === 'hotels') {
        if (typeof d.from === 'number') ops.setNight(d.from, null);                    // dragged off a night
      }
      return;
    }
    if (col === 'hotels') return;
    ops.move(d.id, col === 'pool' ? null : col, before);
  };
  // Hotels only land on nights 1–4 (or back in a tray); places never land in the hotel tray
  const accepts = (key) => {
    if (!drag) return true;
    const col = String(key).split(':')[0];
    if (drag.kind === 'hotel') return col === 'pool' || col === 'hotels' || (col !== 'pool' && +col < DAYS - 1);
    return col !== 'hotels';
  };
  const dragOver = (key) => (e) => {
    e.stopPropagation();
    if (!accepts(key)) { e.dataTransfer.dropEffect = 'none'; if (over) setOver(null); return; }
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    // Over a place card while carrying a hotel → it's the whole day's night
    const k = drag?.kind === 'hotel' ? `${String(key).split(':')[0]}:end` : key;
    if (over !== k) setOver(k);
  };
  const startDrag = (d) => (e) => { e.dataTransfer.setData('text/plain', `${d.kind}:${d.id}`); e.dataTransfer.effectAllowed = 'move'; setDrag(d); };
  const isOver = (col) => over != null && String(over).startsWith(`${col}:`);

  const card = (p, col) => (
    <div key={p.uid}>
      {over === `${col}:${p.uid}` && drag?.id !== p.uid && <div className="h-1 rounded-full bg-tint mb-1.5" aria-hidden />}
      <div draggable onDragStart={startDrag({ kind: 'place', id: p.uid, from: col })}
        onDragEnd={endDrag}
        onDragOver={dragOver(`${col}:${p.uid}`)} onDrop={drop(col, p.uid)}
        className={`rounded-[12px] bg-surface p-2 cursor-grab active:cursor-grabbing shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-opacity ${drag?.id === p.uid ? 'opacity-40' : ''}`}>
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

      {/* Hotel tray: drag a hotel onto a day to sleep there that night (a hotel can cover several nights) */}
      <section onDragOver={dragOver('hotels:end')} onDrop={drop('hotels', null)} aria-label="Hotels"
        className={`rounded-[16px] p-3 transition-colors ${isOver('hotels') ? 'bg-tint-soft ring-2 ring-tint' : 'bg-fill'}`}>
        <p className="text-headline flex items-center gap-1.5 px-1 pb-2"><BedDouble className="w-4 h-4 text-[#5856D6]" aria-hidden />Hotels <span className="text-subhead font-normal text-label-2">· drag onto a day</span></p>
        {hotels.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {hotels.map(h => <HotelCard key={h.uid} h={h} nights={nightsOf(h.uid)} onDragStart={startDrag({ kind: 'hotel', id: h.uid, from: 'tray' })} onDragEnd={endDrag} dragging={drag?.kind === 'hotel' && drag.id === h.uid && drag.from === 'tray'} />)}
          </div>
        ) : <p className="text-subhead text-label-2 px-1 pb-1">Add hotels on the Wishlist step.</p>}
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
                <NightSlot i={i} hotel={stayOf(trip, i)} hotels={hotels} ops={ops}
                  active={drag?.kind === 'hotel'} hot={drag?.kind === 'hotel' && over === `${i}:end`}
                  onDragOver={dragOver(`${i}:end`)} onDrop={drop(i, null)}
                  onDragStart={(h) => startDrag({ kind: 'hotel', id: h.uid, from: i })} onDragEnd={endDrag}
                  dragging={drag?.kind === 'hotel' && drag.from === i} />
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function HotelCard({ h, nights, onDragStart, onDragEnd, dragging, compact, onClear }) {
  const priced = nightlyFor(h) > 0;
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      className={`${compact ? 'w-full' : 'w-[200px] shrink-0 snap-start'} rounded-[12px] bg-surface p-2 cursor-grab active:cursor-grabbing shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-opacity ${dragging ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-10 h-10 rounded-[9px] bg-[#5856D6] text-white flex items-center justify-center shrink-0"><BedDouble className="w-5 h-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-subhead font-semibold leading-snug truncate">{h.name}</span>
          <span className={`block text-footnote tabular ${priced ? 'text-label-2' : 'text-orange-ink font-semibold'}`}>
            {priced ? `${peso(nightlyFor(h))}/night` : 'No price'}
            {!compact && nights && (nights.length ? ` · Night ${nights.join(', ')}` : ' · unused')}
          </span>
        </span>
        {onClear && (
          <button type="button" onClick={onClear} aria-label={`No hotel this night`}
            className="w-7 h-7 -mr-0.5 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-4 h-4" aria-hidden /></button>
        )}
      </div>
    </div>
  );
}

/** The bottom of a day column: tonight's hotel. Drop a hotel here, drag it to another night, or pick from the list. */
function NightSlot({ i, hotel, hotels, ops, active, hot, onDragOver, onDrop, onDragStart, onDragEnd, dragging }) {
  return (
    <div onDragOver={onDragOver} onDrop={onDrop}
      className={`rounded-[12px] p-1.5 -mx-0.5 transition-colors ${hot ? 'bg-[rgba(88,86,214,0.18)] ring-2 ring-[#5856D6]' : active ? 'bg-[rgba(88,86,214,0.08)]' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <span className="text-footnote font-semibold uppercase tracking-wide text-label-2">Night {i + 1}</span>
        {hotels.length > 0 && (
          <select value={hotel?.uid || ''} onChange={e => ops.setNight(i, e.target.value || null)} aria-label={`Hotel for night ${i + 1}`}
            className="h-6 max-w-[110px] pl-1.5 pr-0.5 rounded-[7px] bg-surface text-footnote font-semibold text-tint-ink outline-none focus:ring-2 focus:ring-tint cursor-pointer">
            <option value="">None</option>
            {hotels.map(h => <option key={h.uid} value={h.uid}>{h.name}</option>)}
          </select>
        )}
      </div>
      {hotel ? (
        <HotelCard h={hotel} compact onDragStart={onDragStart(hotel)} onDragEnd={onDragEnd} dragging={dragging} onClear={() => ops.setNight(i, null)} />
      ) : (
        <p className={`flex items-center justify-center gap-1.5 h-[56px] rounded-[12px] border-2 border-dashed text-footnote ${active ? 'border-[#5856D6] text-[#5856D6]' : 'border-separator text-label-3'}`}>
          <BedDouble className="w-4 h-4" aria-hidden />Drop a hotel
        </p>
      )}
    </div>
  );
}
