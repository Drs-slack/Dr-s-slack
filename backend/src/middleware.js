import { verifyToken } from './auth.js';
import { one } from './db.js';

// Attaches req.user = { id, email, role, department_id } from the Bearer token.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid_token' });

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    department_id: payload.department_id,
  };
  next();
}

// Only allow if the doctor's department is on this patient's care team.
// Admins bypass. Expects :patientId param.
export function requirePatientAccess(req, res, next) {
  (async () => {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: 'bad_patient_id' });
    }
    if (req.user.role === 'admin') {
      req.patientId = patientId;
      return next();
    }

    const link = await one(
      'SELECT 1 FROM patient_departments WHERE patient_id = $1 AND department_id = $2',
      [patientId, req.user.department_id]
    );
    if (!link) {
      return res.status(403).json({
        error: 'not_on_care_team',
        message: "Your department isn't assigned to this patient.",
      });
    }
    req.patientId = patientId;
    next();
  })().catch(next);
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin_only' });
  next();
}
