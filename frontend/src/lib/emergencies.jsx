import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

const EmergencyContext = createContext(null);

const POLL_MS = 4000;

export function EmergencyProvider({ children }) {
  const { user } = useAuth();
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [justAdded, setJustAdded] = useState(false);
  const knownIds = useRef(null); // null = not yet fetched once
  const pulseTimer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/emergencies');
      const list = r.emergencies || [];
      if (knownIds.current) {
        const isNew = list.some((e) => !knownIds.current.has(e.id));
        if (isNew) {
          setJustAdded(true);
          clearTimeout(pulseTimer.current);
          pulseTimer.current = setTimeout(() => setJustAdded(false), 3000);
        }
      }
      knownIds.current = new Set(list.map((e) => e.id));
      setEmergencies(list);
    } catch {
      // ignore transient poll failures
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setEmergencies([]);
      knownIds.current = null;
      setLoading(false);
      return;
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(pulseTimer.current);
    };
  }, [user, refresh]);

  return (
    <EmergencyContext.Provider value={{ emergencies, count: emergencies.length, loading, justAdded, refresh }}>
      {children}
    </EmergencyContext.Provider>
  );
}

export function useEmergencies() {
  return useContext(EmergencyContext);
}
