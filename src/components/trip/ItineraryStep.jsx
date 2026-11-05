'use client';

// Step 3 · Itinerary: one day at a time (order, times, drive) + the trip's hotels.
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Reorder, useDragControls } from 'motion/react';
import { X, Plus, GripVertical, Car, BedDouble, ExternalLink, Ship, Loader2, Fuel, Timer, Heart, PiggyBank } from 'lucide-react';
import { Segmented, Button, useToast, SPRING } from '../business/ui.jsx';
import {
  DAYS, gasCost, schedule, fmtClock, fmtDur, peso, bookingLinks, mapsLink, addDays, colorOf, placesById, stayOf, nightlyFor,
} from './tripData.js';
import { PlacePhoto, DurationStepper, postTrip, tripPayload, fmtDay, fmtKm, HotelRow, HotelForm, isStay } from './tripUi.jsx';
import { Discover } from './WishlistStep.jsx';

const TripMap = dynamic(() => import('./TripMap.jsx'), {
  ssr: false,
  loading: () => <div className="h-[300px] lg:h-[480px] rounded-[16px] bg-fill" />,
});

const NO_DOTS = { items: [], onPick: null };

export default function ItineraryStep({ trip, setTrip, ops, routes, costs, dayIdx, setDayIdx }) {
  const [pane, setPane] = useState('plan');
  const planned = useMemo(() => new Set(trip.days.flatMap(d => d.stops)), [trip.days]);
  const unplanned = trip.pool.filter(p => !planned.has(p.uid));
  const addHere = (p) => ops.move(p.uid, dayIdx);
  const hotels = trip.hotels || [];
  const extras = pane === 'add' ? { items: unplanned.map(p => ({ ...p, id: p.uid })), onPick: addHere }
    : pane === 'hotels' ? { items: hotels.map(h => ({ ...h, id: h.uid })), onPick: dayIdx < DAYS - 1 ? (h) => ops.setNight(dayIdx, h.uid) : null }
    : NO_DOTS;

  return (
    <div className="space-y-5">
      <DayPicker trip={trip} costs={costs} value={dayIdx} onChange={setDayIdx} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8 items-start">
        <div className="space-y-3 lg:sticky lg:top-5">
          <TripMap points={routes[dayIdx].pts} line={routes[dayIdx].line} extras={extras.items} onPick={extras.onPick} />
          <DayStats cost={costs[dayIdx]} route={routes[dayIdx]} />
        </div>
        <div className="space-y-4 min-w-0">
          <Segmented label="Show" value={pane} onChange={setPane}
            options={[{ value: 'plan', label: 'Day plan' }, { value: 'add', label: 'Add places' }, { value: 'hotels', label: 'Hotels' }]} />
          {pane === 'plan' && <DayFlow trip={trip} i={dayIdx} route={routes[dayIdx]} ops={ops} onAdd={() => setPane('add')} onHotels={() => setPane('hotels')} />}
          {pane === 'add' && <AddPlaces trip={trip} ops={ops} items={unplanned} dayIdx={dayIdx} onAdd={addHere} />}
          {pane === 'hotels' && <Hotels trip={trip} setTrip={setTrip} ops={ops} dayIdx={dayIdx} />}
        </div>
      </div>
    </div>
  );
}

// ─── Day picker + day stats ──────────────────────────────────────────────────

function DayPicker({ trip, costs, value, onChange }) {
  return (
    <div role="tablist" aria-label="Day" className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {trip.days.map((d, i) => {
        const on = i === value;
        const c = costs[i].gas + costs[i].stay;
        return (
          <button key={i} type="button" role="tab" aria-selected={on} onClick={() => onChange(i)}
            className={`rounded-[14px] py-2.5 px-1 text-center pressable transition-colors ${on ? 'bg-tint text-white shadow-[0_4px_14px_rgba(0,122,255,0.35)]' : 'bg-surface text-label hover:bg-fill'}`}>
            <span className="block text-[16px] font-semibold">Day {i + 1}</span>
            <span className={`block text-footnote tabular ${on ? 'text-white/85' : 'text-label-2'}`}>{fmtDay(addDays(trip.startDate, i), { weekday: 'short', day: 'numeric' })}</span>
            <span className={`hidden sm:block text-footnote font-semibold mt-0.5 tabular ${on ? 'text-white' : c ? 'text-label' : 'text-label-3'}`}>
              {d.stops.length ? (c ? peso(c) : `${d.stops.length} stops`) : 'Free'}
            </span>
            {i < DAYS - 1 && <NightTag hotel={stayOf(trip, i)} on={on} />}
          </button>
        );
      })}
    </div>
  );
}

