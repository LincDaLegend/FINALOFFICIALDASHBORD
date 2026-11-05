// Cebu trip planner data + math (temporary feature: delete src/components/trip and app/api/trip to remove it).
// Coordinates come from OpenStreetMap (Nominatim), checked November 2026.

export const DAYS = 5;

// cat = icon category (see CATEGORY in CebuTrip.jsx); mins = suggested time to spend there
export const SPOTS = [
  // Cebu City & Mactan
  { id: 'cebu-airport', region: 'City & Mactan', cat: 'transport', name: 'Mactan–Cebu Airport', area: 'Lapu-Lapu', lat: 10.3103, lon: 123.9793, mins: 30 },
  { id: 'magellan', region: 'City & Mactan', cat: 'worship', name: "Magellan's Cross", area: 'Cebu City', lat: 10.2936, lon: 123.9020, mins: 30 },
  { id: 'santo-nino', region: 'City & Mactan', cat: 'worship', name: 'Basilica del Santo Niño', area: 'Cebu City', lat: 10.2943, lon: 123.9021, mins: 45 },
  { id: 'fort-san-pedro', region: 'City & Mactan', cat: 'landmark', name: 'Fort San Pedro', area: 'Cebu City', lat: 10.2927, lon: 123.9059, mins: 60 },
  { id: 'taoist', region: 'City & Mactan', cat: 'worship', name: 'Taoist Temple', area: 'Beverly Hills, Cebu City', lat: 10.3343, lon: 123.8880, mins: 60 },
  { id: 'leah', region: 'City & Mactan', cat: 'landmark', name: 'Temple of Leah', area: 'Busay, Cebu City', lat: 10.3689, lon: 123.8733, mins: 60 },
  { id: 'tops', region: 'City & Mactan', cat: 'view', name: 'Tops Lookout', area: 'Busay, Cebu City', lat: 10.3706, lon: 123.8709, mins: 60 },
  { id: 'sirao', region: 'City & Mactan', cat: 'park', name: 'Sirao Flower Garden', area: 'Sirao, Cebu City', lat: 10.4141, lon: 123.8722, mins: 60 },
  { id: 'it-park', region: 'City & Mactan', cat: 'food', name: 'Cebu IT Park food strip', area: 'Lahug, Cebu City', lat: 10.3308, lon: 123.9068, mins: 90 },
  { id: 'ayala', region: 'City & Mactan', cat: 'shop', name: 'Ayala Center Cebu', area: 'Cebu Business Park', lat: 10.3181, lon: 123.9052, mins: 120 },
  { id: 'sm-seaside', region: 'City & Mactan', cat: 'shop', name: 'SM Seaside City', area: 'South Road Properties', lat: 10.2818, lon: 123.8824, mins: 120 },
  { id: 'mactan-shrine', region: 'City & Mactan', cat: 'landmark', name: 'Mactan Shrine', area: 'Lapu-Lapu', lat: 10.3110, lon: 124.0151, mins: 45 },
  { id: 'nalusuan', region: 'City & Mactan', cat: 'beach', name: 'Nalusuan Island (boat)', area: 'Cordova', lat: 10.1904, lon: 124.0006, mins: 180 },
  // South
  { id: 'oslob', region: 'South', cat: 'dive', name: 'Oslob Whale Sharks', area: 'Tan-awan, Oslob', lat: 9.4621, lon: 123.3786, mins: 120 },
  { id: 'sumilon', region: 'South', cat: 'beach', name: 'Sumilon Island (boat)', area: 'Oslob', lat: 9.4317, lon: 123.3896, mins: 180 },
  { id: 'tumalog', region: 'South', cat: 'water', name: 'Tumalog Falls', area: 'Oslob', lat: 9.4859, lon: 123.3694, mins: 60 },
  { id: 'aguinid', region: 'South', cat: 'water', name: 'Aguinid Falls', area: 'Samboan', lat: 9.5066, lon: 123.3022, mins: 120 },
  { id: 'kawasan', region: 'South', cat: 'water', name: 'Kawasan Falls', area: 'Badian', lat: 9.8020, lon: 123.3739, mins: 180 },
  { id: 'osmena-peak', region: 'South', cat: 'view', name: 'Osmeña Peak', area: 'Dalaguete', lat: 9.8201, lon: 123.4424, mins: 150 },
  { id: 'panagsama', region: 'South', cat: 'beach', name: 'Panagsama Beach', area: 'Moalboal', lat: 9.9466, lon: 123.3662, mins: 120 },
  { id: 'pescador', region: 'South', cat: 'dive', name: 'Pescador Island (boat)', area: 'Moalboal', lat: 9.9230, lon: 123.3435, mins: 150 },
  { id: 'mantayupan', region: 'South', cat: 'water', name: 'Mantayupan Falls', area: 'Barili', lat: 10.1009, lon: 123.5358, mins: 60 },
  // North
  { id: 'safari', region: 'North', cat: 'park', name: 'Cebu Safari & Adventure Park', area: 'Carmen', lat: 10.5888, lon: 123.9611, mins: 240 },
  { id: 'bantayan', region: 'North', cat: 'beach', name: 'Bantayan Island (ferry)', area: 'Bantayan', lat: 11.2186, lon: 123.7285, mins: 240 },
  { id: 'malapascua', region: 'North', cat: 'beach', name: 'Malapascua Island (boat)', area: 'Daanbantayan', lat: 11.3272, lon: 124.1124, mins: 240 },
];

