import { useState } from 'react';
import { Menu, X, Box, Settings, Search, Heart, PlayCircle } from 'lucide-react';

export default function Layout({ children, activeTab, setActiveTab }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { id: 'demo',         label: 'Demo · Start Here',  icon: PlayCircle },
    { id: 'search',       label: 'Search eBay',        icon: Search },
    { id: 'watchlist',    label: 'Watchlist',           icon: Heart },
    { id: 'settings',     label: 'Settings & Data',     icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 shadow-xl lg:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-20 flex items-center justify-center px-6 border-b border-slate-100 relative">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-emerald-200">
              <Box className="w-5 h-5" />
            </div>
            <div className="flex flex-col items-start" style={{ marginTop: 4 }}>
              <span className="text-xl text-slate-900 font-extrabold tracking-tight leading-none">BALLER</span>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-tight">Business</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-400 absolute right-4 top-6">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col h-full">
          <nav className="flex-1 p-4 space-y-1 mt-4">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === item.id ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-400'}`} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-slate-100 pb-8">
            <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200">
              <p className="text-xs text-slate-400 font-medium">Baller v2.0</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        <header className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-500">
              <Menu className="w-6 h-6" />
            </button>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
                <Box className="w-4 h-4" />
              </div>
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">BALLER</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8" style={{ scrollbarWidth: 'thin' }}>
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
