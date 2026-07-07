import { Router } from 'express';
import { one, query } from '../db.js';
import { verifyPassword, signToken } from '../auth.js';
import { requireAuth } from '../middleware.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'missing_credentials' });

    const doctor = await one(
      `SELECT d.id, d.email, d.password_hash, d.full_name, d.title, d.role, d.avatar_url,
              d.department_id, dep.name AS department_name
       FROM doctors d LEFT JOIN departments dep ON dep.id = d.department_id
       WHERE d.email = $1`,
      [email.toLowerCase()]
    );
    if (!doctor) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await verifyPassword(password, doctor.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const token = signToken(doctor);

    await query(
      `INSERT INTO audit_log (actor_id, action, details) VALUES ($1, 'auth.login', $2)`,
      [doctor.id, { email: doctor.email }]
    );

    res.json({
      token,
      user: {
        id: doctor.id,
        email: doctor.email,
        full_name: doctor.full_name,
        title: doctor.title,
        role: doctor.role,
        avatar_url: doctor.avatar_url,
        department_id: doctor.department_id,
        department_name: doctor.department_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const doctor = await one(
      `SELECT d.id, d.email, d.full_name, d.title, d.role, d.avatar_url,
              d.department_id, dep.name AS department_name
       FROM doctors d LEFT JOIN departments dep ON dep.id = d.department_id
       WHERE d.id = $1`,
      [req.user.id]
    );
    res.json({ user: doctor });
  } catch (err) {
    next(err);
  }
});

export default router;