export const REGIONS = ['City & Mactan', 'South', 'North'];

// Apple Maps-style category colours (icons live in CebuTrip.jsx)
export const CAT_COLOR = {
  water: '#32ADE6', beach: '#00B8B0', dive: '#0A84FF', worship: '#A2845E', landmark: '#AF52DE', view: '#34C759',
  food: '#FF9500', shop: '#FF2D55', transport: '#8E8E93', park: '#30A14E', stay: '#5856D6', pin: '#FF3B30',
};
export const colorOf = (p) => CAT_COLOR[p.cat || catOf(p)] || CAT_COLOR.pin;

/** Icon category for an OpenStreetMap result (category/type → one of the CATEGORY keys). */
export function catOf({ category, kind, name = '' }) {
  const k = kind || '', c = category || '';
  if (k === 'waterfall' || /falls?\b/i.test(name)) return 'water';
  if (/beach|island|islet|bay|coast/.test(k)) return 'beach';
  if (k === 'dive_centre' || /dive|snorkel/i.test(name)) return 'dive';
  if (k === 'place_of_worship' || /church|basilica|shrine|temple|cathedral|chapel/i.test(name)) return 'worship';
  if (/peak|viewpoint|volcano|hill|cliff|ridge/.test(k)) return 'view';
  if (/restaurant|cafe|fast_food|food_court|bar|pub|bakery|ice_cream/.test(k)) return 'food';
  if (c === 'shop' || /mall|marketplace|commercial|retail|supermarket/.test(k)) return 'shop';
  if (/aerodrome|airport|ferry_terminal|bus_station|terminal/.test(k)) return 'transport';
  if (/zoo|park|theme_park|garden|nature_reserve|forest|wood/.test(k)) return 'park';
  if (/hotel|hostel|guest_house|motel|resort|apartment/.test(k)) return 'stay';
  if (c === 'historic' || /museum|attraction|monument|memorial|castle|fort|artwork/.test(k)) return 'landmark';
  return 'pin';
}
const spot = (id) => ({ ...SPOTS.find(s => s.id === id) });

// ─── Dates + booking links ───────────────────────────────────────────────────

// Local-date ISO (toISOString would shift to UTC and lose a day in the Philippines)
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localIso(d);
}

