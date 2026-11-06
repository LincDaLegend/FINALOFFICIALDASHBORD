'use client';

// One page: the pool (places + hotels you might use) and a timetable of the days.
// Drag from the pool into a day; travel between entries is added automatically from real drive times.
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import './trip.css';
import { X, Car, BedDouble, Ship, Loader2, PiggyBank, ExternalLink, Inbox, CalendarClock, Lock, LockOpen, Plus, MapPin, Clock, StickyNote } from 'lucide-react';
import { Segmented, Button, useToast } from '../business/ui.jsx';
import { DAYS, schedule, fmtClock, fmtDur, peso, addDays, placesById, stayOf, nightlyFor, bookingLinks, colorOf, hasSpot, asEntry } from './tripData.js';
import PlaceInfo from './PlaceInfo.jsx';
import { PlacePhoto, MustStar, HotelForm, PriceCell, DurationPick, postTrip, tripPayload, fmtDay, fmtKm, useGeocode, GeoPick } from './tripUi.jsx';

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
  const [entryFor, setEntryFor] = useState(null); // { day, n }: a day's "+" opens the entry form for that day
  const [info, setInfo] = useState(null); // { kind: 'place' | 'hotel', uid }: the details sheet
  const onOpen = (kind, uid) => setInfo({ kind, uid });
  const infoItem = info && (info.kind === 'hotel' ? (trip.hotels || []).find(h => h.uid === info.uid) : trip.pool.find(p => p.uid === info.uid));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
        <div className="lg:sticky lg:top-5">
          <Pool trip={trip} setTrip={setTrip} ops={ops} dnd={dnd} entryFor={entryFor} onOpen={onOpen} />
        </div>
        <Timetable trip={trip} ops={ops} routes={routes} dnd={dnd} onOpen={onOpen} onAddEntry={(day) => setEntryFor(e => ({ day, n: (e?.n || 0) + 1 }))} />
      </div>
      <MapCard trip={trip} ops={ops} routes={routes} />
      <PlaceInfo open={!!infoItem} onClose={() => setInfo(null)} trip={trip} ops={ops} item={infoItem} kind={info?.kind}
        when={info?.kind === 'place' && infoItem ? whereIs(trip, routes, infoItem.uid) : null} />
    </div>
  );
}

// ─── Pool ────────────────────────────────────────────────────────────────────

