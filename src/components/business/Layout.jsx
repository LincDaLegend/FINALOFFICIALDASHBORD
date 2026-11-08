'use client';

import { Search, Heart, Settings, Plane, FlaskConical, Briefcase } from 'lucide-react';

// Watchlist is hidden for now; set SHOW_WATCHLIST to true to bring it back (page + hearts)
export const SHOW_WATCHLIST = false;

export const TABS = [
  { id: 'business',  label: 'Business',    icon: Briefcase },
  { id: 'search',    label: 'eBay Search', icon: Search },
  ...(SHOW_WATCHLIST ? [{ id: 'watchlist', label: 'Watchlist', icon: Heart }] : []),
  { id: 'trip',      label: 'Cebu Trip',   icon: Plane }, // temporary
  { id: 'settings',  label: 'Settings',    icon: Settings },
];

function AppMark() {
  return (
    <span className="w-8 h-8 rounded-[9px] flex items-center justify-center text-white shadow-sm"
      style={{ background: 'linear-gradient(160deg, #0A84FF, #5E5CE6)' }} aria-hidden>
      <FlaskConical className="w-[18px] h-[18px]" strokeWidth={2.2} />
    </span>
  );
}

export default function Layout({ activeTab, setActiveTab, watchCount, children }) {
  return (
    <div className="min-h-dvh lg:pl-[260px]">
      {/* Sidebar — iPad / Mac */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[260px] flex-col material-sidebar shadow-[inset_-0.5px_0_0_var(--separator)]">
        <div className="flex items-center gap-2.5 px-5 pt-7 pb-6">
          <AppMark />
          <span className="text-title-2">API Tests</span>
        </div>
        <nav aria-label="Main" className="px-3 space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = activeTab === id;
            return (
              <button key={id} type="button" onClick={() => setActiveTab(id)} aria-current={on ? 'page' : undefined}
                className={`w-full h-9 flex items-center gap-2.5 px-2.5 rounded-[8px] text-[15px] pressable ${
                  on ? 'bg-tint text-white font-semibold' : 'text-label hover:bg-fill'
                }`}>
                <Icon className={`w-[18px] h-[18px] ${on ? '' : 'text-tint'}`} strokeWidth={2.2} aria-hidden />
                <span className="flex-1 text-left">{label}</span>
                {id === 'watchlist' && watchCount > 0 && (
                  <span className={`text-[13px] tabular ${on ? 'text-white/80' : 'text-label-2'}`}>{watchCount}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <main>{children}</main>

      {/* Tab bar — phone / small tablet */}
      <nav aria-label="Main"
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 material-bar shadow-[0_-0.5px_0_var(--bar-edge)] grid"
        style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = activeTab === id;
          return (
            <button key={id} type="button" onClick={() => setActiveTab(id)} aria-current={on ? 'page' : undefined}
              className={`relative h-[52px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${on ? 'text-tint' : 'text-label-2'}`}>
              <span className="relative">
                <Icon className="w-6 h-6" strokeWidth={on ? 2.4 : 2} fill={on && id === 'watchlist' ? 'currentColor' : 'none'} aria-hidden />
                {id === 'watchlist' && watchCount > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white text-[11px] font-semibold flex items-center justify-center tabular">
                    {watchCount > 99 ? '99+' : watchCount}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
