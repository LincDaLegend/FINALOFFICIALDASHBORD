'use client';

// Trip state + road distances for the Cebu trip planner (temporary feature).
import { useEffect, useRef, useState } from 'react';
import { DAYS, dayPoints, routeKey, estimateLegs, gasCost, nightlyFor, stayOf, emptyTrip, migrateTrip, addDays } from './tripData.js';

const KEY = 'cebuTrip_v2';
const OLD_KEY = 'cebuTrip_v1';
const BACKUP_KEY = 'cebuTrip_backup';
// Tests set localStorage.tripDoc = 'trip-test' so they never touch the real shared trip
const api = () => { try { return `/api/shared?key=${localStorage.getItem('tripDoc') === 'trip-test' ? 'trip-test' : 'trip'}`; } catch { return '/api/shared?key=trip'; } };
const POLL_MS = 10000;
const SAVE_MS = 900;

function loadLocal() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    if (t?.days?.length === DAYS) return migrateTrip(t);
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old?.days?.length === DAYS) return migrateTrip(old); // carry the earlier plan over
  } catch {}
  return emptyTrip();
}

const hasContent = (t) => !!(t && (t.pool?.length || t.hotels?.length));

// ─── Three-way merge: apply what we changed (base → ours) on top of what's on the server (theirs) ──

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const withUids = (a) => Array.isArray(a) && a.every(x => isObj(x) && x.uid);

export function merge3(base, ours, theirs) {
  if (same(ours, theirs)) return ours;
  if (same(ours, base)) return theirs;   // only they changed it
  if (same(theirs, base)) return ours;   // only we changed it
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(ours)])) {
      const v = merge3(b[k], ours[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (withUids(ours) && withUids(theirs)) {
    // Lists of places / hotels: keep everyone's additions, honour deletions, merge edits per item
    const B = new Map((withUids(base) ? base : []).map(x => [x.uid, x]));
    const O = new Map(ours.map(x => [x.uid, x]));
    const T = new Set(theirs.map(x => x.uid));
    const out = [];
    for (const t of theirs) {
      if (B.has(t.uid) && !O.has(t.uid)) continue; // we removed it
      out.push(O.has(t.uid) ? merge3(B.get(t.uid), O.get(t.uid), t) : t);
    }
    for (const o of ours) if (!T.has(o.uid) && !B.has(o.uid)) out.push(o); // we added it
    return out;
  }
  if (Array.isArray(ours) && Array.isArray(theirs) && Array.isArray(base) && ours.length === theirs.length && base.length === ours.length && ours.some(isObj)) {
    return ours.map((o, i) => merge3(base[i], o, theirs[i])); // the days, one by one
  }
  return ours; // both changed the same thing: ours wins
}

/**
 * The trip, shared with everyone who has the link (via /api/shared), with this browser's copy as a cache.
 * Returns [trip, setTrip, sync] where sync.status is 'connecting' | 'live' | 'saving' | 'offline' | 'local'.
 * `onRemote(kind)` fires when someone else's edit reaches this page: 'update' or 'merged'.
 */
export function useTrip({ onRemote } = {}) {
  const [trip, setTrip] = useState(loadLocal);
  const [status, setStatus] = useState('connecting');
  const [kick, setKick] = useState(0); // forces a save when this browser's plan seeds the shared one
  const etag = useRef(null);
  const serverJson = useRef(null); // the trip as the server last had it, so we only send real edits
  const ready = useRef(false);
  const timer = useRef(null);
  const inFlight = useRef(false);  // one save at a time, always with the newest version tag
  const latest = useRef(trip);
  const notify = useRef(onRemote);
  latest.current = trip;
  notify.current = onRemote;
  const busy = () => inFlight.current || timer.current != null;

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(trip)); } catch {} }, [trip]);

  const show = (t) => { latest.current = t; setTrip(t); };

  // Pull: first load, then every few seconds while the page is visible, and on focus
  useEffect(() => {
    let alive = true, off = false;
    const pull = async (first = false) => {
      if (off || busy() || document.hidden) return;
      try {
        const r = await fetch(api(), { cache: 'no-store', headers: etag.current ? { 'x-have': etag.current } : {} });
        if (!alive) return;
        if (r.status === 503) { off = true; setStatus('local'); return; } // sharing isn't set up: stop asking
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (!alive || busy()) return;
        if (d.unchanged) { setStatus('live'); return; }
        const remote = d.data?.days?.length === DAYS ? migrateTrip(d.data) : null;
        const mine = latest.current;
        etag.current = d.etag;
        serverJson.current = remote ? JSON.stringify(remote) : null;
        if (first && !hasContent(remote) && hasContent(mine)) {
          ready.current = true; setKick(k => k + 1); return; // nothing shared yet: this browser's plan becomes the shared one
        }
        if (remote && serverJson.current !== JSON.stringify(mine)) {
          if (first && hasContent(mine)) { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(mine)); } catch {} }
          show(remote);
          if (!first) notify.current?.('update');
        }
        ready.current = true;
        setStatus('live');
      } catch { if (alive) setStatus(s => (s === 'local' ? s : 'offline')); }
    };
    pull(true);
    const id = setInterval(() => pull(!ready.current), POLL_MS);
    const onFocus = () => pull(!ready.current);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Push: shortly after edits stop; if a save is still on its way, the next one waits for it
  const flush = async () => {
    timer.current = null;
    if (inFlight.current || !ready.current) return;
    const mine = latest.current;
    const json = JSON.stringify(mine);
    if (json === serverJson.current) { setStatus('live'); return; }
    inFlight.current = true;
    let again = false;
    try {
      const r = await fetch(api(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: mine, etag: etag.current }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        etag.current = d.etag; serverJson.current = json;
      } else if (r.status === 409 && d.data) {
        // Someone else saved first: keep their changes and ours, then save the combination
        const theirs = migrateTrip(d.data);
        const base = serverJson.current ? JSON.parse(serverJson.current) : null;
        etag.current = d.etag; serverJson.current = JSON.stringify(theirs);
        show(migrateTrip(merge3(base, latest.current, theirs)));
        notify.current?.('merged');
      } else { setStatus(r.status === 503 ? 'local' : 'offline'); return; }
      again = JSON.stringify(latest.current) !== serverJson.current;
      setStatus(again ? 'saving' : 'live');
    } catch { setStatus('offline'); }
    finally {
      inFlight.current = false;
      if (again && !timer.current) timer.current = setTimeout(flush, 0);
    }
  };

  useEffect(() => {
    if (!ready.current || JSON.stringify(trip) === serverJson.current) return;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_MS);
  }, [trip, kick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timer.current), []);

  return [trip, setTrip, { status }];
}

