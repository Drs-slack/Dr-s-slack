import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const STYLE = {
  success: { icon: 'check_circle', bg: 'bg-emerald-50', fg: 'text-emerald-700', border: 'border-emerald-200' },
  error:   { icon: 'error',        bg: 'bg-[#FFDAD6]',  fg: 'text-[#BA1A1A]',   border: 'border-[#BA1A1A]/20' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end">
        {toasts.map((t) => {
          const s = STYLE[t.type] || STYLE.success;
          return (
            <div
              key={t.id}
              role="status"
              className={`flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border ${s.bg} ${s.border} ${s.fg} text-sm font-semibold max-w-sm`}
            >
              <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
