import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useEmergencies } from '../lib/emergencies.jsx';

const PLACEHOLDER = 'https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg';

// Passive indicator only — mirrors the plain "notifications" bell next to it.
// All click/navigation/list behavior lives on the sidebar's Emergency Alert button.
function EmergencyAlertIndicator() {
  const { count, justAdded } = useEmergencies();
  if (count === 0) return null;
  return (
    <span
      className={`relative p-2 text-[#BA1A1A]`}
      title={`${count} active emergency alert${count > 1 ? 's' : ''}`}
    >
      <span
        className={`material-symbols-outlined ${justAdded ? 'animate-emergency-pulse' : ''}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        emergency
      </span>
      <span
        className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#BA1A1A] text-white text-[10px] font-bold border-2 border-white ${
          justAdded ? 'animate-emergency-pulse' : ''
        }`}
      >
        {count}
      </span>
    </span>
  );
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="flex justify-between items-center w-full px-6 py-2 sticky top-0 z-30 border-slate-200 shadow-sm h-20 m-6 rounded-xl bg-white shrink-0">
      <div className="hidden md:flex items-center w-96 relative group">
        <span className="material-symbols-outlined absolute left-3 text-slate-500 text-[18px] group-focus-within:text-[#2304CF] transition-colors">
          search
        </span>
        <input
          type="text"
          placeholder="Search patients, MRN, or cases..."
          className="w-full bg-slate-100 border border-slate-200 text-slate-900 text-sm rounded-full pl-10 pr-4 py-1.5 focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF] placeholder:text-slate-500/70 transition-all shadow-sm"
        />
      </div>
      <div className="flex items-center gap-4 ml-auto">
        <EmergencyAlertIndicator />
        <button
          type="button"
          className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#BA1A1A] rounded-full border-2 border-white"></span>
        </button>
        <div className="relative mr-2" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-3 p-2 px-4 rounded-lg bg-white/80 hover:bg-slate-50 transition-colors cursor-pointer w-64 text-left"
          >
            <img
              className="w-10 h-10 rounded-full object-cover border border-slate-200"
              src={user?.avatar_url || PLACEHOLDER}
              alt={user?.full_name || 'User'}
            />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-bold text-slate-900 text-[15px] leading-tight truncate">
                {user?.full_name || 'Dr. User'}
              </span>
              <span className="text-slate-500 text-[13px] leading-tight truncate">
                {user?.department_name || user?.role || 'Clinician'}
              </span>
            </div>
            <span className="material-symbols-outlined text-slate-400 text-[20px]">
              {open ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  nav('/login', { replace: true });
                }}
                className="w-full text-left flex items-center gap-3 px-4 py-2 text-[#BA1A1A] hover:bg-red-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                <span className="font-medium text-sm">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
