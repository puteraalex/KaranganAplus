import { useNavigate, useLocation } from 'react-router';
import { Home, PenLine, History, BarChart3, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Papan Utama', icon: Home },
  { path: '/upload', label: 'Analisis', icon: PenLine },
  { path: '/karangan', label: 'Sejarah', icon: History },
  { path: '/prestasi', label: 'Prestasi', icon: BarChart3 },
];

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <aside className="hidden md:flex md:flex-col w-60 bg-white border-r border-black/5 p-5 gap-1 shrink-0">
        <p className="font-display text-lg font-semibold text-[#0F2A5F] mb-6 px-2">Karangan A+</p>
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left ${
                active ? 'bg-[#EFF6FF] text-[#2563EB]' : 'text-[#0F172A]/60 hover:bg-black/5'
              }`}>
              <Icon size={20} />{item.label}
            </button>
          );
        })}
        <div className="mt-auto">
          <button onClick={() => navigate('/profile')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left w-full ${
              location.pathname === '/profile' ? 'bg-[#EFF6FF] text-[#2563EB]' : 'text-[#0F172A]/60 hover:bg-black/5'
            }`}>
            <Settings size={20} />Tetapan
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col pb-20 md:pb-0 min-w-0">
        {children}
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 flex items-center justify-around py-2 px-2 z-40">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 ${active ? 'text-[#2563EB]' : 'text-[#0F172A]/40'}`}>
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        <button onClick={() => navigate('/profile')}
          className={`flex flex-col items-center gap-0.5 ${location.pathname === '/profile' ? 'text-[#2563EB]' : 'text-[#0F172A]/40'}`}>
          <Settings size={20} />
          <span className="text-[10px] font-medium">Tetapan</span>
        </button>
      </div>
    </div>
  );
}

export default Layout;