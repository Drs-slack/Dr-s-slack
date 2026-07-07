import { useEffect, useRef } from 'react';
import { ALERT_TYPES } from '../lib/alertTypes.js';

// Filterable "/" command popup. Parent owns the query + keyboard-selected index
// so it can share the same onKeyDown handler as the text input.
export default function SlashAlertMenu({ query, activeIndex, onSelect, onClose }) {
  const ref = useRef(null);
  const matches = ALERT_TYPES.filter((a) => a.id.startsWith(query.toLowerCase()));

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  if (matches.length === 0) {
    return (
      <div ref={ref} className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20">
        <p className="px-4 py-3 text-xs text-slate-400">No matching alert.</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20">
      <p className="px-4 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
        Quick alerts
      </p>
      <ul>
        {matches.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(a)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                i === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${a.dot}`} />
              <span className="font-medium text-slate-800">{a.label}</span>
              <span className="ml-auto text-xs text-slate-400">{a.command}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
