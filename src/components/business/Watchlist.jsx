'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, animate, useReducedMotion } from 'motion/react';
import { Heart, Trash2, Timer, Search } from 'lucide-react';
import { ebayItemUrl } from '../../legacy/utils/watchlist.js';
import { useWatchlist } from './watchlistHooks.js';
import { useSettings, pricing } from './stores.js';
import { Page, Group, Segmented, Chip, Button, EmptyState, useToast } from './ui.jsx';
import { Thumb, peso, timeLeft } from './FindCards.jsx';

const ACTION_W = 88;

// Where a flick would come to rest — Apple's scroll-deceleration projection
const project = (velocity, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);

/** Swipe left to reveal Delete. Tracks the finger 1:1, rubber-bands at the edge,
 *  and uses release velocity to decide open vs closed. */
function SwipeRow({ onDelete, label, children }) {
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  const settle = (to, velocity = 0) => {
    setOpen(to !== 0);
    animate(x, to, reduce ? { duration: 0 } : { type: 'spring', bounce: 0.15, duration: 0.35, velocity });
  };

  return (
    <div className="relative overflow-hidden">
      <button type="button" onClick={onDelete} tabIndex={open ? 0 : -1} aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red text-white text-subhead font-semibold"
        style={{ width: ACTION_W }}>
        Delete
      </button>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTION_W, right: 0 }}
        dragElastic={{ left: 0.2, right: 0.05 }}
        dragMomentum={false}
        style={{ x, touchAction: 'pan-y' }}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={(_, info) => {
          const projected = x.get() + project(info.velocity.x);
          settle(projected < -ACTION_W / 2 ? -ACTION_W : 0, info.velocity.x);
          setTimeout(() => { dragged.current = false; }, 0);
        }}
        // A drag, or a tap while open, shouldn't also open the link
        onClickCapture={(e) => {
          if (dragged.current || open) { e.preventDefault(); e.stopPropagation(); if (open) settle(0); }
        }}
        className="relative bg-surface"
        aria-label={label}
      >
        {children}
      </motion.div>
    </div>
  );
}

export default function Watchlist({ setActiveTab }) {
  const { items, remove, restore } = useWatchlist();
  const settings = useSettings();
  const toast = useToast();
  const [sort, setSort] = useState('added');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000); // keep auction countdowns fresh
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(() => {
    const ends = (i) => (i.endTime ? new Date(i.endTime).getTime() : Infinity);
    const total = (i) => (i.price || 0) + (i.shippingCost || 0);
    return [...items].sort((a, b) =>
      sort === 'ending' ? ends(a) - ends(b)
        : sort === 'price' ? total(a) - total(b)
        : (b.addedAt || '').localeCompare(a.addedAt || ''));
  }, [items, sort]);

  const live = items.filter(i => i.buyingOption === 'AUCTION' && (timeLeft(i.endTime, now)?.ms ?? 0) > 0).length;
  const totalPhp = items.reduce((s, i) => s + (i.title ? pricing(i, settings).costPhp : 0), 0);

  const del = (item) => {
    const before = items;
    remove(item.itemId);
    toast('Removed', <Trash2 className="w-4 h-4 text-label-2" aria-hidden />, { label: 'Undo', onClick: () => restore(before) });
  };

  if (items.length === 0) {
    return (
      <Page title="Watchlist">
        <EmptyState icon={<Heart className="w-6 h-6" aria-hidden />} title="Nothing saved yet"
          action={<Button onClick={() => setActiveTab('search')}><Search className="w-4 h-4" aria-hidden /> Find Cards</Button>}>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page title="Watchlist">
      <Group>
        <div className="grid grid-cols-3 divide-x divide-[var(--separator)] py-3">
          {[
            ['Cards', items.length],
            ['Live auctions', live],
            ['Total cost', peso(totalPhp)],
          ].map(([label, value]) => (
            <div key={label} className="text-center px-2">
              <div className="text-title-2 tabular">{value}</div>
              <div className="text-caption text-label-2">{label}</div>
            </div>
          ))}
        </div>
      </Group>

      <section>
        <div className="pb-2.5">
          <Segmented size="sm" label="Sort" value={sort} onChange={setSort}
            options={[{ value: 'added', label: 'Newest' }, { value: 'ending', label: 'Ending soon' }, { value: 'price', label: 'Lowest price' }]} />
        </div>
        <div className="bg-surface rounded-group overflow-hidden group-list" style={{ '--inset': '76px' }}>
          <AnimatePresence initial={false}>
            {sorted.map(item => {
              const left = item.buyingOption === 'AUCTION' ? timeLeft(item.endTime, now) : null;
              const p = item.title ? pricing(item, settings) : null;
              const added = item.addedAt ? new Date(item.addedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : null;
              return (
                <motion.div key={item.itemId} layout="position" exit={{ opacity: 0, height: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
                  <SwipeRow onDelete={() => del(item)} label={item.title || 'Saved card'}>
                    <div className="flex items-center">
                      <a href={ebayItemUrl(item)} target="_blank" rel="noopener noreferrer" draggable={false}
                        className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-3 row-press">
                        <Thumb src={item.imgUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-subhead font-medium leading-snug line-clamp-2">
                            {item.title || `eBay item ${String(item.itemId).split('|')[1] || item.itemId}`}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 mt-1">
                            {left && <Chip tone={left.ms > 0 && left.ms < 3600000 ? 'red' : 'gray'}><Timer className="w-3 h-3" aria-hidden />{left.label}</Chip>}
                            {added && <span className="text-caption text-label-2">Saved {added}</span>}
                          </span>
                        </span>
                        {p && (
                          <span className="shrink-0 text-right">
                            <span className="block text-headline tabular">{peso(p.costPhp)}</span>
                            <span className="block text-caption text-label-2 tabular">${p.usd.toFixed(2)}</span>
                          </span>
                        )}
                      </a>
                      {/* Mouse users: a visible delete button, since swiping isn't obvious with a pointer */}
                      <button type="button" onClick={() => del(item)} aria-label={`Delete ${item.title || 'card'}`}
                        className="hidden [@media(hover:hover)]:flex w-11 h-11 mr-2 items-center justify-center rounded-full text-label-3 hover:text-red-ink hover:bg-red-soft pressable">
                        <Trash2 className="w-[18px] h-[18px]" aria-hidden />
                      </button>
                    </div>
                  </SwipeRow>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <p className="text-footnote text-label-2 px-4 pt-1.5">Tap a card to open it on eBay. Swipe left to delete.</p>
      </section>
    </Page>
  );
}
