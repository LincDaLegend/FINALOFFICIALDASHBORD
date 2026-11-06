'use client';

// Cebu trip planner tab (temporary feature).
// One page: a pool of places + hotels, a timetable of the days (travel added automatically), plan tools, map, find places.
// To remove: delete src/components/trip/ and app/api/trip/, the 'trip' lines in
// src/components/business/Layout.jsx and App.jsx, and `npm uninstall maplibre-gl`.

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, CalendarDays, Heart, Users } from 'lucide-react';
import { Row, Button, useToast, ConfirmDialog, SPRING } from '../business/ui.jsx';
import { NumberRow } from '../business/FindCards.jsx';
import { DAYS, emptyTrip, asPlace, addDays, fmtDur, peso, uid as newUid } from './tripData.js';
import { useTrip, useRoutes, dayCost } from './tripHooks.js';
import { PeopleStepper, fmtDay, isStay } from './tripUi.jsx';
import Planner from './Planner.jsx';
import { AiOrganizer } from './AiTools.jsx';
import { SuggestCard, Discover } from './FindPlaces.jsx';

export default function CebuTrip() {
  const toast = useToast();
  const [trip, setTrip] = useTrip({
    onRemote: (kind) => toast(kind === 'merged' ? 'Merged with someone else’s changes' : 'Updated by someone else', <Users className="w-4 h-4 text-tint" aria-hidden />),
  });
  const [confirm, setConfirm] = useState(false);
  const reduce = useReducedMotion();
  const routes = useRoutes(trip);
  const costs = trip.days.map((_, i) => dayCost(trip, i, routes[i]));

  // Every edit goes through these, so the wishlist and the days never disagree
  const ops = {
    add(p, { day = null, quiet = false } = {}) {
      // Hotels from search go to the hotel list, never in with the places
      if (isStay(p)) {
        const night = day != null && day < DAYS - 1 ? day : null;
        const have = (trip.hotels || []).find(h => h.id && h.id === p.id);
        if (have) { if (night != null) ops.setNight(night, have.uid); }
        else ops.addHotel({ id: p.id, name: p.name, area: p.area || '', lat: p.lat, lon: p.lon, wiki: p.wiki || null, price: 0 }, night);
        if (!quiet) toast(night != null ? `Hotel for night ${night + 1}` : have ? 'Already in the pool' : 'Hotel added to the pool', <Heart className="w-4 h-4 text-red" fill="currentColor" aria-hidden />);
        return;
      }
      const existing = trip.pool.find(x => x.id === p.id);
      if (existing) {
        if (day != null) { ops.move(existing.uid, day); if (!quiet) toast(`Added to Day ${day + 1}`, <Heart className="w-4 h-4 text-red" fill="currentColor" aria-hidden />); }
        else if (!quiet) toast('Already in the pool');
        return;
      }
      const place = asPlace(p);
      setTrip(t => ({
        ...t,
        pool: [...t.pool, place],
        days: day == null ? t.days : t.days.map((d, i) => (i === day ? { ...d, stops: [...d.stops, place.uid] } : d)),
      }));
      if (!quiet) toast(day == null ? 'Added to the pool' : `Added to Day ${day + 1}`, <Heart className="w-4 h-4 text-red" fill="currentColor" aria-hidden />);
    },
    remove(uid) {
      setTrip(t => ({ ...t, pool: t.pool.filter(p => p.uid !== uid), days: t.days.map(d => ({ ...d, stops: d.stops.filter(u => u !== uid) })) }));
    },
    update(uid, patch) {
      setTrip(t => ({ ...t, pool: t.pool.map(p => (p.uid === uid ? { ...p, ...patch } : p)) }));
    },
    /** Put a wishlist place on a day (before another place, or at the end), or back to "not planned" with day = null. */
    move(uid, day, before = null) {
      setTrip(t => ({
        ...t,
        days: t.days.map((d, i) => {
          let stops = d.stops.filter(u => u !== uid);
          if (i === day) {
            const at = before ? stops.indexOf(before) : -1;
            stops = at >= 0 ? [...stops.slice(0, at), uid, ...stops.slice(at)] : [...stops, uid];
          }
          return { ...d, stops };
        }),
      }));
    },
    setStops(i, uids) { setTrip(t => ({ ...t, days: t.days.map((d, k) => (k === i ? { ...d, stops: uids } : d)) })); },
    patchDay(i, fn) { setTrip(t => ({ ...t, days: t.days.map((d, k) => (k === i ? fn(d) : d)) })); },
    patch(p) { setTrip(t => ({ ...t, ...p })); },
    setPrefs(p) { setTrip(t => ({ ...t, prefs: { ...t.prefs, ...p } })); },
    // Hotel options: found or typed in once, then each night picks one of them
    addHotel(h, night = null) {
      const hotel = { ...h, uid: newUid() };
      setTrip(t => ({
        ...t,
        hotels: [...(t.hotels || []), hotel],
        days: night == null ? t.days : t.days.map((d, i) => (i === night ? { ...d, hotel: hotel.uid, pin: true } : d)),
      }));
      return hotel.uid;
    },
    updateHotel(id, patch) { setTrip(t => ({ ...t, hotels: t.hotels.map(h => (h.uid === id ? { ...h, ...patch } : h)) })); },
    removeHotel(id) {
      setTrip(t => ({ ...t, hotels: t.hotels.filter(h => h.uid !== id), days: t.days.map(d => (d.hotel === id ? { ...d, hotel: null, pin: false } : d)) }));
    },
    /** Picking a hotel by hand pins that night, so Cheapest / Lowest cost / AI keep it. */
    setNight(i, id) { setTrip(t => ({ ...t, days: t.days.map((d, k) => (k === i ? { ...d, hotel: id, pin: !!id } : d)) })); },
    togglePin(i) { setTrip(t => ({ ...t, days: t.days.map((d, k) => (k === i && d.hotel ? { ...d, pin: !d.pin } : d)) })); },
  };

  const hasAnything = trip.pool.length > 0 || (trip.hotels || []).length > 0;
  const inPool = useMemo(() => new Set([...trip.pool.map(p => p.id), ...(trip.hotels || []).map(h => h.id).filter(Boolean)]), [trip.pool, trip.hotels]);
  const showDay = (i) => document.getElementById(`day-col-${i}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center', inline: 'center' });

  return (
    <div className="min-h-dvh pb-28 lg:pb-16">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 pt-10 space-y-5">
        <Header trip={trip} ops={ops} onReset={hasAnything ? () => setConfirm(true) : null} />
        <TripSummary trip={trip} costs={costs} patch={ops.patch} onPickDay={showDay} />
        <AiOrganizer trip={trip} setTrip={setTrip} ops={ops} />
        <Planner trip={trip} setTrip={setTrip} ops={ops} routes={routes} />
        <section id="find" className="scroll-mt-6 space-y-6 pt-2" aria-label="Find places">
          <h2 className="text-title-1 px-1">Find places</h2>
          <SuggestCard trip={trip} ops={ops} inPool={inPool} />
          <Discover isAdded={(p) => inPool.has(p.id)} onAdd={(p) => ops.add(p)} addedLabel="In the pool" />
        </section>
      </div>

      <ConfirmDialog open={confirm} title="Start over?" message="Clears the pool, the timetable and hotels." confirmLabel="Clear"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setTrip(t => ({ ...emptyTrip(), startDate: t.startDate, guests: t.guests, fuel: t.fuel, prefs: t.prefs })); setConfirm(false); }} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({ trip, ops, onReset }) {
  const end = addDays(trip.startDate, DAYS - 1);
  const range = `${fmtDay(trip.startDate, { month: 'short', day: 'numeric' })} – ${fmtDay(end, { month: 'short', day: 'numeric' })}`;
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-large-title">Cebu Trip</h1>
        <label className="relative mt-1.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface text-[15px] font-medium tabular cursor-pointer pressable">
          <CalendarDays className="w-4 h-4 text-tint" aria-hidden />
          {range} · {DAYS} days
          <input type="date" value={trip.startDate} aria-label="Trip start date"
            onChange={e => e.target.value && ops.patch({ startDate: e.target.value })}
            onClick={e => { try { e.currentTarget.showPicker(); } catch {} }}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PeopleStepper value={trip.guests} onChange={n => ops.patch({ guests: n })} />
        {onReset && <Button size="sm" variant="plain" onClick={onReset}>Start over</Button>}
      </div>
    </header>
  );
}

// ─── Trip cost summary ───────────────────────────────────────────────────────

function BigStat({ label, value, sub, accent }) {
  return (
    <div className="min-w-0">
      <p className="text-footnote font-medium text-label-2">{label}</p>
      <p className={`text-[26px] sm:text-[28px] leading-tight font-bold tracking-[-0.02em] tabular ${accent ? 'text-tint-ink' : ''}`}>{value}</p>
      {sub && <p className="text-footnote text-label-2 tabular truncate">{sub}</p>}
    </div>
  );
}

function TripSummary({ trip, costs, patch, onPickDay }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const t = costs.reduce((a, c) => ({ gas: a.gas + c.gas, stay: a.stay + c.stay, km: a.km + c.km - c.ferryKm }), { gas: 0, stay: 0, km: 0 });
  const total = t.gas + t.stay;
  const nights = trip.days.slice(0, DAYS - 1).filter(d => d.hotel).length;
  return (
    <section className="rounded-[16px] bg-surface overflow-hidden" aria-label="Trip cost">
      <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
        <BigStat label="Total" value={peso(total)} accent />
        <BigStat label="Per person" value={peso(total / Math.max(1, trip.guests))} sub={`${trip.guests} people`} />
        <BigStat label="Gas" value={peso(t.gas)} sub={`${Math.round(t.km)} km`} />
        <BigStat label="Hotels" value={peso(t.stay)} sub={`${nights}/${DAYS - 1} nights`} />
      </div>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 h-11 text-subhead text-tint-ink row-press shadow-[inset_0_0.5px_0_var(--separator)]">
        <span>Cost by day</span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ease-apple ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : SPRING} className="overflow-hidden">
            <div className="grid gap-4 lg:grid-cols-2 px-3 sm:px-4 pb-4">
              <div className="group-list bg-[var(--bg)] rounded-group overflow-hidden">
                {costs.map((c, i) => (
                  <Row key={i} onClick={() => onPickDay(i)} chevron
                    title={`Day ${i + 1} · ${fmtDay(addDays(trip.startDate, i))}`}
                    subtitle={c.km > 0 ? `${Math.round(c.km - c.ferryKm)} km · ${fmtDur(c.min)}` : '—'}
                    value={<span className="text-right block leading-tight">
                      <span className="block text-label font-semibold">{peso(c.gas + c.stay)}</span>
                      <span className="block text-caption">{peso(c.gas)} gas{c.stay ? ` · ${peso(c.stay)} hotel` : ''}</span>
                    </span>} />
                ))}
              </div>
              <div className="space-y-2">
                <div className="group-list bg-[var(--bg)] rounded-group overflow-hidden">
                  <NumberRow key={`p${trip.fuel.pricePerL}`} label="Gas price" prefix="₱" suffix="/ L" step={0.5} value={trip.fuel.pricePerL}
                    onCommit={n => patch({ fuel: { ...trip.fuel, pricePerL: n } })} />
                  <NumberRow key={`k${trip.fuel.kmPerL}`} label="Car mileage" suffix="km / L" step={0.5} value={trip.fuel.kmPerL}
                    onCommit={n => patch({ fuel: { ...trip.fuel, kmPerL: Math.max(1, n) } })} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