/** Search links for places the free map data has no prices for (Airbnb has no public API). */
export function bookingLinks({ lat, lon, area, checkin, guests, rooms = 1 }) {
  const checkout = addDays(checkin, 1);
  const d = 0.03;
  const airbnb = 'https://www.airbnb.com/s/homes?' + new URLSearchParams({
    ne_lat: (lat + d).toFixed(4), ne_lng: (lon + d).toFixed(4), sw_lat: (lat - d).toFixed(4), sw_lng: (lon - d).toFixed(4),
    search_by_map: 'true', zoom: '14', checkin, checkout, adults: String(guests),
  });
  const booking = 'https://www.booking.com/searchresults.html?' + new URLSearchParams({
    ss: `${area || 'Cebu'}, Cebu, Philippines`, checkin, checkout, group_adults: String(guests), no_rooms: String(rooms),
  });
  const agoda = 'https://www.agoda.com/search?' + new URLSearchParams({ textToSearch: `${area || 'Cebu'}, Cebu`, checkIn: checkin, checkOut: checkout, adults: String(guests), rooms: String(rooms) });
  return { airbnb, booking, agoda };
}

export const mapsLink = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.area || ''} Cebu`)}`;

// ─── Trip shape ──────────────────────────────────────────────────────────────

const today = () => localIso(new Date());

// Constraints the AI organiser plans around
export const DEFAULT_PREFS = { pace: 'balanced', earliest: '07:00', backBy: '21:00', maxDrive: 240, allowAdd: false, note: '', interests: [] };

/**
 * A trip is a wishlist (`pool`, every place you might do) plus 5 days whose `stops` are uids from it,
 * in visiting order. A wishlist place on no day is "not planned yet". Hotels work the same way:
 * `hotels` holds the options you've found (with your prices) and each night's `hotel` is one uid.
 */
export function emptyTrip() {
  return {
    v: 2,
    startDate: addDays(today(), 14),
    guests: 2,
    fuel: { pricePerL: 65, kmPerL: 10 },
    prefs: { ...DEFAULT_PREFS },
    pool: [],
    hotels: [],
    days: Array.from({ length: DAYS }, () => ({ start: '08:00', stops: [], hotel: null })),
  };
}

let seq = 0;
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A wishlist entry from a search result, popular spot or AI suggestion. */
export const asPlace = (p) => ({
  uid: uid(), id: p.id || `p-${uid()}`, name: p.name, area: p.area || '', lat: p.lat, lon: p.lon,
  cat: p.cat || catOf(p), wiki: p.wiki || null, mins: p.mins || 90, must: false, tag: p.tag || null,
});

/** Upgrades a version-1 trip (stops stored inside days) to the wishlist model. */
/** Older trips stored a hotel object on each day; turn those into hotel options + one uid per night. */
function liftStays(t) {
  if (t.hotels) return t;
  const hotels = [], seen = new Map();
  const days = t.days.map(({ stay, ...d }) => {
    let hotel = null;
    if (stay) {
      const k = `${stay.name}|${(+stay.lat).toFixed(4)},${(+stay.lon).toFixed(4)}`;
      if (!seen.has(k)) { const h = { ...stay, uid: stay.uid || uid() }; hotels.push(h); seen.set(k, h.uid); }
      hotel = seen.get(k);
    }
    return { ...d, hotel };
  });
  return { ...t, hotels, days };
}

export function migrateTrip(t) {
  if (!t?.days?.length) return emptyTrip();
  if (t.pool) return flattenHotels(liftStays({ ...emptyTrip(), ...t, prefs: { ...DEFAULT_PREFS, ...t.prefs } }));
  const pool = [], seen = new Set();
  const days = t.days.map(d => ({
    start: d.start || '08:00', stay: d.stay || null,
    stops: (d.stops || []).map(s => {
      if (!seen.has(s.uid)) { seen.add(s.uid); pool.push({ uid: s.uid, id: s.id, name: s.name, area: s.area || '', lat: s.lat, lon: s.lon, cat: s.cat || catOf(s), wiki: s.wiki || null, mins: s.mins || 90, must: false, tag: null }); }
      return s.uid;
    }),
  }));
  return flattenHotels(liftStays({ ...emptyTrip(), hotels: undefined, startDate: t.startDate, guests: t.guests || 2, fuel: t.fuel || emptyTrip().fuel, pool, days }));
}

