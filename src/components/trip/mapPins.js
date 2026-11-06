// Pins shared by the Google map and the MapLibre fallback (plain DOM elements).

const BED_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg>';

export function pinEl({ stay, name, n, color }) {
  const el = document.createElement('div');
  el.className = `trip-pin ${stay ? 'trip-pin--stay' : ''}`;
  el.innerHTML = `<span class="trip-pin__head">${stay ? BED_SVG : n}</span><span class="trip-pin__tail"></span><span class="trip-pin__label"></span>`;
  el.querySelector('.trip-pin__label').textContent = name.length > 22 ? name.slice(0, 21) + '…' : name;
  el.title = name;
  if (!stay && color) el.querySelector('.trip-pin__head').style.background = color;
  return el;
}

export function dotEl(p, onPick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'trip-dot';
  el.title = p.name;
  el.setAttribute('aria-label', `Add ${p.name}`);
  el.innerHTML = '<span></span>';
  el.addEventListener('click', (e) => { e.stopPropagation(); onPick?.(p); });
  return el;
}

