import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware.js';

const router = Router();

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT a.id, a.action, a.details, a.created_at,
              d.full_name AS actor_name, dep.name AS actor_department,
              p.full_name AS patient_name, p.external_id AS patient_external_id
       FROM audit_log a
       LEFT JOIN doctors d ON d.id = a.actor_id
       LEFT JOIN departments dep ON dep.id = d.department_id
       LEFT JOIN patients p ON p.id = a.patient_id
       ORDER BY a.created_at DESC LIMIT 500`
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
