'use client';

// One page: the pool (places + hotels you might use) and a timetable of the days.
// Drag from the pool into a day; travel between entries is added automatically from real drive times.
import { useState } from 'react';
import dynamic from 'next/dynamic';
import './trip.css';
import { X, Car, BedDouble, Ship, Loader2, PiggyBank, ExternalLink, Inbox, CalendarClock, Lock, LockOpen } from 'lucide-react';
import { Segmented, Button, useToast } from '../business/ui.jsx';
import { DAYS, schedule, fmtClock, fmtDur, peso, addDays, placesById, stayOf, nightlyFor, bookingLinks, colorOf } from './tripData.js';
import { PlacePhoto, MustStar, HotelForm, PriceCell, DurationPick, postTrip, tripPayload, fmtDay, fmtKm } from './tripUi.jsx';

const TripMap = dynamic(() => import('./TripMap.jsx'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded-[16px] bg-fill" />,
});

const PX = 1.1; // timetable height: pixels per minute
const toMin = (t) => { const [h, m] = (t || '08:00').split(':').map(Number); return h * 60 + (m || 0); };
/** "8:00–9:30 AM", or "11:30 AM–1:00 PM" when it crosses noon: short enough for a narrow column. */
const fmtRange = (a, b) => {
  const [x, y] = [fmtClock(a), fmtClock(b)];
  const [tx, px] = x.split(' '), [ty, py] = y.split(' ');
  return px && px === py ? `${tx}–${ty} ${py}` : `${x}–${y}`;
};

export default function Planner({ trip, setTrip, ops, routes }) {
  // drag = { kind: 'place' | 'hotel', id, from: 'pool' | day index }
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null); // { day, index } | 'pool'
  const start = (d) => (e) => { e.dataTransfer.setData('text/plain', `${d.kind}:${d.id}`); e.dataTransfer.effectAllowed = 'move'; setDrag(d); };
  const end = () => { setDrag(null); setOver(null); };
  const dnd = { drag, over, setOver, start, end };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
        <div className="lg:sticky lg:top-5">
          <Pool trip={trip} setTrip={setTrip} ops={ops} dnd={dnd} />
        </div>
        <Timetable trip={trip} ops={ops} routes={routes} dnd={dnd} />
      </div>
      <MapCard trip={trip} ops={ops} routes={routes} />
    </div>
  );
}

// ─── Pool ────────────────────────────────────────────────────────────────────

