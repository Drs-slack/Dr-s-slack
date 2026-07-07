import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const DEMO_ACCOUNTS = [
  { email: 'sarah.smith@drslack.demo',  label: 'Dr. Prerna · Cardiology' },
  { email: 'james.wilson@drslack.demo', label: 'Dr. Abhigneya · Nephrology' },
  { email: 'emily.davis@drslack.demo',  label: 'Dr. Vivek · Dermatology' },
  { email: 'michael.brown@drslack.demo',label: 'Dr. Pratheek · Radiology' },
  { email: 'anna.lee@drslack.demo',     label: 'Dr. Anna Lee · Neurology' },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('sarah.smith@drslack.demo');
  const [password, setPassword] = useState('password123');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
      nav('/', { replace: true });
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="w-full max-w-md p-8 bg-white rounded-[24px] shadow-[0_4px_30px_rgba(0,0,0,0.06)] border border-slate-100">
        <div className="flex items-center gap-2 mb-6">
          <span className="font-bold text-[22px] text-[#2304CF] tracking-tight leading-none">
            Dr's Slack
          </span>
        </div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Sign in</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Access your patient collaboration workspace.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#2304CF] focus:ring-1 focus:ring-[#2304CF]"
            />
          </div>
          {err && (
            <div className="text-sm text-[#BA1A1A] bg-[#FFDAD6] border border-[#BA1A1A]/20 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#2304CF] text-white text-sm font-semibold rounded-lg py-2.5 hover:bg-[#1c03a6] transition-colors shadow-[0_4px_14px_rgba(35,4,207,0.25)] disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Demo accounts (password: password123)
          </p>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword('password123');
                }}
                className="w-full text-left text-xs text-slate-600 hover:text-[#2304CF] hover:bg-slate-50 rounded px-2 py-1 transition-colors"
              >
                {a.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setEmail('admin@drslack.demo');
                setPassword('admin123');
              }}
              className="w-full text-left text-xs text-slate-600 hover:text-[#2304CF] hover:bg-slate-50 rounded px-2 py-1 transition-colors"
            >
              Admin · admin123
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
