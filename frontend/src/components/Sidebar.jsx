import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useEmergencies } from '../lib/emergencies.jsx';

const NAV = [
  { to: '/',      icon: 'dashboard',       label: 'Dashboard' },
  { to: '/cases', icon: 'clinical_notes',  label: 'Active Cases' },
  { to: '/calendar', icon: 'calendar_month', label: 'Calendar' },
  { to: '/messages', icon: 'chat',         label: 'Messages' },
];

function fmtEmergencyTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function EmergencyAlertButton() {
  const nav = useNavigate();
  const { emergencies, count, justAdded } = useEmergencies();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function handleClick() {
    if (count === 0) return;
    if (count === 1) {
      const e = emergencies[0];
      nav(`/patients/${e.patient_id}?emergency=${e.id}`);
      return;
    }
    setOpen((o) => !o);
  }

  function goTo(e) {
    setOpen(false);
    nav(`/patients/${e.patient_id}?emergency=${e.id}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleClick}
        className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 transition-colors border ${
          count > 0
            ? `bg-[#FFDAD6] text-[#410002] border-[#BA1A1A]/30 hover:bg-[#FFDAD6]/80 ${justAdded ? 'animate-emergency-pulse' : ''}`
            : 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">emergency</span>
        <span className="text-xs font-semibold tracking-wide">Emergency Alert</span>
        {count > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#BA1A1A] text-white text-[10px] font-bold">
            {count}
          </span>
        )}
      </button>
      {open && count > 1 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 max-h-96 overflow-y-auto custom-scrollbar">
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700">{count} active emergencies</p>
          </div>
          {emergencies.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => goTo(e)}
              className="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors border-b border-slate-50 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 text-sm truncate">{e.patient_name}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{fmtEmergencyTime(e.created_at)}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Flagged by {e.flagged_by_name}</p>
              <p className="text-xs text-slate-600 mt-1 truncate">{e.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Item({ to, icon, label, disabled }) {
  if (disabled) {
    return (
      <span
        title="Coming soon"
        className="flex items-center gap-3 px-3 py-2 text-slate-400 cursor-not-allowed rounded-lg"
      >
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
        <span className="text-sm tracking-wide">{label}</span>
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        isActive
          ? 'flex items-center gap-3 px-3 py-2 bg-[#E0E0FF] text-[#00006E] rounded-lg font-bold relative'
          : 'flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-200'
      }
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span className="text-sm font-semibold tracking-wide">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <nav className="hidden md:flex flex-col w-64 bg-white p-4 gap-1 shrink-0 z-40 relative m-6 rounded-lg shadow-lg h-[calc(100vh-3rem)]">
      <div className="flex items-center gap-2 px-2 mt-1 mb-6">
        <span className="font-bold text-[20px] text-[#2304CF] tracking-tight leading-none">
          Dr's Slack
        </span>
      </div>
      <div className="flex flex-col gap-1 flex-1">
        {NAV.map((n) => (
          <Item key={n.label} {...n} />
        ))}
        <div className="mt-2">
          <EmergencyAlertButton />
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-slate-200 pt-4">
        <span className="flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-200 cursor-pointer">
          <span className="material-symbols-outlined text-[18px]">settings</span>
          <span className="text-xs font-semibold tracking-wide">Settings</span>
        </span>
        <span className="flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-200 cursor-pointer">
          <span className="material-symbols-outlined text-[18px]">help_center</span>
          <span className="text-xs font-semibold tracking-wide">Support</span>
        </span>
      </div>
    </nav>
  );
}
