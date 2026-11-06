'use client';

// Details for one pool item (a place, your own entry, or a hotel), opened by clicking it.
import { useEffect, useRef, useState } from 'react';
import { X, MapPin, ExternalLink, Car, Ship, Clock, BedDouble, Trash2, BookOpen } from 'lucide-react';
import { DAYS, addDays, bookingLinks, fmtClock, fmtDur, peso, nightlyFor, nightlyMath, roomsFor, hasSpot } from './tripData.js';
import { PlacePhoto, MustStar, DurationPick, PriceCell, UnitPick, fmtDay, fmtKm } from './tripUi.jsx';

const CAT_NAME = {
  water: 'Falls & water', beach: 'Beach & island', dive: 'Diving & snorkeling', worship: 'Church & temple', landmark: 'Landmark',
  view: 'Viewpoint & hike', food: 'Food', shop: 'Shopping', transport: 'Transport', park: 'Park & nature', stay: 'Hotel', pin: 'Place', custom: 'Your entry',
};

// Summaries are remembered per browser, like photos
const ABOUT_KEY = 'tripAbout_v1';
const aboutReq = new Map();
const aboutStore = () => { try { return JSON.parse(localStorage.getItem(ABOUT_KEY)) || {}; } catch { return {}; } };

function useAbout(item, enabled) {
  const key = enabled ? `${item.name}|${(+item.lat).toFixed(3)},${(+item.lon).toFixed(3)}` : null;
  const [val, setVal] = useState(() => (key ? aboutStore()[key] : null));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) { setVal(null); return; }
    const have = aboutStore()[key];
    if (have !== undefined) { setVal(have); return; }
    setVal(undefined);
    let live = true;
    let req = aboutReq.get(key);
    if (!req) {
      const qs = new URLSearchParams({ kind: 'about', name: item.name, lat: item.lat, lon: item.lon, wiki: item.wiki || '' });
      req = fetch(`/api/trip?${qs}`).then(r => (r.ok ? r.json() : Promise.reject())).then(d => {
        const v = d.extract ? d : null;
        try { const s = aboutStore(); s[key] = v; localStorage.setItem(ABOUT_KEY, JSON.stringify(s)); } catch {}
        return v;
      }).catch(() => { aboutReq.delete(key); return 'error'; }); // not saved: ask again next time
      aboutReq.set(key, req);
    }
    req.then(v => live && setVal(v));
    return () => { live = false; };
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return [val, () => setTick(t => t + 1)]; // val: undefined = loading, null = nothing found, 'error' = couldn't ask
}

const mapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

/** A modal sheet: bottom sheet on phones, centred card on larger screens. */
export default function PlaceInfo({ open, onClose, trip, ops, item, kind, when }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && item && !d.open) d.showModal();
    if ((!open || !item) && d.open) d.close();
  }, [open, item]);

  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={item ? item.name : 'Details'}
      className="trip-sheet backdrop:bg-[var(--scrim)] p-0 m-0 top-auto bottom-0 sm:top-0 sm:m-auto w-full max-w-full sm:w-[min(460px,calc(100vw-48px))] max-h-[88dvh] sm:max-h-[min(760px,calc(100dvh-48px))]
        rounded-t-[20px] sm:rounded-[20px] bg-surface text-label shadow-[var(--shadow-lg)] overflow-hidden">
      {open && item && (kind === 'hotel'
        ? <HotelInfo trip={trip} ops={ops} h={item} onClose={onClose} />
        : <SpotInfo trip={trip} ops={ops} p={item} when={when} onClose={onClose} />)}
    </dialog>
  );
}

function Shell({ photo, onClose, children }) {
  return (
    <div className="flex flex-col max-h-[inherit]">
      <div className="relative shrink-0">
        {photo}
        <button type="button" onClick={onClose} aria-label="Close" autoFocus
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/45 backdrop-blur text-white flex items-center justify-center pressable">
          <X className="w-4 h-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] space-y-4">{children}</div>
    </div>
  );
}

const Label = ({ children }) => <h3 className="text-footnote font-semibold uppercase tracking-wide text-label-2 mb-1.5">{children}</h3>;

function Notes({ value, onChange, label }) {
  return (
    <div>
      <Label>Notes</Label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value || null)}
        rows={2} maxLength={600} aria-label={label} placeholder="Entrance fee, what to bring, booking ref…"
        className="w-full px-3 py-2 rounded-[12px] bg-fill text-callout leading-relaxed outline-none focus:ring-2 focus:ring-tint resize-y min-h-[60px] placeholder:text-label-3" />
    </div>
  );
}

