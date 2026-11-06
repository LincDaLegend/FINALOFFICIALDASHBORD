'use client';

// Google Maps for the Cebu trip planner: vector map (tilt for 3D buildings), Google's route line,
// the same pins as before. Needs a browser key (GOOGLE_MAPS_BROWSER_KEY on the server, handed out by
// /api/trip?kind=mapkey); TripMap falls back to the MapLibre map without one.
import { useEffect, useRef, useState } from 'react';
import './trip.css';
import { colorOf } from './tripData.js';
import { pinEl, dotEl } from './mapPins.js';

const CEBU = { center: { lat: 10.25, lng: 123.85 }, zoom: 8 };
const TILT_3D = 55;

let loading = null;
/** Loads the Maps JavaScript API once per page. Rejects if Google refuses the key. */
export function loadGoogleMaps(key) {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      window.__tripMapsReady = () => resolve(window.google.maps);
      window.gm_authFailure = () => { window.__tripMapsAuthFailed = true; window.dispatchEvent(new Event('trip-gmaps-auth')); };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: '__tripMapsReady' })}`;
      s.async = true;
      s.onerror = () => { loading = null; reject(new Error('Google Maps could not load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export default function TripGoogleMap({ apiKey, mapId, points, line, extras = [], onPick, onFail }) {
  const box = useRef(null);
  const map = useRef(null);
  const libs = useRef(null);
  const drawn = useRef({ markers: [], lines: [] });
  const latest = useRef({});
  const [is3d, setIs3d] = useState(true);
  const [dark, setDark] = useState(() => (typeof window !== 'undefined' ? prefersDark() : false));
  const [ready, setReady] = useState(0);
  latest.current = { points, line, extras, onPick };

  // Follow light / dark: Google sets the colour scheme when the map is made, so make it again
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    let alive = true;
    const failed = () => onFail?.('Google refused the map key');
    window.addEventListener('trip-gmaps-auth', failed);
    if (window.__tripMapsAuthFailed) failed();
    (async () => {
      try {
        const g = await loadGoogleMaps(apiKey);
        const [{ Map }, { AdvancedMarkerElement }, core] = await Promise.all([g.importLibrary('maps'), g.importLibrary('marker'), g.importLibrary('core')]);
        if (!alive || !box.current) return;
        libs.current = { AdvancedMarkerElement, LatLngBounds: core.LatLngBounds, Polyline: g.Polyline };
        const was = map.current;
        map.current = new Map(box.current, {
          ...(was ? { center: was.getCenter(), zoom: was.getZoom() } : CEBU),
          mapId,
          colorScheme: dark ? 'DARK' : 'LIGHT',
          tilt: is3d ? TILT_3D : 0,
          heading: is3d ? -12 : 0,
          gestureHandling: 'cooperative', // page scroll stays page scroll; Ctrl/⌘ + scroll or two fingers move the map
          mapTypeControl: false,
          streetViewControl: true,
          fullscreenControl: true,
          rotateControl: true,
          clickableIcons: false,
        });
        setReady(r => r + 1);
      } catch (e) { if (alive) onFail?.(e.message); }
    })();
    return () => { alive = false; window.removeEventListener('trip-gmaps-auth', failed); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId, dark]);

  function draw(fit = true) {
    const m = map.current, L = libs.current;
    if (!m || !L) return;
    const { points, line, extras, onPick } = latest.current;
    drawn.current.markers.forEach(mk => { mk.map = null; });
    drawn.current.lines.forEach(pl => pl.setMap(null));
    drawn.current = { markers: [], lines: [] };

    // Route: white casing under a blue line, like Apple Maps directions
    const path = (line?.length > 1 ? line : points.map(p => [p.lat, p.lon])).map(([lat, lng]) => ({ lat, lng }));
    if (path.length > 1) {
      drawn.current.lines.push(new L.Polyline({ map: m, path, strokeColor: dark ? '#0A3A80' : '#FFFFFF', strokeWeight: 9, strokeOpacity: 1, zIndex: 1 }));
      drawn.current.lines.push(new L.Polyline({ map: m, path, strokeColor: dark ? '#0A84FF' : '#007AFF', strokeWeight: 5, strokeOpacity: 1, zIndex: 2 }));
    }

    let n = 0;
    const seen = new Set();
    points.forEach((p) => {
      const stay = p.role !== 'stop';
      const k = `${p.lat},${p.lon}`;
      if (stay && seen.has(k)) return; // same hotel morning and night → one pin
      seen.add(k);
      drawn.current.markers.push(new L.AdvancedMarkerElement({
        map: m, position: { lat: p.lat, lng: p.lon }, title: p.name, zIndex: stay ? 5 : 10,
        content: pinEl({ stay, name: p.name, n: stay ? null : ++n, color: stay ? null : colorOf(p) }),
      }));
    });
    extras.forEach((p) => {
      const el = dotEl(p, onPick);
      el.style.transform = 'translateY(50%)'; // Google anchors at the bottom; dots sit on their spot
      drawn.current.markers.push(new L.AdvancedMarkerElement({ map: m, position: { lat: p.lat, lng: p.lon }, title: p.name, content: el, zIndex: 3 }));
    });

    if (!fit) return;
    const all = [...points, ...extras].map(p => ({ lat: p.lat, lng: p.lon }));
    if (all.length === 1) { m.panTo(all[0]); m.setZoom(14); }
    else if (all.length > 1) {
      const b = new L.LatLngBounds();
      [...all, ...path].forEach(c => b.extend(c));
      m.fitBounds(b, { top: 70, bottom: 40, left: 40, right: 40 });
    } else { m.panTo(CEBU.center); m.setZoom(CEBU.zoom); }
  }

  // Redraw (and refit) only when what's on the map changes
  const sig = JSON.stringify([points.map(p => [p.lat, p.lon, p.role, p.name]), line?.length || 0, line?.[0], extras.map(p => p.id)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => draw(true), [sig, ready]);

  const toggle3d = () => {
    const next = !is3d;
    setIs3d(next);
    map.current?.moveCamera({ tilt: next ? TILT_3D : 0, heading: next ? -12 : 0 });
  };

  return (
    <div className="relative">
      <div ref={box} className="trip-map h-[300px] lg:h-[480px] w-full rounded-[16px] overflow-hidden bg-fill" role="region" aria-label="Map of this day's route" />
      <button type="button" onClick={toggle3d} aria-pressed={is3d}
        className="absolute bottom-6 left-2.5 h-8 px-3 rounded-full text-[13px] font-semibold material-bar shadow-[0_2px_10px_rgba(0,0,0,0.15)] text-label pressable">
        {is3d ? '2D' : '3D'}
      </button>
    </div>
  );
}