function NightTag({ hotel, on }) {
  const tone = on ? 'text-white/90' : hotel ? 'text-[#5856D6]' : 'text-orange-ink';
  return (
    <span className={`mt-1 mx-auto max-w-full px-1.5 flex items-center justify-center gap-1 text-[12px] font-medium ${tone}`} title={hotel ? hotel.name : 'No hotel yet'}>
      <BedDouble className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span className="hidden sm:inline truncate">{hotel ? hotel.name : 'No hotel'}</span>
      <span className="sm:hidden">{hotel ? '' : '?'}</span>
    </span>
  );
}

function DayStats({ cost, route }) {
  if (route.pts.length < 2) return null;
  const tile = (Icon, label, value) => (
    <div className="rounded-[14px] bg-surface px-3 py-2.5 min-w-0">
      <p className="text-footnote text-label-2 flex items-center gap-1"><Icon className="w-3.5 h-3.5" aria-hidden />{label}</p>
      <p className="text-[20px] font-semibold tabular leading-tight mt-0.5 truncate">{value}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {tile(Timer, 'Driving', fmtDur(cost.min))}
        {tile(Car, 'Distance', `${cost.estimated ? '≈' : ''}${Math.round(cost.km - cost.ferryKm)} km`)}
        {tile(Fuel, 'Gas', peso(cost.gas))}
      </div>
      {(route.loading || cost.ferryKm > 0.5) && (
        <p className="text-footnote text-label-2 px-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {route.loading && <span className="inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />Updating…</span>}
          {cost.ferryKm > 0.5 && <span className="inline-flex items-center gap-1"><Ship className="w-3.5 h-3.5" aria-hidden />{Math.round(cost.ferryKm)} km by ferry</span>}
        </p>
      )}
    </div>
  );
}

// ─── The day's timeline ──────────────────────────────────────────────────────

function Leg({ leg, fuel }) {
  if (!leg) return null;
  const drive = leg.km - (leg.ferryKm || 0);
  return (
    <div className="flex items-center gap-2 pl-[38px] pr-4 py-2 text-subhead text-label-2 tabular">
      <span className="w-[56px] flex justify-center shrink-0" aria-hidden><span className="w-0.5 h-5 rounded-full bg-separator" /></span>
      <Car className="w-4 h-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        {leg.estimated ? '≈ ' : ''}{fmtKm(drive)} · {fmtDur(leg.min)} · {peso(gasCost(drive, fuel))}
        {leg.ferryKm > 0.5 && <> · <Ship className="inline w-4 h-4 -mt-0.5" aria-hidden /> {Math.round(leg.ferryKm)} km</>}
      </span>
    </div>
  );
}

function Endpoint({ label, stay, time, onClick }) {
  const body = (
    <>
      <span className="w-[56px] h-[56px] rounded-[14px] bg-[#5856D6] text-white flex items-center justify-center shrink-0"><BedDouble className="w-6 h-6" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-footnote font-medium text-label-2">{label}</span>
        <span className={`block text-headline truncate ${stay ? '' : 'text-tint-ink'}`}>{stay ? stay.name : 'Pick a hotel'}</span>
      </span>
      {time != null && <span className="text-callout font-medium tabular shrink-0">{fmtClock(time)}</span>}
    </>
  );
  const cls = 'w-full flex items-center gap-3 pl-[38px] pr-4 py-2.5 text-left';
  return onClick ? <button type="button" onClick={onClick} className={`${cls} row-press`}>{body}</button> : <div className={cls}>{body}</div>;
}