function Pool({ trip, setTrip, ops, dnd }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [near, setNear] = useState('');
  const planned = new Set(trip.days.flatMap(d => d.stops));
  const waiting = trip.pool.filter(p => !planned.has(p.uid));
  const hotels = trip.hotels || [];
  const nearUid = trip.pool.some(p => p.uid === near) ? near : trip.pool[trip.pool.length - 1]?.uid || '';
  const nearPlace = trip.pool.find(p => p.uid === nearUid);
  const nightsOf = (id) => trip.days.slice(0, DAYS - 1).flatMap((d, k) => (d.hotel === id ? [k + 1] : []));
  const isOver = dnd.over === 'pool';

  // Dropping on the pool takes a place off its day, or a hotel off its night
  const drop = (e) => {
    e.preventDefault();
    const d = dnd.drag;
    dnd.end();
    if (!d) return;
    if (d.kind === 'place' && d.from !== 'pool') ops.move(d.id, null);
    if (d.kind === 'hotel' && typeof d.from === 'number') ops.setNight(d.from, null);
  };

  const cheapest = async () => {
    setBusy(true);
    try {
      const res = await postTrip({ ...tripPayload(trip), mode: 'cost', hotelsOnly: true });
      if (res.noHotels) { toast('Add a price to your hotels first'); return; }
      const prev = trip;
      setTrip(t => ({ ...t, days: t.days.map((d, k) => {
        if (k >= DAYS - 1) return d;
        const h = res.hotels[k] ?? null;
        return { ...d, hotel: h, pin: !!d.pin && d.hotel === h };
      }) }));
      toast(res.mustMissed?.length ? `Cheapest picked · not enough nights for ${res.mustMissed.join(', ')}` : 'Cheapest hotels picked',
        <PiggyBank className="w-4 h-4 text-tint" aria-hidden />, { label: 'Undo', onClick: () => setTrip(prev) });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const area = nearPlace?.area?.split(', ').pop();
  const links = nearPlace ? bookingLinks({ lat: nearPlace.lat, lon: nearPlace.lon, area, checkin: trip.startDate, guests: trip.guests, rooms: Math.max(1, Math.ceil(trip.guests / 2)) }) : null;

  return (
    <section aria-label="Pool" onDrop={drop}
      onDragOver={(e) => { if (!dnd.drag || dnd.drag.from === 'pool') return; e.preventDefault(); if (!isOver) dnd.setOver('pool'); }}
      className={`trip-touch rounded-[18px] bg-surface overflow-hidden transition-shadow ${isOver ? 'ring-2 ring-tint' : ''}`}>
      <div className="px-4 pt-4 pb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-title-2">Pool</h2>
        <a href="#find" className="text-subhead text-tint-ink">Find places</a>
      </div>

      <div className="max-h-[none] lg:max-h-[calc(100dvh-120px)] overflow-y-auto pb-1">
        <Head title="Places" note={waiting.length ? `${waiting.length} to schedule` : trip.pool.length ? 'all scheduled' : ''} />
        {waiting.length ? (
          <ul className="px-2 space-y-1.5">
            {waiting.map(p => (
              <li key={p.uid} draggable onDragStart={dnd.start({ kind: 'place', id: p.uid, from: 'pool' })} onDragEnd={dnd.end}
                className={`rounded-[12px] bg-fill p-2 cursor-grab active:cursor-grabbing transition-opacity ${dnd.drag?.id === p.uid ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <PlacePhoto place={p} className="w-10 h-10 rounded-[9px]" iconSize={18} />
                  <span className="min-w-0 flex-1 text-subhead font-semibold leading-snug line-clamp-2">{p.name}</span>
                  <button type="button" onClick={() => ops.remove(p.uid)} aria-label={`Remove ${p.name}`}
                    className="w-7 h-7 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-4 h-4" aria-hidden /></button>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <DurationPick mins={p.mins} name={p.name} onChange={mins => ops.update(p.uid, { mins })} />
                  <MustStar size="sm" on={p.must} name={p.name} onToggle={() => ops.update(p.uid, { must: !p.must })} />
                  {/* Phones can't drag: pick a day instead */}
                  <select value="" onChange={e => e.target.value !== '' && ops.move(p.uid, +e.target.value)} aria-label={`Add ${p.name} to a day`}
                    className="ml-auto h-7 w-[84px] pl-1.5 rounded-[8px] bg-surface text-footnote font-semibold text-tint-ink outline-none focus:ring-2 focus:ring-tint cursor-pointer">
                    <option value="">Add to…</option>
                    {trip.days.map((_, i) => <option key={i} value={i}>Day {i + 1}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 px-4 py-2 text-subhead text-label-2"><Inbox className="w-4 h-4" aria-hidden />{trip.pool.length ? 'Everything is on a day.' : 'Add places below.'}</p>
        )}

        <Head title="Hotels" note="₱ per night" />
        {hotels.length > 0 && (
          <ul className="px-2 space-y-1.5">
            {hotels.map(h => {
              const n = nightsOf(h.uid);
              return (
                <li key={h.uid} draggable onDragStart={dnd.start({ kind: 'hotel', id: h.uid, from: 'pool' })} onDragEnd={dnd.end}
                  className="rounded-[12px] bg-fill p-2 cursor-grab active:cursor-grabbing">
                  <div className="flex items-center gap-2">
                    <span className="w-10 h-10 rounded-[9px] bg-[#5856D6] text-white flex items-center justify-center shrink-0"><BedDouble className="w-5 h-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-subhead font-semibold leading-snug truncate">{h.name}</span>
                      <span className="block text-footnote text-label-2 truncate">{n.length ? `Night ${n.join(', ')}` : 'Not used'}{h.address ? ` · ${h.address}` : ''}</span>
                    </span>
                    <button type="button" onClick={() => ops.removeHotel(h.uid)} aria-label={`Remove ${h.name}`}
                      className="w-7 h-7 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-4 h-4" aria-hidden /></button>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <PriceCell value={h.price} label={`${h.name} price per night`} onCommit={v => ops.updateHotel(h.uid, { price: v })} />
                    <MustStar size="sm" on={!!h.must} name={h.name} word="must-stay" onToggle={() => ops.updateHotel(h.uid, { must: !h.must })} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <HotelForm trip={trip} ops={ops} near={nearUid} onNear={setNear} />
        <div className="px-3 pb-3 space-y-2">
          {hotels.length > 0 && (
            <Button size="sm" variant="gray" onClick={cheapest} disabled={busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <PiggyBank className="w-4 h-4" aria-hidden />}Cheapest hotels
            </Button>
          )}
          {links && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-footnote text-label-2">
              Prices:
              {[['Airbnb', links.airbnb], ['Booking', links.booking], ['Agoda', links.agoda]].map(([n, u]) => (
                <a key={n} href={u} target="_blank" rel="noopener noreferrer" className="text-tint-ink inline-flex items-center gap-0.5">{n}<ExternalLink className="w-3 h-3" aria-hidden /></a>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Head({ title, note }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1.5">
      <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-2">{title}</h3>
      {note && <span className="text-footnote text-label-2">{note}</span>}
    </div>
  );
}

// ─── Timetable ───────────────────────────────────────────────────────────────

/** Turn a day into timetable entries: hotel (morning), spot, travel, spot, … travel, hotel (night). */
function entriesOf(trip, i, route) {
  const day = trip.days[i];
  const { pts, legs } = route;
  const times = schedule(day, pts, legs);
  const out = [];
  pts.forEach((p, k) => {
    if (k > 0) {
      const leg = legs[k - 1] || { min: 0, km: 0 };
      out.push({ type: 'travel', from: times[k - 1].leave, to: times[k].arrive, leg });
    }
    if (p.role === 'from') out.push({ type: 'leave', at: times[k].leave, hotel: p });
    else if (p.role === 'to') out.push({ type: 'night', at: times[k].arrive, hotel: p });
    else out.push({ type: 'stop', from: times[k].arrive, to: times[k].leave, place: p });
  });
  const last = times[times.length - 1];
  const ends = last ? (pts[pts.length - 1].role === 'to' ? last.arrive : last.leave) : toMin(day.start);
  return { entries: out, ends, loading: route.loading };
}

const LEAVE_H = 22, STOP_MIN_H = 30, NIGHT_H = 44, TRAVEL_MIN_H = 22, GAP = 2;

/**
 * Pixel positions for a day's entries. Blocks sit at their clock time when there's room;
 * when short stays or short drives would make them collide, later blocks slide down so
 * nothing overlaps (each block still shows its real times).
 */
function layoutDay(entries, y, freeDay, start) {
  let cursor = -Infinity;
  const out = entries.map((e) => {
    if (e.type === 'leave') {
      const top = y(e.at) - LEAVE_H - GAP;
      cursor = top + LEAVE_H + GAP;
      return { ...e, top, h: LEAVE_H };
    }
    if (e.type === 'travel') {
      if (freeDay) return { ...e, hidden: true };
      const top = Math.max(y(e.from), cursor);
      const h = Math.max(y(e.to) - y(e.from), e.leg.min >= 1 ? TRAVEL_MIN_H : 0);
      cursor = top + h;
      return { ...e, top, h };
    }
    if (e.type === 'night') {
      const top = freeDay ? y(start) + 64 : Math.max(y(e.at), cursor + GAP);
      cursor = top + NIGHT_H;
      return { ...e, top, h: NIGHT_H };
    }
    const top = Math.max(y(e.from), cursor + GAP);
    const h = Math.max(STOP_MIN_H, (e.to - e.from) * PX);
    cursor = top + h;
    return { ...e, top, h };
  });
  return { laid: out, bottom: cursor };
}

function Timetable({ trip, ops, routes, dnd }) {
  const backBy = toMin(trip.prefs.backBy || '21:00');
  const days = trip.days.map((_, i) => entriesOf(trip, i, routes[i]));
  const first = Math.min(...trip.days.map(d => toMin(d.start)), 7 * 60);
  const axisStart = Math.floor((first - 30) / 60) * 60; // room above the first leave time for "From hotel"
  const y = (m) => (m - axisStart) * PX;
  days.forEach((info, i) => Object.assign(info, layoutDay(info.entries, y, !trip.days[i].stops.length, toMin(trip.days[i].start))));
  const lowest = Math.max(...days.map(d => d.bottom)) / PX + axisStart; // pushed-down blocks still fit
  const axisEnd = Math.ceil((Math.max(backBy + 60, lowest + 60, ...days.map(d => d.ends + 90))) / 60) * 60;
  const height = (axisEnd - axisStart) * PX;
  const hours = [];
  for (let m = axisStart; m <= axisEnd; m += 60) hours.push(m);

  return (
    <section aria-label="Timetable" className="rounded-[18px] bg-surface min-w-0">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-title-2 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-tint" aria-hidden />Timetable</h2>
        <span className="text-footnote text-label-2">Drag spots and hotels onto a day</span>
      </div>
      <div className="trip-timetable overflow-x-auto pb-3 snap-x">
        <div className="grid" style={{ gridTemplateColumns: `44px repeat(${DAYS}, minmax(150px, 1fr))`, minWidth: 44 + DAYS * 150 }}>
          {/* Header row */}
          <div className="sticky left-0 z-20 bg-surface" />
          {trip.days.map((d, i) => <DayHead key={i} trip={trip} i={i} info={days[i]} backBy={backBy} ops={ops} />)}

          {/* Time axis */}
          <div className="sticky left-0 z-20 bg-surface relative shadow-[0.5px_0_0_var(--separator)]" style={{ height }}>
            {hours.map(m => (
              <span key={m} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] text-label-2 tabular" style={{ top: y(m) }}>{fmtClock(m).replace(':00', '')}</span>
            ))}
          </div>

          {/* One column per day */}
          {trip.days.map((d, i) => (
            <DayColumn key={i} trip={trip} i={i} info={days[i]} height={height} y={y} backBy={backBy} ops={ops} dnd={dnd} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DayHead({ trip, i, info, backBy, ops }) {
  const d = trip.days[i];
  const late = d.stops.length > 0 && info.ends > backBy;
  return (
    <div id={`day-col-${i}`} className="px-2 pb-2 snap-start min-w-0">
      <p className="text-headline">Day {i + 1} <span className="text-subhead font-normal text-label-2">· {fmtDay(addDays(trip.startDate, i), { weekday: 'short', day: 'numeric' })}</span></p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
        <label className="flex items-center gap-1 text-footnote text-label-2">
          Leave
          <input type="time" value={d.start} aria-label={`Day ${i + 1} leave time`}
            onChange={e => e.target.value && ops.patchDay(i, x => ({ ...x, start: e.target.value }))}
            className="h-6 w-[78px] px-1 rounded-[7px] bg-fill text-footnote font-semibold text-label tabular outline-none focus:ring-2 focus:ring-tint" />
        </label>
        <span className={`text-footnote tabular ${late ? 'text-red-ink font-semibold' : 'text-label-2'}`}>
          {d.stops.length ? `Ends ${fmtClock(info.ends)}${late ? ' · late' : ''}` : 'Free'}
          {info.loading && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" aria-hidden />}
        </span>
      </div>
    </div>
  );
}

function DayColumn({ trip, i, info, height, y, backBy, ops, dnd }) {
  const d = trip.days[i];
  const isLast = i === DAYS - 1;
  const stops = info.laid.filter(e => e.type === 'stop');
  const night = isLast ? null : stayOf(trip, i);
  const over = dnd.over && dnd.over !== 'pool' && dnd.over.day === i ? dnd.over : null;
  const carrying = dnd.drag;
  const hotelOk = carrying?.kind === 'hotel' && !isLast;

  // Where in the day would a place land? Before the first spot whose middle is below the pointer.
  const indexAt = (e) => {
    const top = e.currentTarget.getBoundingClientRect().top;
    const px = e.clientY - top;
    const k = stops.findIndex(s => s.top + s.h / 2 > px);
    return k < 0 ? stops.length : k;
  };
  const onOver = (e) => {
    if (!carrying || (carrying.kind === 'hotel' && isLast)) return;
    e.preventDefault();
    const index = carrying.kind === 'place' ? indexAt(e) : null;
    if (!over || over.index !== index) dnd.setOver({ day: i, index });
  };
  const onDrop = (e) => {
    e.preventDefault();
    const c = dnd.drag, o = over;
    dnd.end();
    if (!c) return;
    if (c.kind === 'hotel') {
      if (isLast) return;
      ops.setNight(i, c.id);
      if (typeof c.from === 'number' && c.from !== i) ops.setNight(c.from, null);
      return;
    }
    const rest = stops.filter(s => s.place.uid !== c.id);
    const at = o?.index ?? rest.length;
    const before = stops[at] && stops[at].place.uid !== c.id ? stops[at].place.uid : rest[stops.slice(0, at).filter(s => s.place.uid !== c.id).length]?.place.uid ?? null;
    ops.move(c.id, i, before);
  };
  const lastStop = stops[stops.length - 1];
  const lineY = over && over.index != null ? (stops[over.index] ? stops[over.index].top - 2 : (lastStop ? lastStop.top + lastStop.h + 2 : y(info.ends) + 2)) : null;
  // An empty day shows "Drag places here" at its leave time, so the night slot goes below that box
  const emptyNightY = d.stops.length ? Math.max(y(info.ends), info.bottom) + 8 : y(toMin(d.start)) + 64;

  return (
    <div onDragOver={onOver} onDrop={onDrop} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) dnd.setOver(null); }}
      className={`relative mx-1 rounded-[12px] transition-colors ${over ? (hotelOk ? 'bg-[rgba(88,86,214,0.10)]' : 'bg-tint-soft') : 'bg-fill/60'}`}
      style={{ height, backgroundImage: `repeating-linear-gradient(to bottom, var(--separator) 0 0.5px, transparent 0.5px ${60 * PX}px)` }}>
      {/* back-by line */}
      <div className="absolute inset-x-0 border-t border-dashed border-red/70 pointer-events-none" style={{ top: y(backBy) }}>
        <span className="absolute right-1 -top-4 text-[10px] font-semibold text-red-ink">Back by {fmtClock(backBy)}</span>
      </div>

      {!d.stops.length && (
        <p className="absolute inset-x-2 text-center text-footnote text-label-3 rounded-[10px] border-2 border-dashed border-separator py-4" style={{ top: y(toMin(d.start)) }}>
          Drag places here
        </p>
      )}

      {info.laid.map((e, k) => {
        if (e.hidden) return null;
        if (e.type === 'travel') return <TravelBlock key={k} e={e} fuel={trip.fuel} />;
        if (e.type === 'leave') return <HotelBlock key={k} kind="leave" hotel={e.hotel} top={e.top} />;
        if (e.type === 'night') return (
          <HotelBlock key={k} kind="night" hotel={e.hotel} top={e.top} night={i + 1} pinned={!!d.pin}
            onPin={() => ops.togglePin(i)} onClear={() => ops.setNight(i, null)}
            onDragStart={dnd.start({ kind: 'hotel', id: e.hotel.uid, from: i })} onDragEnd={dnd.end} />
        );
        return <StopBlock key={e.place.uid} e={e} i={i} late={e.to > backBy} ops={ops} dnd={dnd} />;
      })}

      {!isLast && !night && (
        <NightSlot top={emptyNightY} i={i} hotels={trip.hotels || []} ops={ops} hot={over && hotelOk} />
      )}

      {lineY != null && <div className="absolute inset-x-1 h-1 rounded-full bg-tint pointer-events-none z-30" style={{ top: lineY }} aria-hidden />}
    </div>
  );
}

function StopBlock({ e, i, late, ops, dnd }) {
  const p = e.place;
  const h = e.h;
  const roomy = h >= 84; // tall enough to show its controls; shorter blocks show them on hover / tap
  return (
    <div draggable onDragStart={dnd.start({ kind: 'place', id: p.uid, from: i })} onDragEnd={dnd.end} tabIndex={0}
      className={`group absolute inset-x-1 rounded-[10px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)] overflow-hidden cursor-grab active:cursor-grabbing
        hover:z-20 focus-within:z-20 hover:min-h-[76px] focus-within:min-h-[76px] focus:min-h-[76px] focus:z-20 outline-none focus:ring-2 focus:ring-tint
        ${late ? 'ring-1 ring-red' : ''} ${dnd.drag?.id === p.uid ? 'opacity-40' : ''}`}
      style={{ top: e.top, height: h }}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: colorOf(p) }} aria-hidden />
      <div className="pl-2.5 pr-1 py-1">
        <div className="flex items-start gap-1">
          <span className="min-w-0 flex-1">
            <span className={`block text-footnote font-semibold leading-tight ${roomy ? 'line-clamp-2' : 'truncate'}`}>{p.name}</span>
            <span className={`block text-[11px] tabular whitespace-nowrap ${late ? 'text-red-ink font-semibold' : 'text-label-2'}`}>{fmtRange(e.from, e.to)}</span>
          </span>
          <button type="button" onClick={() => ops.move(p.uid, null)} aria-label={`Back to pool: ${p.name}`} title="Back to pool"
            className="w-6 h-6 -mt-0.5 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-3.5 h-3.5" aria-hidden /></button>
        </div>
        <div className={`items-center gap-0.5 mt-1 ${roomy ? 'flex' : 'hidden group-hover:flex group-focus-within:flex group-focus:flex'}`}>
          <DurationPick mins={p.mins} name={p.name} onChange={mins => ops.update(p.uid, { mins })} />
          <MustStar size="sm" on={p.must} name={p.name} onToggle={() => ops.update(p.uid, { must: !p.must })} />
        </div>
      </div>
    </div>
  );
}

function TravelBlock({ e, fuel }) {
  const h = e.h;
  const drive = e.leg.km - (e.leg.ferryKm || 0);
  const label = `${fmtDur(Math.round(e.leg.min))} · ${fmtKm(drive)}${e.leg.ferryKm > 0.5 ? ' + ferry' : ''}`;
  return (
    <div className="absolute left-3 right-1 flex items-center pointer-events-none" style={{ top: e.top, height: h }}
      title={`Drive ${label} · ${peso(drive * fuel.pricePerL / Math.max(1, fuel.kmPerL))} gas`}>
      <span className="absolute left-1.5 inset-y-0.5 border-l-2 border-dotted border-label-3" aria-hidden />
      {h >= 16 && (
        <span className="relative ml-3.5 inline-flex items-center gap-1 px-1.5 h-5 max-w-[calc(100%-14px)] overflow-hidden whitespace-nowrap rounded-full bg-fill text-[11px] font-medium text-label-2 tabular">
          {e.leg.ferryKm > 0.5 ? <Ship className="w-3 h-3" aria-hidden /> : <Car className="w-3 h-3" aria-hidden />}
          {e.leg.estimated ? '≈ ' : ''}{label}
        </span>
      )}
    </div>
  );
}

function HotelBlock({ kind, hotel, top, night, pinned, onPin, onClear, onDragStart, onDragEnd }) {
  if (kind !== 'night') {
    return (
      <div className="absolute inset-x-1 h-[22px] rounded-[8px] flex items-center gap-1 px-2 bg-[rgba(88,86,214,0.14)] text-[#5856D6]" style={{ top }}>
        <BedDouble className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate text-[11px] font-semibold">From {hotel.name}</span>
      </div>
    );
  }
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      className="absolute inset-x-1 h-[44px] rounded-[10px] bg-[#5856D6] text-white pl-2 pr-0.5 flex flex-col justify-center cursor-grab active:cursor-grabbing" style={{ top }}>
      <div className="flex items-center gap-1 min-w-0">
        <BedDouble className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-footnote font-semibold leading-tight">{hotel.name}</span>
        <button type="button" onClick={onClear} aria-label={`No hotel night ${night}`} className="w-6 h-5 flex items-center justify-center text-white/80 hover:text-white pressable shrink-0"><X className="w-3.5 h-3.5" aria-hidden /></button>
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/85 tabular leading-tight">Night {night} · {peso(nightlyFor(hotel))}</span>
        <button type="button" onClick={onPin} aria-pressed={pinned} aria-label={pinned ? `Unpin night ${night}` : `Pin night ${night}`}
          title={pinned ? 'Pinned: optimizers keep this hotel' : 'Not pinned: optimizers may change it'}
          className={`w-6 h-5 flex items-center justify-center pressable shrink-0 ${pinned ? 'text-white' : 'text-white/60 hover:text-white'}`}>
          {pinned ? <Lock className="w-3.5 h-3.5" strokeWidth={2.4} aria-hidden /> : <LockOpen className="w-3.5 h-3.5" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function NightSlot({ top, i, hotels, ops, hot }) {
  return (
    <div className={`absolute inset-x-1 rounded-[10px] border-2 border-dashed px-2 py-1.5 text-center ${hot ? 'border-[#5856D6] text-[#5856D6]' : 'border-separator text-label-3'}`} style={{ top }}>
      <p className="text-[11px] font-semibold flex items-center justify-center gap-1"><BedDouble className="w-3.5 h-3.5" aria-hidden />Night {i + 1} · drop a hotel</p>
      {hotels.length > 0 && (
        <select value="" onChange={e => e.target.value && ops.setNight(i, e.target.value)} aria-label={`Hotel for night ${i + 1}`}
          className="mt-1 h-6 max-w-full px-1.5 rounded-[7px] bg-surface text-[11px] font-semibold text-tint-ink outline-none focus:ring-2 focus:ring-tint cursor-pointer">
          <option value="">or pick…</option>
          {hotels.map(h => <option key={h.uid} value={h.uid}>{h.name}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── Map ─────────────────────────────────────────────────────────────────────

function MapCard({ trip, ops, routes }) {
  const [day, setDay] = useState(0);
  const planned = new Set(trip.days.flatMap(d => d.stops));
  const waiting = trip.pool.filter(p => !planned.has(p.uid));
  return (
    <section className="rounded-[18px] bg-surface p-3 sm:p-4 space-y-3" aria-label="Map">
      <Segmented label="Map day" size="sm" value={day} onChange={setDay} options={trip.days.map((_, i) => ({ value: i, label: `Day ${i + 1}` }))} />
      <TripMap points={routes[day].pts} line={routes[day].line}
        extras={waiting.map(p => ({ ...p, id: p.uid }))} onPick={(p) => ops.move(p.uid, day)} />
    </section>
  );
}