function LinkPill({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-fill text-subhead font-semibold text-tint-ink pressable">
      {children}<ExternalLink className="w-3.5 h-3.5" aria-hidden />
    </a>
  );
}

function SpotInfo({ trip, ops, p, when, onClose }) {
  const located = hasSpot(p);
  const [about, retryAbout] = useAbout(p, located && !p.custom);
  const dayLabel = (i) => `Day ${i + 1} · ${fmtDay(addDays(trip.startDate, i), { weekday: 'short', month: 'short', day: 'numeric' })}`;

  return (
    <Shell onClose={onClose} photo={
      <PlacePhoto place={p} className="w-full aspect-[16/9]" iconSize={44} />
    }>
      <div>
        <h2 className="text-title-2 leading-tight">{p.name}</h2>
        <p className="text-subhead text-label-2 mt-0.5">
          {[CAT_NAME[p.cat] || 'Place', p.custom && !located ? 'Where you are' : p.area].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* When: day, time, and the drive in */}
      <div className="rounded-[14px] bg-fill p-3 space-y-2">
        <div className="flex items-center gap-2">
          <select value={when ? when.day : ''} onChange={e => ops.move(p.uid, e.target.value === '' ? null : +e.target.value)} aria-label={`Day for ${p.name}`}
            className="h-8 pl-2 rounded-[9px] bg-surface text-subhead font-semibold text-tint-ink outline-none focus:ring-2 focus:ring-tint cursor-pointer min-w-0">
            <option value="">Not on a day</option>
            {trip.days.map((_, i) => <option key={i} value={i}>{dayLabel(i)}</option>)}
          </select>
          {when && <span className={`text-subhead tabular ${when.late ? 'text-red-ink font-semibold' : 'text-label'}`}>{fmtClock(when.from)}–{fmtClock(when.to)}</span>}
        </div>
        {when?.travel && (
          <p className="flex items-center gap-1.5 text-footnote text-label-2">
            {when.travel.ferry ? <Ship className="w-3.5 h-3.5" aria-hidden /> : <Car className="w-3.5 h-3.5" aria-hidden />}
            {fmtDur(Math.round(when.travel.min))} · {fmtKm(when.travel.km)} from {when.travel.from}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <DurationPick mins={p.mins} name={p.name} onChange={mins => ops.update(p.uid, { mins })} />
          {p.custom ? (
            <label className="flex items-center gap-1 text-footnote text-label-2">
              <Clock className="w-3.5 h-3.5" aria-hidden />Starts
              <input type="time" value={p.at || ''} onChange={e => ops.update(p.uid, { at: e.target.value || null })} aria-label={`Start time for ${p.name}`}
                className="h-7 px-1 rounded-[8px] bg-surface text-footnote font-semibold tabular text-label outline-none focus:ring-2 focus:ring-tint" />
            </label>
          ) : (
            <MustStar size="sm" on={p.must} name={p.name} onToggle={() => ops.update(p.uid, { must: !p.must })} />
          )}
        </div>
      </div>

      {/* About, from Wikipedia */}
      {located && !p.custom && (
        <div>
          <Label>About</Label>
          {about === undefined ? (
            <div className="space-y-1.5" aria-label="Loading">
              {[100, 92, 70].map(w => <div key={w} className="h-3.5 rounded bg-fill animate-pulse" style={{ width: `${w}%` }} />)}
            </div>
          ) : about === 'error' ? (
            <p className="text-subhead text-label-2">Couldn’t reach Wikipedia. <button type="button" onClick={retryAbout} className="text-tint-ink font-semibold">Try again</button></p>
          ) : about ? (
            <>
              {about.description && <p className="text-subhead font-semibold">{about.description[0].toUpperCase() + about.description.slice(1)}</p>}
              <p className="text-callout leading-relaxed text-label mt-1 line-clamp-[8]">{about.extract}</p>
            </>
          ) : (
            <p className="text-subhead text-label-2">No Wikipedia article found.</p>
          )}
        </div>
      )}

      <Notes value={p.note} label={`Notes for ${p.name}`} onChange={note => ops.update(p.uid, { note })} />

      <div className="flex flex-wrap gap-2">
        {located && <LinkPill href={mapsUrl(p)}><MapPin className="w-4 h-4" aria-hidden />Google Maps</LinkPill>}
        {about?.page && about !== 'error' && <LinkPill href={about.page}><BookOpen className="w-4 h-4" aria-hidden />Wikipedia</LinkPill>}
      </div>

      <button type="button" onClick={() => { ops.remove(p.uid); onClose(); }}
        className="w-full h-11 rounded-[12px] bg-fill text-body font-semibold text-red-ink flex items-center justify-center gap-2 pressable">
        <Trash2 className="w-4 h-4" aria-hidden />Remove from trip
      </button>
    </Shell>
  );
}

function HotelInfo({ trip, ops, h, onClose }) {
  const nights = trip.days.slice(0, DAYS - 1).flatMap((d, k) => (d.hotel === h.uid ? [k] : []));
  const area = (h.area || '').split(', ').pop();
  const links = hasSpot(h) ? bookingLinks({ lat: h.lat, lon: h.lon, area, checkin: addDays(trip.startDate, nights[0] ?? 0), guests: trip.guests, rooms: h.per === 'room' || !h.per ? roomsFor(trip.guests, h.sleeps) : roomsFor(trip.guests) }) : null;
  const toggleNight = (k) => ops.setNight(k, trip.days[k].hotel === h.uid ? null : h.uid);

  return (
    <Shell onClose={onClose} photo={
      <PlacePhoto place={{ ...h, cat: 'stay' }} className="w-full aspect-[16/9]" iconSize={44} />
    }>
      <div>
        <h2 className="text-title-2 leading-tight flex items-center gap-2"><BedDouble className="w-5 h-5 text-[#5856D6] shrink-0" aria-hidden />{h.name}</h2>
        {(h.address || h.area) && <p className="text-subhead text-label-2 mt-0.5">{h.address || h.area}</p>}
      </div>

      <div className="rounded-[14px] bg-fill p-3 space-y-3">
        <div className="flex items-center gap-2">
          <PriceCell value={h.price} label={`${h.name} price per night`} onCommit={v => ops.updateHotel(h.uid, { price: v })} />
          <UnitPick hotel={h} onChange={p => ops.updateHotel(h.uid, p)} />
          <span className="ml-auto"><MustStar size="sm" on={!!h.must} name={h.name} word="must-stay" onToggle={() => ops.updateHotel(h.uid, { must: !h.must })} /></span>
        </div>
        <div>
          <p className="text-footnote text-label-2 tabular mb-1.5">
            {nightlyMath(h, trip.guests) ? `${nightlyMath(h, trip.guests)} = ` : ''}<span className="font-semibold text-label">{peso(nightlyFor(h, trip.guests))}</span> / night for {trip.guests}
            {nights.length ? ` · ${nights.length} night${nights.length === 1 ? '' : 's'} = ${peso(nights.length * nightlyFor(h, trip.guests))}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nights at this hotel">
            {trip.days.slice(0, DAYS - 1).map((d, k) => {
              const on = d.hotel === h.uid;
              const other = !on && d.hotel ? (trip.hotels || []).find(x => x.uid === d.hotel)?.name : null;
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => toggleNight(k)} title={other ? `Now: ${other}` : undefined}
                  className={`h-8 px-3 rounded-full text-footnote font-semibold tabular pressable ${on ? 'bg-[#5856D6] text-white' : 'bg-surface text-label-2'}`}>
                  {fmtDay(addDays(trip.startDate, k), { weekday: 'short', day: 'numeric' })}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Notes value={h.note} label={`Notes for ${h.name}`} onChange={note => ops.updateHotel(h.uid, { note })} />

      <div className="flex flex-wrap gap-2">
        {hasSpot(h) && <LinkPill href={mapsUrl(h)}><MapPin className="w-4 h-4" aria-hidden />Google Maps</LinkPill>}
        {links && [['Airbnb', links.airbnb], ['Booking', links.booking], ['Agoda', links.agoda]].map(([n, u]) => <LinkPill key={n} href={u}>{n}</LinkPill>)}
      </div>

      <button type="button" onClick={() => { ops.removeHotel(h.uid); onClose(); }}
        className="w-full h-11 rounded-[12px] bg-fill text-body font-semibold text-red-ink flex items-center justify-center gap-2 pressable">
        <Trash2 className="w-4 h-4" aria-hidden />Remove hotel
      </button>
    </Shell>
  );
}