function StopItem({ stop, n, leg, showLeg, time, fuel, onMins, onUnplan }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={stop.uid} dragListener={false} dragControls={controls} as="li" transition={SPRING}
      className="relative bg-surface" whileDrag={{ scale: 1.02, boxShadow: '0 12px 32px rgba(0,0,0,0.2)', zIndex: 10 }}>
      {showLeg && <Leg leg={leg} fuel={fuel} />}
      <div className="flex items-start gap-3 pl-1.5 pr-2 py-2.5">
        <button type="button" onPointerDown={e => controls.start(e)} aria-label={`Drag to reorder ${stop.name}`}
          className="w-7 h-[56px] flex items-center justify-center text-label-3 touch-none cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="w-[18px] h-[18px]" aria-hidden />
        </button>
        <a href={mapsLink(stop)} target="_blank" rel="noopener noreferrer" aria-label={`${stop.name} on Google Maps`} className="pressable rounded-[14px]">
          <PlacePhoto place={stop} className="w-[56px] h-[56px] rounded-[14px]">
            <span className="absolute top-1 left-1 min-w-[20px] h-5 px-1 rounded-full text-[12px] font-bold text-white flex items-center justify-center tabular shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
              style={{ background: colorOf(stop) }}>{n}</span>
          </PlacePhoto>
        </a>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="block text-headline leading-snug line-clamp-2">{stop.name}</span>
          <span className="block text-subhead tabular mt-0.5">{fmtClock(time.arrive)} – {fmtClock(time.leave)}{stop.area ? <span className="text-label-2"> · {stop.area}</span> : null}</span>
          <span className="flex items-center gap-2 mt-2"><DurationStepper mins={stop.mins} name={stop.name} onChange={onMins} /></span>
        </span>
        <button type="button" onClick={onUnplan} aria-label={`Take ${stop.name} off this day`} title="Back to wishlist"
          className="w-9 h-9 -mt-0.5 flex items-center justify-center text-label-3 hover:text-red-ink pressable shrink-0">
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>
    </Reorder.Item>
  );
}

