import { useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'];
const DAYS = [
  { label: 'Mon', date: 12 },
  { label: 'Tue', date: 13, today: true },
  { label: 'Wed', date: 14 },
  { label: 'Thu', date: 15 },
  { label: 'Fri', date: 16 },
];

const APPOINTMENTS = [
  {
    id: 1,
    day: 0,
    top: 80,
    height: 70,
    tone: 'indigo',
    time: '09:00 - 09:45',
    title: 'J. Doe - Checkup',
  },
  {
    id: 2,
    day: 1,
    top: 20,
    height: 110,
    tone: 'rose',
    time: '08:15 - 09:30',
    title: 'S. Smith - Trauma',
    sub: 'OR - Bay 3',
    icon: 'warning',
    urgent: true,
  },
  {
    id: 3,
    day: 1,
    top: 180,
    height: 50,
    tone: 'blue',
    time: '10:15 - 10:45',
    title: 'A. Vance - Follow up',
    icon: 'videocam',
  },
];

const TONES = {
  indigo: { bg: 'bg-[#E0E0FF]', border: 'border-[#2304CF]', text: 'text-[#00006E]', hover: 'hover:bg-[#d3d0ff]' },
  rose: { bg: 'bg-[#FFDAD6]', border: 'border-[#BA1A1A]', text: 'text-[#BA1A1A]', hover: 'hover:bg-[#ffc9c4]' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-800', hover: 'hover:bg-blue-100' },
};

const UPCOMING = [
  {
    id: 1,
    tone: 'rose',
    time: '08:15 AM (In 15m)',
    title: 'Trauma Consult',
    sub: 'S. Smith • ER Bay 3',
  },
  {
    id: 2,
    tone: 'indigo',
    time: '09:00 AM',
    title: 'Standard Rounds',
    sub: 'ICU Wing B • 4 Patients',
  },
  {
    id: 3,
    tone: 'blue',
    time: '10:15 AM',
    title: 'Post-Op Review',
    sub: 'A. Vance • Remote',
    icon: 'videocam',
  },
];

export default function CalendarPage() {
  const [view, setView] = useState('week');
  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    []
  );

  return (
    <Layout>
      <div className="flex-1 overflow-hidden px-6 md:px-8 pb-8 flex gap-6">
        {/* Calendar view */}
        <div className="flex-1 flex flex-col rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <h2 className="text-lg font-bold text-[#0F172A]">{monthLabel}</h2>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
            <div className="flex gap-3">
              <div className="bg-slate-100 rounded-lg flex p-1 border border-slate-200">
                {['week', 'month'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={
                      view === v
                        ? 'px-4 py-1.5 rounded-md text-sm font-semibold bg-white text-[#0F172A] shadow-sm capitalize'
                        : 'px-4 py-1.5 rounded-md text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors capitalize'
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="bg-[#2304CF] text-white hover:bg-[#1c00a6] text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add Appt
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto relative custom-scrollbar">
            <div className="flex min-w-[45rem]">
              {/* Time column */}
              <div className="w-16 shrink-0 border-r border-slate-100 flex flex-col pt-12">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="h-20 flex items-start justify-center text-xs font-medium text-slate-400 border-b border-slate-50"
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div className="flex flex-1">
                {DAYS.map((d, i) => (
                  <div key={d.label} className="flex-1 border-r border-slate-100 relative min-w-[8.125rem]">
                    <div className="sticky top-0 bg-white/95 backdrop-blur z-20 h-12 flex flex-col items-center justify-center border-b border-slate-100">
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          d.today ? 'text-[#2304CF]' : 'text-slate-400'
                        }`}
                      >
                        {d.label}
                      </span>
                      {d.today ? (
                        <span className="text-sm font-bold text-white bg-[#2304CF] rounded-full w-7 h-7 flex items-center justify-center mt-0.5">
                          {d.date}
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-[#0F172A] mt-0.5">{d.date}</span>
                      )}
                    </div>
                    <div className="absolute inset-0 flex flex-col pointer-events-none mt-12">
                      {HOURS.map((h) => (
                        <div key={h} className="h-20 border-b border-slate-50"></div>
                      ))}
                    </div>
                    {APPOINTMENTS.filter((a) => a.day === i).map((a) => {
                      const t = TONES[a.tone];
                      return (
                        <div
                          key={a.id}
                          style={{ top: `calc(3rem + ${(a.top / 16).toFixed(3)}rem)`, height: `${(a.height / 16).toFixed(3)}rem` }}
                          className={`absolute left-2 right-2 rounded-lg p-2 flex flex-col shadow-sm cursor-pointer transition-colors z-10 border-l-4 ${t.bg} ${t.border} ${t.hover}`}
                        >
                          <div className="flex justify-between items-start">
                            <span className={`text-xs font-bold ${t.text}`}>{a.time}</span>
                            {a.icon && (
                              <span className={`material-symbols-outlined text-[14px] ${t.text}`}>
                                {a.icon}
                              </span>
                            )}
                          </div>
                          <span className={`text-xs truncate mt-0.5 ${t.text} ${a.urgent ? 'font-bold' : ''}`}>
                            {a.title}
                          </span>
                          {a.sub && (
                            <span className={`text-xs mt-auto opacity-80 ${t.text}`}>{a.sub}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming panel */}
        <aside className="w-80 shrink-0 hidden lg:flex flex-col rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 p-5">
          <div className="flex items-center gap-3 mb-5">
            <span className="material-symbols-outlined text-[#2304CF]">schedule</span>
            <h3 className="text-base font-bold text-[#0F172A]">Next 4 Hours</h3>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
            {UPCOMING.map((u) => {
              const t = TONES[u.tone];
              return (
                <div
                  key={u.id}
                  className={`bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-slate-300 transition-colors group cursor-pointer relative overflow-hidden`}
                >
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${t.border.replace('border-', 'bg-')}`}></div>
                  <div className="flex justify-between items-start pl-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${t.text}`}>{u.time}</span>
                        {u.icon && (
                          <span className={`material-symbols-outlined text-[14px] ${t.text}`}>{u.icon}</span>
                        )}
                      </div>
                      <span className="text-sm text-[#0F172A] mt-1">{u.title}</span>
                      <span className="text-xs text-slate-500">{u.sub}</span>
                    </div>
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-slate-700 transition-colors">
                      chevron_right
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </Layout>
  );
}
