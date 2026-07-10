import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware.js';


const router = Router();

// Global list of active "emergency" tagged notes, across ALL patients —
// every doctor sees the same count/list regardless of department.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT n.id, n.body, n.created_at,
              p.id AS patient_id, p.external_id AS patient_external_id, p.full_name AS patient_name,
              d.full_name AS flagged_by_name
       FROM notes n
       JOIN patients p ON p.id = n.patient_id
       JOIN doctors d ON d.id = n.author_id
       WHERE n.alert_type = 'emergency' AND n.resolved_at IS NULL
       ORDER BY n.created_at DESC`
    );
    res.json({ emergencies: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