function TonightCard({ trip, i, hotel, arrive, ops, onHotels }) {
  const hotels = trip.hotels || [];
  return (
    <div className={`rounded-[16px] p-3 flex items-center gap-3 ${hotel ? 'bg-[rgba(88,86,214,0.12)]' : 'bg-orange-soft'}`}>
      <span className={`w-12 h-12 rounded-[12px] text-white flex items-center justify-center shrink-0 ${hotel ? 'bg-[#5856D6]' : 'bg-orange'}`}><BedDouble className="w-6 h-6" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-footnote font-semibold uppercase tracking-wide text-label-2">Tonight · Night {i + 1}</span>
        {hotels.length ? (
          <select value={hotel?.uid || ''} onChange={e => ops.setNight(i, e.target.value || null)} aria-label={`Hotel for night ${i + 1}`}
            className="block w-full max-w-full -ml-0.5 bg-transparent text-headline outline-none truncate cursor-pointer">
            <option value="">No hotel yet</option>
            {hotels.map(h => <option key={h.uid} value={h.uid}>{h.name}</option>)}
          </select>
        ) : <span className="block text-headline">No hotel yet</span>}
        {hotel && (
          <span className="block text-subhead text-label-2 truncate tabular">
            {[arrive != null ? `Arrive ${fmtClock(arrive)}` : null, hotel.address || hotel.area].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {hotel ? (
        <span className="text-headline tabular shrink-0">{peso(nightlyFor(hotel))}</span>
      ) : (
        <Button size="sm" variant="tinted" onClick={onHotels} className="shrink-0"><Plus className="w-4 h-4" aria-hidden />Hotel</Button>
      )}
    </div>
  );
}

function DayFlow({ trip, i, route, ops, onAdd, onHotels }) {
  const toast = useToast();
  const byId = placesById(trip);
  const day = trip.days[i];
  const prevStay = i > 0 ? stayOf(trip, i - 1) : null;
  const isLast = i === DAYS - 1;
  const tonight = !isLast ? stayOf(trip, i) : null;
  const { pts, legs } = route;
  const times = schedule(day, pts, legs);
  const off = prevStay ? 1 : 0;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-title-2">
          <span className="sm:hidden">{fmtDay(addDays(trip.startDate, i))}</span>
          <span className="hidden sm:inline">{fmtDay(addDays(trip.startDate, i), { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </h2>
        <label className="flex items-center gap-2 text-subhead text-label-2 shrink-0">
          Leave
          <input type="time" value={day.start} onChange={e => e.target.value && ops.patchDay(i, d => ({ ...d, start: e.target.value }))}
            className="bg-surface rounded-[10px] px-2 h-9 text-callout font-semibold text-label tabular outline-none focus:ring-2 focus:ring-tint" />
        </label>
      </div>

      {!isLast && <TonightCard trip={trip} i={i} hotel={tonight} arrive={tonight && pts.length > 1 ? times[pts.length - 1]?.arrive : null} ops={ops} onHotels={onHotels} />}

      <div className="bg-surface rounded-[16px] overflow-hidden">
        {prevStay && <Endpoint label="Start from hotel" stay={prevStay} time={times[0]?.leave} />}
        {day.stops.length === 0 ? (
          <div className={`px-5 py-10 text-center ${prevStay ? 'shadow-[inset_0_0.5px_0_var(--separator)]' : ''}`}>
            <p className="text-title-2">Free day</p>
            <Button size="sm" variant="tinted" className="mt-4" onClick={onAdd}><Plus className="w-4 h-4" aria-hidden />Add places</Button>
          </div>
        ) : (
          <Reorder.Group axis="y" values={day.stops} onReorder={(uids) => ops.setStops(i, uids)} as="ol">
            {day.stops.map((u, k) => {
              const s = byId[u];
              if (!s) return null;
              return (
                <StopItem key={u} stop={s} n={k + 1} fuel={trip.fuel}
                  showLeg={k + off > 0} leg={legs[k + off - 1]} time={times[k + off] || { arrive: 0, leave: 0 }}
                  onMins={mins => ops.update(u, { mins })}
                  onUnplan={() => { ops.move(u, null); toast(`${s.name} moved to wishlist`, <Heart className="w-4 h-4 text-red" aria-hidden />); }} />
              );
            })}
          </Reorder.Group>
        )}
        {!isLast && (day.stops.length > 0 || tonight) && (
          <>
            {tonight && pts.length > 1 && <Leg leg={legs[pts.length - 2]} fuel={trip.fuel} />}
            <div className={tonight ? '' : 'shadow-[inset_0_0.5px_0_var(--separator)]'}>
              <Endpoint label="End at hotel" stay={tonight} time={tonight && pts.length > 1 ? times[pts.length - 1]?.arrive : null} onClick={onHotels} />
            </div>
          </>
        )}
      </div>

      {day.stops.length > 0 && (
        <div className="flex justify-end px-1">
          <Button size="sm" variant="tinted" onClick={onAdd}><Plus className="w-4 h-4" aria-hidden />Add places</Button>
        </div>
      )}
    </section>
  );
}

// ─── Add places: unplanned wishlist + search ─────────────────────────────────

function AddPlaces({ trip, ops, items, dayIdx, onAdd }) {
  const onDay = new Set(trip.days[dayIdx].stops);
  const byId = Object.fromEntries(trip.pool.map(p => [p.id, p]));
  return (
    <section className="space-y-6">
      {items.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-title-2 px-1">From your wishlist</h2>
          <ul className="rounded-[16px] bg-surface overflow-hidden group-list">
            {items.map(p => (
              <li key={p.uid} className="flex items-center gap-3 pl-4 pr-3 py-2.5" style={{ '--inset': '80px' }}>
                <PlacePhoto place={p} className="w-12 h-12 rounded-[12px]" iconSize={20} />
                <span className="min-w-0 flex-1">
                  <span className="block text-headline truncate">{p.name}</span>
                  <span className="block text-subhead text-label-2 truncate">{[p.area, fmtDur(p.mins)].filter(Boolean).join(' · ')}</span>
                </span>
                <Button size="sm" variant="tinted" onClick={() => onAdd(p)}><Plus className="w-4 h-4" aria-hidden />Day {dayIdx + 1}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Discover title="Search Cebu" addedLabel={`On Day ${dayIdx + 1}`}
        isAdded={(p) => {
          if (isStay(p)) { const h = (trip.hotels || []).find(x => x.id === p.id); return !!h && trip.days[dayIdx].hotel === h.uid; }
          const w = byId[p.id]; return !!w && onDay.has(w.uid);
        }}
        onAdd={(p) => ops.add(p, { day: dayIdx })} />
    </section>
  );
}

// ─── Hotels: one table for the trip, one pick per night ──────────────────────

function Hotels({ trip, setTrip, ops, dayIdx }) {
  const hotels = trip.hotels || [];
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const places = trip.pool;
  const nearUid = places.some(p => p.uid === pick) ? pick : trip.days[dayIdx].stops[trip.days[dayIdx].stops.length - 1] || places[0]?.uid || '';
  const near = places.find(p => p.uid === nearUid);
  const input = 'h-10 px-3 rounded-[10px] bg-fill text-callout outline-none focus:ring-2 focus:ring-tint';

  const cheapest = async () => {
    setBusy(true);
    try {
      const res = await postTrip({ ...tripPayload(trip), mode: 'cost', hotelsOnly: true });
      const prev = trip;
      setTrip(t => ({ ...t, days: t.days.map((d, k) => (k < DAYS - 1 ? { ...d, hotel: res.hotels[k] ?? null } : d)) }));
      toast('Cheapest hotels picked', <PiggyBank className="w-4 h-4 text-tint" aria-hidden />, { label: 'Undo', onClick: () => setTrip(prev) });
    } catch (e) {
      toast(e.message);
    } finally { setBusy(false); }
  };

  const total = trip.days.slice(0, DAYS - 1).reduce((s, d, k) => s + nightlyFor(stayOf(trip, k)), 0);
  const area = near?.area?.split(', ').pop();
  const links = near ? bookingLinks({ lat: near.lat, lon: near.lon, area, checkin: addDays(trip.startDate, dayIdx), guests: trip.guests, rooms: Math.max(1, Math.ceil(trip.guests / 2)) }) : null;

  return (
    <section className="space-y-5">
      {/* The table */}
      <div className="space-y-2">
        <h2 className="text-title-2 px-1">Hotels</h2>
        <div className="rounded-[16px] bg-surface overflow-hidden">
          {hotels.length > 0 && (
            <ul className="group-list shadow-[inset_0_-0.5px_0_var(--separator)]">
              {hotels.map(h => <HotelRow key={h.uid} h={h} ops={ops} />)}
            </ul>
          )}
          <HotelForm trip={trip} ops={ops} near={nearUid} onNear={setPick} />
        </div>
        {links && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-subhead text-label-2">
            Prices near {near.name}:
            <a href={links.airbnb} target="_blank" rel="noopener noreferrer" className="text-tint-ink inline-flex items-center gap-0.5">Airbnb<ExternalLink className="w-3 h-3" aria-hidden /></a>
            <a href={links.booking} target="_blank" rel="noopener noreferrer" className="text-tint-ink inline-flex items-center gap-0.5">Booking<ExternalLink className="w-3 h-3" aria-hidden /></a>
            <a href={links.agoda} target="_blank" rel="noopener noreferrer" className="text-tint-ink inline-flex items-center gap-0.5">Agoda<ExternalLink className="w-3 h-3" aria-hidden /></a>
          </p>
        )}
      </div>

      {/* One per night */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="text-title-2">Nights</h2>
          <Button size="sm" variant="gray" onClick={cheapest} disabled={busy || !hotels.length}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <PiggyBank className="w-4 h-4" aria-hidden />}Cheapest
          </Button>
        </div>
        <ul className="rounded-[16px] bg-surface overflow-hidden group-list">
          {trip.days.slice(0, DAYS - 1).map((d, k) => (
            <li key={k} className={`flex items-center gap-3 px-4 py-2.5 ${k === dayIdx ? 'bg-tint-soft' : ''}`}>
              <span className="w-[72px] shrink-0">
                <span className="block text-headline">Night {k + 1}</span>
                <span className="block text-footnote text-label-2 tabular">{fmtDay(addDays(trip.startDate, k), { weekday: 'short', day: 'numeric' })}</span>
              </span>
              <select value={d.hotel || ''} onChange={e => ops.setNight(k, e.target.value || null)} aria-label={`Hotel for night ${k + 1}`}
                className={`flex-1 min-w-0 ${input} ${d.hotel ? 'text-label font-medium' : 'text-label-2'}`}>
                <option value="">No hotel</option>
                {hotels.map(h => <option key={h.uid} value={h.uid}>{h.name}</option>)}
              </select>
              <span className="w-[76px] text-right text-callout font-semibold tabular shrink-0">{d.hotel ? peso(nightlyFor(stayOf(trip, k))) : '—'}</span>
            </li>
          ))}
          <li className="flex items-center justify-between px-4 py-3">
            <span className="text-headline">Total</span>
            <span className="text-headline tabular">{peso(total)}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
