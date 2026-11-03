'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

// Critically damped by default (no overshoot); bounce only where a gesture carried momentum
export const SPRING = { type: 'spring', bounce: 0, duration: 0.4 };
export const SPRING_SNAPPY = { type: 'spring', bounce: 0, duration: 0.3 };

// ─── Page: large title that collapses into a translucent bar on scroll ───────

export function Page({ title, subtitle, children, wide = false, accessory }) {
  const sentinel = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: '-52px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-dvh pb-28 lg:pb-16">
      {/* Compact bar — appears once the large title scrolls away */}
      <div
        className={`sticky top-0 z-20 h-[52px] flex items-center justify-center transition-[background-color,box-shadow] duration-200 ${
          scrolled ? 'material-bar shadow-[0_0.5px_0_var(--bar-edge)]' : ''
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <span className={`text-headline transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!scrolled}>
          {title}
        </span>
      </div>

      <div className={`mx-auto px-4 sm:px-6 ${wide ? 'max-w-3xl' : 'max-w-2xl'}`}>
        <header className="flex items-end justify-between gap-4 pb-5 -mt-2">
          <div className="min-w-0">
            <h1 className="text-large-title">{title}</h1>
            {subtitle && <p className="text-subhead text-label-2 mt-1">{subtitle}</p>}
          </div>
          {accessory}
        </header>
        <div ref={sentinel} aria-hidden className="h-px -mt-px" />
        <div className="space-y-7">{children}</div>
      </div>
    </div>
  );
}

// ─── Grouped inset list (iOS Settings style) ─────────────────────────────────

export function Group({ header, footer, children, className = '' }) {
  return (
    <section className={className}>
      {header && <h2 className="text-footnote font-medium text-label-2 px-4 pb-1.5">{header}</h2>}
      <div className="group-list bg-surface rounded-group overflow-hidden">
        {children}
      </div>
      {footer && <div className="text-footnote text-label-2 px-4 pt-1.5">{footer}</div>}
    </section>
  );
}

/** A list row. Pass onClick or href to make the whole row pressable. */
export function Row({ icon, iconBg, title, subtitle, value, chevron, onClick, href, destructive, tint, children, className = '' }) {
  const body = (
    <>
      {icon && (
        <span className="w-[29px] h-[29px] rounded-[7px] flex items-center justify-center text-white shrink-0" style={{ background: iconBg || 'var(--tint)' }}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-body ${destructive ? 'text-red-ink' : tint ? 'text-tint-ink' : ''}`}>{title}</span>
        {subtitle && <span className="block text-footnote text-label-2 mt-0.5">{subtitle}</span>}
      </span>
      {value != null && <span className="text-body text-label-2 shrink-0 tabular">{value}</span>}
      {children}
      {chevron && <ChevronRight className="w-[17px] h-[17px] text-label-3 shrink-0 -mr-1" strokeWidth={2.5} aria-hidden />}
    </>
  );
  const cls = `w-full flex items-center gap-3 px-4 min-h-[48px] py-2.5 text-left ${className}`;
  // Separator inset starts after the icon, like iOS
  const style = icon ? { '--inset': '58px' } : undefined;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} row-press`} style={style}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} row-press`} style={style}>{body}</button>;
  return <div className={cls} style={style}>{body}</div>;
}

// ─── Controls ────────────────────────────────────────────────────────────────

export function Segmented({ options, value, onChange, label, size = 'md' }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`relative grid bg-fill rounded-[9px] p-[2px] ${size === 'sm' ? 'h-8' : 'h-9'}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className="relative z-0 px-2.5 text-[13px] font-medium whitespace-nowrap rounded-[7px] pressable">
            {on && (
              // The thumb slides between segments on a spring — interruptible if tapped mid-move
              <motion.span layoutId={`seg-${id}`} transition={SPRING_SNAPPY}
                className="absolute inset-0 -z-10 rounded-[7px] bg-surface shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-[#636366]" />
            )}
            <span className={on ? 'font-semibold' : 'text-label'}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative w-[51px] h-[31px] rounded-full shrink-0 transition-colors duration-200 ${checked ? 'bg-green' : 'bg-fill-2'}`}>
      <motion.span className="absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)]"
        animate={{ x: checked ? 20 : 0 }} transition={SPRING_SNAPPY} />
    </button>
  );
}

export function Button({ children, variant = 'filled', size = 'md', className = '', ...props }) {
  const v = {
    filled: 'bg-tint text-white hover:brightness-110',
    tinted: 'bg-tint-soft text-tint-ink hover:brightness-95',
    gray:   'bg-fill text-label hover:bg-fill-2',
    plain:  'text-tint-ink hover:opacity-70',
    destructive: 'bg-red-soft text-red-ink',
  }[variant];
  const s = { sm: 'h-8 px-3.5 text-[14px] rounded-full', md: 'h-11 px-5 text-[16px] rounded-[12px]', lg: 'h-[50px] px-6 text-[17px] rounded-[14px] w-full' }[size];
  return (
    <button type="button" className={`inline-flex items-center justify-center gap-1.5 font-semibold pressable disabled:opacity-40 disabled:pointer-events-none ${v} ${s} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Chip({ tone = 'gray', children }) {
  const t = {
    green: 'bg-green-soft text-green-ink', orange: 'bg-orange-soft text-orange-ink',
    red: 'bg-red-soft text-red-ink', blue: 'bg-tint-soft text-tint-ink', gray: 'bg-fill text-label-2',
  }[tone];
  return <span className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[12px] font-semibold whitespace-nowrap ${t}`}>{children}</span>;
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="text-center px-6 py-14">
      <div className="mx-auto w-14 h-14 rounded-full bg-fill flex items-center justify-center text-label-2">{icon}</div>
      <p className="text-title-2 mt-4">{title}</p>
      {children && <div className="text-subhead text-label-2 mt-1.5 max-w-sm mx-auto">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Toasts (HUD) ────────────────────────────────────────────────────────────

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const reduce = useReducedMotion();
  // action: { label, onClick } — e.g. Undo. Toasts with an action stay up longer.
  const show = useCallback((text, icon, action) => {
    clearTimeout(timer.current);
    setToast({ text, icon, action, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), action ? 4500 : 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="fixed inset-x-0 z-50 flex justify-center pointer-events-none bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-8" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.key}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="pointer-events-auto material-bar shadow-[var(--shadow-lg)] rounded-full pl-3.5 pr-4 h-11 flex items-center gap-2 text-subhead font-semibold">
              {toast.icon}{toast.text}
              {toast.action && (
                <button type="button" className="ml-2 text-tint-ink font-semibold pressable"
                  onClick={() => { toast.action.onClick(); setToast(null); }}>
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ─── Confirm dialog (only for destructive, irreversible actions) ─────────────

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }}
      className="backdrop:bg-[var(--scrim)] rounded-[14px] p-0 w-[min(300px,calc(100vw-48px))] bg-surface text-label shadow-[var(--shadow-lg)]">
      <div className="px-4 pt-5 pb-4 text-center">
        <p className="text-headline">{title}</p>
        <p className="text-footnote mt-1">{message}</p>
      </div>
      <div className="grid grid-cols-2 shadow-[inset_0_0.5px_0_var(--separator)]">
        <button type="button" onClick={onCancel} className="h-11 text-body text-tint-ink row-press" autoFocus>Cancel</button>
        <button type="button" onClick={onConfirm} className="h-11 text-body font-semibold text-red-ink row-press shadow-[inset_0.5px_0_0_var(--separator)]">{confirmLabel}</button>
      </div>
    </dialog>
  );
}