function Pool({ trip, setTrip, ops, dnd, entryFor, onOpen }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [near, setNear] = useState('');
  const planned = new Set(trip.days.flatMap(d => d.stops));
  const waiting = trip.pool.filter(p => !planned.has(p.uid));
  const byUid = placesById(trip);
  const scheduled = trip.days.flatMap((d, day) => d.stops.map(u => byUid[u] && { p: byUid[u], day }).filter(Boolean));
  const hotels = trip.hotels || [];
  const located = trip.pool.filter(hasSpot);
  const nearUid = located.some(p => p.uid === near) ? near : located[located.length - 1]?.uid || '';
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
                  <button type="button" onClick={() => onOpen('place', p.uid)} aria-label={`Details: ${p.name}`} className="min-w-0 flex-1 flex items-center gap-2.5 text-left rounded-[9px] hover:opacity-80">
                    <PlacePhoto place={p} className="w-10 h-10 rounded-[9px]" iconSize={18} lookup={!p.custom} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-subhead font-semibold leading-snug line-clamp-2">{p.name}</span>
                      {p.custom && <span className="block text-footnote text-label-2 truncate">{hasSpot(p) ? p.area || 'Own place' : 'Where you are'}</span>}
                    </span>
                  </button>
                  <button type="button" onClick={() => ops.remove(p.uid)} aria-label={`Remove ${p.name}`}
                    className="w-7 h-7 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-4 h-4" aria-hidden /></button>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <DurationPick mins={p.mins} name={p.name} onChange={mins => ops.update(p.uid, { mins })} />
                  {p.custom
                    ? <AtPick at={p.at} name={p.name} onChange={at => ops.update(p.uid, { at })} />
                    : <MustStar size="sm" on={p.must} name={p.name} onToggle={() => ops.update(p.uid, { must: !p.must })} />}
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
        {scheduled.length > 0 && (
          <>
            <Head title="On a day" note={`${scheduled.length}`} />
            <ul className="px-2 space-y-1">
              {scheduled.map(({ p, day }) => (
                <li key={p.uid} draggable onDragStart={dnd.start({ kind: 'place', id: p.uid, from: day })} onDragEnd={dnd.end}
                  className={`flex items-center gap-2 rounded-[10px] bg-fill/60 p-1.5 pl-2 cursor-grab active:cursor-grabbing transition-opacity ${dnd.drag?.id === p.uid ? 'opacity-40' : ''}`}>
                  <button type="button" onClick={() => onOpen('place', p.uid)} aria-label={`Details: ${p.name}`} className="min-w-0 flex-1 flex items-center gap-2 text-left hover:opacity-80">
                    <PlacePhoto place={p} className="w-7 h-7 rounded-[7px]" iconSize={14} />
                    <span className="min-w-0 flex-1 text-subhead truncate">{p.name}</span>
                  </button>
                  <select value={day} onChange={e => ops.move(p.uid, e.target.value === '' ? null : +e.target.value)} aria-label={`Day for ${p.name}`}
                    className="h-7 w-[70px] pl-1.5 rounded-[8px] bg-surface text-footnote font-semibold text-label outline-none focus:ring-2 focus:ring-tint cursor-pointer">
                    {trip.days.map((_, i) => <option key={i} value={i}>Day {i + 1}</option>)}
                    <option value="">Unplan</option>
                  </select>
                  <button type="button" onClick={() => ops.remove(p.uid)} aria-label={`Remove ${p.name}`}
                    className="w-7 h-7 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-4 h-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          </>
        )}
        <EntryForm trip={trip} setTrip={setTrip} preset={entryFor} />

        <Head title="Hotels" note="₱ per night" />
        {hotels.length > 0 && (
          <ul className="px-2 space-y-1.5">
            {hotels.map(h => {
              const n = nightsOf(h.uid);
              return (
                <li key={h.uid} draggable onDragStart={dnd.start({ kind: 'hotel', id: h.uid, from: 'pool' })} onDragEnd={dnd.end}
                  className="rounded-[12px] bg-fill p-2 cursor-grab active:cursor-grabbing">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onOpen('hotel', h.uid)} aria-label={`Details: ${h.name}`} className="min-w-0 flex-1 flex items-center gap-2 text-left hover:opacity-80">
                      <span className="w-10 h-10 rounded-[9px] bg-[#5856D6] text-white flex items-center justify-center shrink-0"><BedDouble className="w-5 h-5" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-subhead font-semibold leading-snug truncate">{h.name}</span>
                        <span className="block text-footnote text-label-2 truncate">{n.length ? `Night ${n.join(', ')}` : 'Not used'}{h.address ? ` · ${h.address}` : ''}</span>
                      </span>
                    </button>
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
      out.push({ type: 'travel', from: times[k - 1].leave, to: times[k].reach, leg });
    }
    if (p.role === 'from') out.push({ type: 'leave', at: times[k].leave, hotel: p });
    else if (p.role === 'to') out.push({ type: 'night', at: times[k].arrive, hotel: p });
    else out.push({ type: 'stop', from: times[k].arrive, to: times[k].leave, place: p, behind: p.at ? Math.max(0, times[k].reach - toMin(p.at)) : 0 });
  });
  const last = times[times.length - 1];
  const ends = last ? (pts[pts.length - 1].role === 'to' ? last.arrive : last.leave) : toMin(day.start);
  return { entries: out, ends, loading: route.loading };
}

/** Day, times and the drive in for a scheduled place (null if it's not on a day). */
function whereIs(trip, routes, uid) {
  const day = trip.days.findIndex(d => d.stops.includes(uid));
  if (day < 0) return null;
  const { entries } = entriesOf(trip, day, routes[day]);
  const k = entries.findIndex(e => e.type === 'stop' && e.place.uid === uid);
  if (k < 0) return null;
  const e = entries[k], tr = entries[k - 1]?.type === 'travel' ? entries[k - 1] : null, prev = tr ? entries[k - 2] : null;
  const backBy = toMin(trip.prefs.backBy || '21:00');
  return {
    day, from: e.from, to: e.to, late: e.to > backBy || e.behind > 0,
    travel: tr && tr.leg.min >= 1 ? { min: tr.leg.min, km: tr.leg.km - (tr.leg.ferryKm || 0), ferry: tr.leg.ferryKm > 0.5, from: prev?.place?.name || prev?.hotel?.name || 'the last stop' } : null,
  };
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

function Timetable({ trip, ops, routes, dnd, onAddEntry, onOpen }) {
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
          {trip.days.map((d, i) => <DayHead key={i} trip={trip} i={i} info={days[i]} backBy={backBy} ops={ops} onAddEntry={onAddEntry} />)}

          {/* Time axis */}
          <div className="sticky left-0 z-20 bg-surface relative shadow-[0.5px_0_0_var(--separator)]" style={{ height }}>
            {hours.map(m => (
              <span key={m} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] text-label-2 tabular" style={{ top: y(m) }}>{fmtClock(m).replace(':00', '')}</span>
            ))}
          </div>

          {/* One column per day */}
          {trip.days.map((d, i) => (
            <DayColumn key={i} trip={trip} i={i} info={days[i]} height={height} y={y} backBy={backBy} ops={ops} dnd={dnd} onOpen={onOpen} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DayHead({ trip, i, info, backBy, ops, onAddEntry }) {
  const d = trip.days[i];
  const late = d.stops.length > 0 && info.ends > backBy;
  return (
    <div id={`day-col-${i}`} className="px-2 pb-2 snap-start min-w-0">
      <div className="flex items-center gap-1">
        <p className="text-headline min-w-0 flex-1 truncate">Day {i + 1} <span className="text-subhead font-normal text-label-2">· {fmtDay(addDays(trip.startDate, i), { weekday: 'short', day: 'numeric' })}</span></p>
        <button type="button" onClick={() => onAddEntry(i)} aria-label={`Add an entry to Day ${i + 1}`} title="Add entry"
          className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-tint-ink hover:bg-tint-soft pressable shrink-0"><Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden /></button>
      </div>
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

function DayColumn({ trip, i, info, height, y, backBy, ops, dnd, onOpen }) {
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
        return <StopBlock key={e.place.uid} e={e} i={i} late={e.to > backBy || e.behind > 0} ops={ops} dnd={dnd} onOpen={onOpen} />;
      })}

      {!isLast && !night && (
        <NightSlot top={emptyNightY} i={i} hotels={trip.hotels || []} ops={ops} hot={over && hotelOk} />
      )}

      {lineY != null && <div className="absolute inset-x-1 h-1 rounded-full bg-tint pointer-events-none z-30" style={{ top: lineY }} aria-hidden />}
    </div>
  );
}

function StopBlock({ e, i, late, ops, dnd, onOpen }) {
  const p = e.place;
  const [editing, setEditing] = useState(false);
  const h = e.h;
  const roomy = h >= 84; // tall enough to show its controls; shorter blocks show them on hover / tap
  const note = (p.note || '').trim();
  // How much of the note fits under the name and times (the rest shows on hover, or in the details)
  const noteLines = h >= 150 ? 'line-clamp-4' : h >= 110 ? 'line-clamp-2' : 'line-clamp-1';
  return (
    <div draggable={!editing} onDragStart={dnd.start({ kind: 'place', id: p.uid, from: i })} onDragEnd={dnd.end} tabIndex={0}
      className={`group absolute inset-x-1 rounded-[10px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)] overflow-hidden cursor-grab active:cursor-grabbing
        hover:z-20 focus-within:z-20 ${note ? 'hover:min-h-[112px] focus-within:min-h-[112px] focus:min-h-[112px]' : 'hover:min-h-[76px] focus-within:min-h-[76px] focus:min-h-[76px]'} focus:z-20 outline-none focus:ring-2 focus:ring-tint
        ${editing ? 'z-30 min-h-[150px] shadow-[0_8px_24px_rgba(0,0,0,0.18)]' : ''} ${late ? 'ring-1 ring-red' : ''} ${dnd.drag?.id === p.uid ? 'opacity-40' : ''}`}
      style={{ top: e.top, height: h }}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: colorOf(p) }} aria-hidden />
      <div className="pl-2.5 pr-1 py-1">
        <div className="flex items-start gap-0.5">
          <span className="min-w-0 flex-1">
            <button type="button" onClick={() => onOpen('place', p.uid)} title="Details"
              className={`block w-full text-left text-footnote font-semibold leading-tight hover:text-tint-ink ${roomy ? 'line-clamp-2' : 'truncate'}`}>{p.name}</button>
            <span className={`flex items-center gap-0.5 text-[11px] tabular whitespace-nowrap ${late ? 'text-red-ink font-semibold' : 'text-label-2'}`}
              title={p.at ? (e.behind ? `Set for ${fmtClock(toMin(p.at))}: ${fmtDur(e.behind)} late` : `Set for ${fmtClock(toMin(p.at))}`) : undefined}>
              {p.at && <Clock className="w-3 h-3 shrink-0" aria-label="Fixed time" />}{fmtRange(e.from, e.to)}
              {note && !roomy && <StickyNote className="w-3 h-3 shrink-0 ml-0.5 text-orange-ink group-hover:hidden group-focus-within:hidden" aria-label="Has a note" />}
            </span>
          </span>
          <button type="button" onClick={() => setEditing(true)} aria-label={note ? `Edit note for ${p.name}` : `Add a note to ${p.name}`} title={note ? 'Edit note' : 'Add note'}
            className={`w-6 h-6 -mt-0.5 items-center justify-center pressable shrink-0 ${editing ? 'hidden' : roomy ? 'flex' : 'hidden group-hover:flex group-focus-within:flex group-focus:flex'} ${note ? 'text-orange-ink' : 'text-label-3 hover:text-label'}`}>
            <StickyNote className="w-3.5 h-3.5" aria-hidden />
          </button>
          <button type="button" onClick={() => ops.move(p.uid, null)} aria-label={`Back to pool: ${p.name}`} title="Back to pool"
            className="w-6 h-6 -mt-0.5 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0"><X className="w-3.5 h-3.5" aria-hidden /></button>
        </div>
        {editing ? (
          <textarea autoFocus value={p.note || ''} onChange={ev => ops.update(p.uid, { note: ev.target.value || null })}
            onBlur={() => setEditing(false)} onKeyDown={ev => { if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) { ev.preventDefault(); ev.currentTarget.blur(); } }}
            rows={3} maxLength={600} placeholder="Note…" aria-label={`Note for ${p.name}`}
            className="mt-1 w-full px-2 py-1 rounded-[8px] bg-[rgba(255,204,0,0.16)] text-[12px] leading-snug text-label outline-none focus:ring-2 focus:ring-tint resize-none placeholder:text-label-3" />
        ) : note ? (
          <p className={`mt-1 flex gap-1 text-[11px] leading-snug text-label ${roomy ? '' : 'hidden group-hover:flex group-focus-within:flex group-focus:flex'}`}
            onDoubleClick={() => setEditing(true)} title={note}>
            <StickyNote className="w-3 h-3 mt-[1px] shrink-0 text-orange-ink" aria-hidden />
            <span className={`min-w-0 whitespace-pre-line break-words ${noteLines}`}>{note}</span>
          </p>
        ) : null}
        <div className={`items-center gap-0.5 mt-1 ${editing ? 'hidden' : roomy ? 'flex' : 'hidden group-hover:flex group-focus-within:flex group-focus:flex'}`}>
          <DurationPick mins={p.mins} name={p.name} onChange={mins => ops.update(p.uid, { mins })} />
          {p.custom
            ? <AtPick at={p.at} name={p.name} onChange={at => ops.update(p.uid, { at })} />
            : <MustStar size="sm" on={p.must} name={p.name} onToggle={() => ops.update(p.uid, { must: !p.must })} />}
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
      <TripMap points={routes[day].pts.filter(p => !p.here)} line={routes[day].line}
        extras={waiting.filter(hasSpot).map(p => ({ ...p, id: p.uid }))} onPick={(p) => ops.move(p.uid, day)} />
    </section>
  );
}

// ─── Custom entries ──────────────────────────────────────────────────────────

/** Optional fixed start time; empty = whenever you get there. */
function AtPick({ at, name, onChange }) {
  return (
    <label className="relative flex items-center" title="Fixed start time (optional)">
      <Clock className={`absolute left-1.5 w-3 h-3 pointer-events-none ${at ? 'text-tint-ink' : 'text-label-3'}`} aria-hidden />
      <input type="time" value={at || ''} onChange={e => onChange(e.target.value || null)} aria-label={`Start time for ${name}`}
        className={`h-7 w-[92px] pl-5 pr-0.5 rounded-[8px] bg-fill text-footnote font-semibold tabular outline-none focus:ring-2 focus:ring-tint ${at ? 'text-label' : 'text-label-3'}`} />
    </label>
  );
}

const ENTRY_IDEAS = ['Lunch', 'Dinner', 'Check-in', 'Check-out', 'Rest', 'Flight', 'Shopping'];

/** Add your own timetable entry: lunch, check-in, a flight… with an optional place and fixed time. */
function EntryForm({ trip, setTrip, preset }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', mins: 60, at: '', day: '', address: '' });
  const box = useRef(null);
  const address = draft.address.trim();
  const [geo, setPick] = useGeocode(draft.name.trim(), address);
  const hit = address ? geo.results?.[geo.pick] : null;
  const input = 'h-10 px-3 rounded-[10px] bg-fill text-callout outline-none focus:ring-2 focus:ring-tint';
  const ready = draft.name.trim() && (!address || (hit && !geo.loading));

  // A day's "+" opens the form for that day
  useEffect(() => {
    if (!preset) return;
    setOpen(true);
    setDraft(d => ({ ...d, day: String(preset.day) }));
    requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [preset]);

  const close = () => { setOpen(false); setDraft({ name: '', mins: 60, at: '', day: '', address: '' }); };
  const add = (e) => {
    e.preventDefault();
    if (!ready) return;
    const entry = asEntry({ name: draft.name.trim(), mins: draft.mins, at: draft.at, spot: hit ? { lat: hit.lat, lon: hit.lon, area: hit.area || hit.label } : null });
    const day = draft.day === '' ? null : +draft.day;
    setTrip(t => {
      const days = t.days.map((d, i) => {
        if (i !== day) return d;
        // A fixed-time entry goes before the first spot that would start after it
        let at = d.stops.length;
        if (entry.at) {
          const byId = Object.fromEntries(t.pool.map(p => [p.uid, p]));
          let clock = toMin(d.start);
          for (let k = 0; k < d.stops.length; k++) {
            if (clock >= toMin(entry.at)) { at = k; break; }
            clock += byId[d.stops[k]]?.mins || 0;
          }
        }
        return { ...d, stops: [...d.stops.slice(0, at), entry.uid, ...d.stops.slice(at)] };
      });
      return { ...t, pool: [...t.pool, entry], days };
    });
    toast(day == null ? 'Entry added to the pool' : `Entry added to Day ${day + 1}`, <CalendarClock className="w-4 h-4 text-tint" aria-hidden />);
    close();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 pl-4 pr-3 py-3 text-left text-tint-ink font-semibold row-press">
        <span className="w-10 h-10 rounded-[10px] bg-tint-soft flex items-center justify-center shrink-0"><Plus className="w-5 h-5" strokeWidth={2.5} aria-hidden /></span>
        Add entry
      </button>
    );
  }

  return (
    <form ref={box} onSubmit={add} className="mx-2 my-2 p-3 space-y-2 rounded-[12px] bg-surface-2">
      <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Lunch, check-in, flight…" aria-label="Entry name"
        maxLength={60} className={`w-full ${input}`} />
      {!draft.name && (
        <div className="flex flex-wrap gap-1">
          {ENTRY_IDEAS.map(n => (
            <button key={n} type="button" onClick={() => setDraft(d => ({ ...d, name: n }))}
              className="h-7 px-2.5 rounded-full bg-fill text-footnote font-medium text-label-2 hover:text-label pressable">{n}</button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <DurationPick mins={draft.mins} name="this entry" onChange={mins => setDraft(d => ({ ...d, mins }))} />
        <AtPick at={draft.at} name="this entry" onChange={at => setDraft(d => ({ ...d, at: at || '' }))} />
        <select value={draft.day} onChange={e => setDraft(d => ({ ...d, day: e.target.value }))} aria-label="Day"
          className="h-7 pl-1.5 rounded-[8px] bg-fill text-footnote font-semibold text-tint-ink outline-none focus:ring-2 focus:ring-tint cursor-pointer">
          <option value="">Pool</option>
          {trip.days.map((_, i) => <option key={i} value={i}>Day {i + 1}</option>)}
        </select>
      </div>
      <label className="relative block">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" aria-hidden />
        <input value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
          placeholder="Where (optional)" aria-label="Entry address" className={`w-full pl-9 ${input}`} />
      </label>
      {address
        ? <GeoPick geo={geo} onPick={setPick} notFound={<p className="px-1 text-subhead text-orange-ink">Not found · clear it to use where you are</p>} />
        : <p className="px-1 text-footnote text-label-2">Blank: happens where you are, no extra driving.</p>}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="gray" type="button" className="!h-10" onClick={close}>Cancel</Button>
        <Button size="sm" type="submit" className="!h-10" disabled={!ready}>Add</Button>
      </div>
    </form>
  );
}