/** The hotel chosen for night i (after day i), or null. */
export const stayOf = (trip, i) => {
  const id = trip.days[i]?.hotel;
  return id ? (trip.hotels || []).find(h => h.uid === id) || null : null;
};
/** What the group pays per night at a hotel option. */
/** What the group pays per night at a hotel (you type the total). */
export const nightlyFor = (hotel) => Math.max(0, +hotel?.price || 0);

/** Earlier versions priced hotels per room / bed / place; fold that into one nightly total. */
function flattenHotels(t) {
  const people = Math.max(1, t.guests || 2);
  return {
    ...t,
    hotels: (t.hotels || []).map(h => {
      if (!h.unit && !h.sleeps) return h;
      const sleeps = h.unit === 'bed' ? 1 : Math.max(1, h.sleeps || (h.unit === 'place' ? 4 : 2));
      const { unit, sleeps: _s, kind, estimated, id, ...rest } = h;
      return { ...rest, price: Math.round((+h.price || 0) * Math.ceil(people / sleeps)) };
    }),
  };
}

export const placesById = (trip) => Object.fromEntries(trip.pool.map(p => [p.uid, p]));
export const stopsOf = (trip, i, byId = placesById(trip)) => trip.days[i].stops.map(u => byId[u]).filter(Boolean);
/** uid → day index for every scheduled wishlist place. */
export const dayOfPlace = (trip) => { const m = new Map(); trip.days.forEach((d, i) => d.stops.forEach(u => m.set(u, i))); return m; };

// ─── Route + cost math ───────────────────────────────────────────────────────

/** Points driven on day i: last night's stay → stops → tonight's stay. */
export function dayPoints(trip, i) {
  const day = trip.days[i];
  const pts = [];
  const prevStay = i > 0 ? stayOf(trip, i - 1) : null;
  const tonight = i < trip.days.length - 1 ? stayOf(trip, i) : null;
  if (prevStay) pts.push({ ...prevStay, role: 'from' });
  stopsOf(trip, i).forEach(s => pts.push({ ...s, role: 'stop' }));
  if (tonight) pts.push({ ...tonight, role: 'to' });
  return pts;
}

export const routeKey = (pts) => pts.map(p => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');

/** Straight-line distance × a road factor, used when the routing service can't be reached. */
export function estimateLegs(pts) {
  const R = 6371, rad = Math.PI / 180;
  return pts.slice(1).map((b, k) => {
    const a = pts[k];
    const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(h)) * 1.35;
    return { km, min: (km / 35) * 60, ferryKm: 0, estimated: true };
  });
}

export const gasCost = (km, fuel) => (fuel.kmPerL > 0 ? (km / fuel.kmPerL) * fuel.pricePerL : 0);

const toMin = (hhmm) => { const [h, m] = (hhmm || '08:00').split(':').map(Number); return h * 60 + (m || 0); };
export const fmtClock = (mins) => {
  const m = Math.round(mins), h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}${m >= 1440 ? ' +1' : ''}`;
};
export const fmtDur = (mins) => { const m = Math.round(mins); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };

/** Walks the day: leave at start time, drive each leg, spend `mins` at each stop. */
export function schedule(day, pts, legs) {
  let t = toMin(day.start);
  return pts.map((p, k) => {
    if (k > 0) t += legs?.[k - 1]?.min ?? 0;
    const arrive = t;
    if (p.role === 'stop') t += p.mins;
    return { arrive, leave: t };
  });
}

export const peso = (n) => '₱' + Math.round(n || 0).toLocaleString('en-PH');