const inflight = new Set();

/**
 * How much slower real drives are than OpenStreetMap's times, measured from Google's times for your days
 * (1 when there are none). The plan tools scale their drive times by it. Updated by useRoutes.
 */
export const driveCalibration = { factor: 1, source: 'osm' };

/** Driving legs per day (Google with traffic when set up, else OSRM) via /api/trip, debounced; straight-line estimates until they arrive. */
export function useRoutes(trip) {
  const [routes, setRoutes] = useState({});
  const days = trip.days.map((d, i) => {
    const pts = dayPoints(trip, i);
    // Leaving at this day's date and time (Cebu is UTC+8), so Google can predict that day's traffic
    const at = `${addDays(trip.startDate, i)}T${d.start || '08:00'}:00+08:00`;
    return { pts, path: pts.length > 1 ? routeKey(pts) : null, at, key: pts.length > 1 ? `${routeKey(pts)}@${at}` : null };
  });
  const sig = days.map(d => d.key).join('|');

  useEffect(() => {
    const t = setTimeout(() => {
      days.forEach(({ key, path, at }) => {
        if (!key || routes[key] || inflight.has(key)) return;
        inflight.add(key);
        fetch(`/api/trip?kind=drive&pts=${encodeURIComponent(path)}&at=${encodeURIComponent(at)}`)
          .then(r => r.json())
          .then(d => setRoutes(r => ({ ...r, [key]: d.legs ? d : { error: d.error || 'Route unavailable' } })))
          .catch(() => setRoutes(r => ({ ...r, [key]: { error: 'You seem to be offline' } })))
          .finally(() => inflight.delete(key));
      });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const out = days.map(({ pts, key }) => {
    if (!key) return { pts, legs: [], line: null };
    const r = routes[key];
    if (!r) return { pts, legs: estimateLegs(pts), line: null, loading: true };
    if (r.error) return { pts, legs: estimateLegs(pts), line: null, error: r.error };
    return { pts, legs: r.legs, line: r.line, source: r.source || 'osm' };
  });

  // Google minutes ÷ OpenStreetMap minutes over every real drive (ignoring hops under 5 min)
  let g = 0, o = 0;
  out.forEach(r => r.source === 'google' && r.legs.forEach(l => { if (l.osmMin > 5) { g += l.min; o += l.osmMin; } }));
  driveCalibration.factor = o > 0 ? Math.min(2.5, Math.max(0.8, g / o)) : 1;
  driveCalibration.source = out.some(r => r.source === 'google') ? 'google' : 'osm';
  return out;
}

export function dayCost(trip, i, route) {
  const km = route.legs.reduce((s, l) => s + l.km, 0);
  const ferryKm = route.legs.reduce((s, l) => s + (l.ferryKm || 0), 0);
  const min = route.legs.reduce((s, l) => s + l.min, 0);
  const visit = route.pts.filter(p => p.role === 'stop').reduce((s, p) => s + (p.mins || 0), 0);
  const hotel = i < DAYS - 1 ? stayOf(trip, i) : null;
  const stay = hotel ? nightlyFor(hotel) : 0;
  return { km, ferryKm, min, visit, gas: gasCost(km - ferryKm, trip.fuel), stay, estimated: route.legs.some(l => l.estimated) };
}
