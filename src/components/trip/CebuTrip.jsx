'use client';

// Cebu trip planner tab (temporary feature).
// Three steps: 1 Wishlist (everything you might do) → 2 Organize (sort it into days, with AI) → 3 Itinerary (times, stays, costs).
// To remove: delete src/components/trip/ and app/api/trip/, the 'trip' lines in
// src/components/business/Layout.jsx and App.jsx, and `npm uninstall maplibre-gl`.

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, CalendarDays, Heart, Users } from 'lucide-react';
import { Row, Button, useToast, ConfirmDialog, SPRING } from '../business/ui.jsx';
import { NumberRow } from '../business/FindCards.jsx';
import { DAYS, emptyTrip, asPlace, addDays, fmtDur, peso, uid as newUid } from './tripData.js';
import { useTrip, useRoutes, dayCost } from './tripHooks.js';
import { PeopleStepper, fmtDay, isStay } from './tripUi.jsx';
import WishlistStep from './WishlistStep.jsx';
import OrganizeStep from './OrganizeStep.jsx';
import ItineraryStep from './ItineraryStep.jsx';

export default function CebuTrip() {
  const toast = useToast();
  const [trip, setTrip, sync] = useTrip({
    onRemote: (kind) => toast(kind === 'merged' ? 'Merged with someone else’s changes' : 'Updated by someone else', <Users className="w-4 h-4 text-tint" aria-hidden />),
  });
  const [step, setStep] = useState(() => (trip.pool.length ? (trip.days.some(d => d.stops.length) ? 'itinerary' : 'organize') : 'wish'));
  const [dayIdx, setDayIdx] = useState(0);
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
        if (!quiet) toast(night != null ? `Hotel for night ${night + 1}` : have ? 'Already in your hotels' : 'Added to your hotels', <Heart className="w-4 h-4 text-red" fill="currentColor" aria-hidden />);
        return;
      }
      const existing = trip.pool.find(x => x.id === p.id);
      if (existing) {
        if (day != null) { ops.move(existing.uid, day); if (!quiet) toast(`Added to Day ${day + 1}`, <Heart className="w-4 h-4 text-red" fill="currentColor" aria-hidden />); }
        else if (!quiet) toast('Already on your wishlist');
        return;
      }
      const place = asPlace(p);
      setTrip(t => ({
        ...t,
        pool: [...t.pool, place],
        days: day == null ? t.days : t.days.map((d, i) => (i === day ? { ...d, stops: [...d.stops, place.uid] } : d)),
      }));
      if (!quiet) toast(day == null ? 'Added to your wishlist' : `Added to Day ${day + 1}`, <Heart className="w-4 h-4 text-red" fill="currentColor" aria-hidden />);
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

  const go = (s) => { setStep(s); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); };
  const plannedCount = new Set(trip.days.flatMap(d => d.stops)).size;
  const hasAnything = trip.pool.length > 0 || (trip.hotels || []).length > 0;

  return (
    <div className="min-h-dvh pb-28 lg:pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 space-y-5">
        <Header trip={trip} ops={ops} sync={sync} onReset={hasAnything ? () => setConfirm(true) : null} />
        <Steps step={step} onStep={go} wish={trip.pool.length} planned={plannedCount} />
        {step !== 'wish' && <TripSummary trip={trip} costs={costs} patch={ops.patch} onPickDay={(i) => { setDayIdx(i); go('itinerary'); }} />}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>
            {step === 'wish' && <WishlistStep trip={trip} ops={ops} onNext={() => go('organize')} />}
            {step === 'organize' && <OrganizeStep trip={trip} setTrip={setTrip} ops={ops} costs={costs} onNext={() => go('itinerary')} />}
            {step === 'itinerary' && (
              <ItineraryStep trip={trip} setTrip={setTrip} ops={ops} routes={routes} costs={costs}
                dayIdx={dayIdx} setDayIdx={setDayIdx} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ConfirmDialog open={confirm} title="Start over?" message="Clears your wishlist, days and hotels." confirmLabel="Clear"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setTrip(t => ({ ...emptyTrip(), startDate: t.startDate, guests: t.guests, fuel: t.fuel, prefs: t.prefs })); setConfirm(false); go('wish'); }} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

const SYNC = {
  live: ['bg-green', 'Shared'],
  saving: ['bg-tint', 'Saving…'],
  connecting: ['bg-label-3', 'Connecting…'],
  offline: ['bg-orange', 'Offline · saved here'],
  local: ['bg-label-3', 'This device only'],
};

function SyncPill({ status }) {
  const [dot, label] = SYNC[status] || SYNC.connecting;
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href.split('#')[0] + '#trip'); } catch {}
  };
  return (
    <button type="button" onClick={share} title={status === 'live' || status === 'saving' ? 'Everyone with the link sees and edits this trip · tap to copy link' : undefined}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface text-[14px] font-medium pressable" aria-live="polite">
      <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />{label}
    </button>
  );
}

function Header({ trip, ops, sync, onReset }) {
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
        <SyncPill status={sync.status} />
        <PeopleStepper value={trip.guests} onChange={n => ops.patch({ guests: n })} />
        {onReset && <Button size="sm" variant="plain" onClick={onReset}>Start over</Button>}
      </div>
    </header>
  );
}

// ─── Step bar: 1 Wishlist → 2 Organize → 3 Itinerary ─────────────────────────

function Steps({ step, onStep, wish, planned }) {
  const items = [
    { id: 'wish', n: 1, title: 'Wishlist', sub: `${wish} place${wish === 1 ? '' : 's'}` },
    { id: 'organize', n: 2, title: 'Organize', sub: `${planned}/${wish} planned` },
    { id: 'itinerary', n: 3, title: 'Itinerary', sub: 'Day by day' },
  ];
  const at = items.findIndex(x => x.id === step);
  return (
    <nav aria-label="Planning steps" className="grid grid-cols-3 gap-1.5 sm:gap-2 p-1.5 rounded-[18px] bg-fill">
      {items.map((s, k) => {
        const on = s.id === step;
        const done = k < at;
        return (
          <button key={s.id} type="button" onClick={() => onStep(s.id)} aria-current={on ? 'step' : undefined}
            className={`relative flex items-center gap-2.5 rounded-[14px] px-2.5 sm:px-3.5 py-2.5 text-left pressable transition-colors ${on ? 'bg-surface shadow-[0_2px_10px_rgba(0,0,0,0.08)]' : 'hover:bg-surface/60'}`}>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-bold shrink-0 ${on ? 'bg-tint text-white' : done ? 'bg-green text-white' : 'bg-surface text-label-2'}`}>
              {done ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden /> : s.n}
            </span>
            <span className="min-w-0">
              <span className={`block text-[16px] font-semibold leading-tight truncate ${on ? '' : 'text-label-2'}`}>{s.title}</span>
              <span className="hidden sm:block text-footnote text-label-2 truncate tabular">{s.sub}</span>
            </span>
          </button>
        );
      })}
    </nav>
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
