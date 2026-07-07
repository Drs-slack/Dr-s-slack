import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ActiveCases from './pages/ActiveCases.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Messages from './pages/Messages.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function FullPageLoader() {
  return (
    <div className="h-screen w-screen flex items-center justify-center text-slate-400">
      <div className="animate-pulse">Loading…</div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/cases"
        element={
          <RequireAuth>
            <ActiveCases />
          </RequireAuth>
        }
      />
      <Route
        path="/patients/:patientId"
        element={
          <RequireAuth>
            <PatientDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/calendar"
        element={
          <RequireAuth>
            <CalendarPage />
          </RequireAuth>
        }
      />
      <Route
        path="/messages"
        element={
          <RequireAuth>
            <Messages />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
