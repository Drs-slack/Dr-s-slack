import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Small right-click / long-press menu, positioned near the trigger point and
// clamped so it never renders off-screen. Reused by every module that needs
// an Edit/Delete menu on an individual item, so behavior stays identical
// everywhere: outside click, Esc, scrolling, or right-clicking elsewhere all
// close it without action.
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - rect.height - pad);
    setPos({ left, top, ready: true });
  }, [x, y]);

  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    function handleElsewhereContextMenu(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleElsewhereContextMenu, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleElsewhereContextMenu, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      className="z-[100] min-w-[190px] bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.16)] border border-slate-100 py-1.5"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={`divider-${i}`} className="my-1 border-t border-slate-100" />
        ) : (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.disabled && item.disabledReason ? item.disabledReason : undefined}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onClick();
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-left transition-colors ${
              item.disabled
                ? 'text-slate-300 cursor-not-allowed'
                : item.danger
                  ? 'text-[#BA1A1A] hover:bg-[#FFDAD6]/50'
                  : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                item.disabled ? 'text-slate-300' : item.danger ? 'text-[#BA1A1A]' : 'text-slate-500'
              }`}
            >
              {item.icon}
            </span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
