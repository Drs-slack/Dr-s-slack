import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../lib/api.js';

const RISK_STYLES = {
  high:   { chip: 'bg-[#FFDAD6] text-[#BA1A1A] border border-[#BA1A1A]/20', label: 'High Risk' },
  medium: { chip: 'bg-amber-50 text-amber-700 border border-amber-200',    label: 'Medium' },
  low:    { chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: 'Low' },
};

export default function ActiveCases() {
  const nav = useNavigate();
  const [patients, setPatients] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/patients')
      .then((r) => setPatients(r.patients))
      .catch(() => setPatients([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter(
    (p) =>
      !q ||
      p.full_name.toLowerCase().includes(q.toLowerCase()) ||
      p.external_id.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-8 pb-8 space-y-4">
        <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-bold text-[#0F172A]">Active Cases</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Patients your department is currently collaborating on.
              </p>
            </div>
            <div className="relative w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter by name or ID…"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
              />
            </div>
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm py-8 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">
              No patients match your view.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Patient</th>
                  <th className="pb-3 font-semibold">Age / Sex</th>
                  <th className="pb-3 font-semibold">Risk</th>
                  <th className="pb-3 font-semibold">Admitted</th>
                  <th className="pb-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p) => {
                  const rs = RISK_STYLES[p.risk_level] || RISK_STYLES.low;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 cursor-pointer group"
                      onClick={() => nav(`/patients/${p.id}`)}
                    >
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <img className="w-9 h-9 rounded-full" src={p.avatar_url} alt="" />
                          <div>
                            <div className="font-semibold text-slate-900 group-hover:text-[#2304CF] transition-colors">
                              {p.full_name}
                            </div>
                            <div className="text-xs text-slate-500">{p.external_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 text-sm text-slate-600">
                        {p.age} / {p.gender}
                      </td>
                      <td className="py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${rs.chip}`}>
                          {rs.label}
                        </span>
                      </td>
                      <td className="py-4 text-sm text-slate-600">
                        {new Date(p.admitted_on).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-right text-sm text-slate-600 capitalize">
                        {p.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
