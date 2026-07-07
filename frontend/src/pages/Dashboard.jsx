import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const RISK_STYLES = {
  high:   { chip: 'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/20', label: 'High Risk' },
  medium: { chip: 'bg-amber-50 text-amber-700 border border-amber-200',    label: 'Moderate' },
  low:    { chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: 'Low Risk' },
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/patients')
      .then((r) => setPatients(r.patients))
      .catch(() => setPatients([]))
      .finally(() => setLoading(false));
  }, []);

  const firstName = (user?.full_name || '').replace(/^Dr\.\s*/, '').split(' ')[0] || 'Doctor';
  const highRiskCount = patients.filter((p) => p.risk_level === 'high').length;

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-8 pb-8 space-y-6">
        {/* Hero */}
        <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 p-8">
          <h1 className="text-3xl font-bold text-[#0F172A] leading-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-slate-500 mt-1">
            Here's what's happening with your patients today.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Cases"    value={patients.length}     icon="clinical_notes" tint="indigo" />
          <StatCard label="Pending Reviews" value={patients.filter(p => p.status === 'active').length} icon="fact_check"     tint="blue" />
          <StatCard label="High Risk"       value={highRiskCount}       icon="warning"        tint="rose"   urgent />
          <StatCard label="Team Status"     value="8 on shift"          icon="group"          tint="slate"  />
        </div>

        {/* Cases list */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-[#0F172A]">My Active Cases</h2>
              <button
                type="button"
                onClick={() => nav('/cases')}
                className="text-[#2304CF] font-semibold text-sm hover:underline"
              >
                View all
              </button>
            </div>
            {loading ? (
              <p className="text-slate-400 text-sm">Loading…</p>
            ) : patients.length === 0 ? (
              <p className="text-slate-400 text-sm">
                No patients are assigned to your department yet.
              </p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="pb-2 font-semibold">Patient</th>
                    <th className="pb-2 font-semibold">Risk</th>
                    <th className="pb-2 font-semibold">Last activity</th>
                    <th className="pb-2 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {patients.slice(0, 6).map((p) => {
                    const rs = RISK_STYLES[p.risk_level] || RISK_STYLES.low;
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50 cursor-pointer group"
                        onClick={() => nav(`/patients/${p.id}`)}
                      >
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <img className="w-8 h-8 rounded-full" src={p.avatar_url} alt="" />
                            <div>
                              <div className="font-semibold text-slate-900 group-hover:text-[#2304CF] transition-colors">
                                {p.full_name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {p.age}{p.gender[0]} · {p.external_id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${rs.chip}`}>
                            {rs.label}
                          </span>
                        </td>
                        <td className="py-3 text-sm text-slate-600">{timeAgo(p.last_activity)}</td>
                        <td className="py-3 text-right">
                          <span className="text-sm text-slate-600 capitalize">{p.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Today's updates */}
          <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 p-6">
            <h2 className="text-lg font-bold text-[#0F172A] mb-4">Today's Updates</h2>
            <div className="space-y-4">
              <UpdateItem tone="rose"   time="10:45 AM" title="Critical Lab Result"
                body="Potassium level critical for Pt. S. Jenkins. Immediate review required." />
              <UpdateItem tone="indigo" time="09:30 AM" title="New Admission"
                body="Pt. M. Chen admitted to Ward 4B from ER." />
              <UpdateItem tone="emerald" time="08:15 AM" title="Cardiology Note"
                body="Patient stable overnight. Recommend maintaining current BP meds pending nephrology review." />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ label, value, icon, tint = 'indigo', urgent }) {
  const tints = {
    indigo: 'bg-[#E0E0FF] text-[#2304CF]',
    blue:   'bg-blue-50 text-blue-600',
    rose:   'bg-[#FFDAD6] text-[#BA1A1A]',
    slate:  'bg-slate-100 text-slate-700',
  };
  return (
    <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100 p-5">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tints[tint]}`}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${urgent ? 'text-[#BA1A1A]' : 'text-[#0F172A]'}`}>{value}</span>
      </div>
    </div>
  );
}

function UpdateItem({ tone, time, title, body }) {
  const tones = { rose: 'border-[#BA1A1A]', indigo: 'border-[#2304CF]', emerald: 'border-emerald-500' };
  return (
    <div className="flex gap-4">
      <div className={`w-5 h-5 rounded-full bg-white border-[4px] ${tones[tone]} shrink-0 mt-1`}></div>
      <div>
        <p className="text-xs text-slate-500 font-medium mb-0.5">{time}</p>
        <p className="font-semibold text-slate-900 text-sm">{title}</p>
        <p className="text-sm text-slate-600 mt-1">{body}</p>
      </div>
    </div>
  );
}
