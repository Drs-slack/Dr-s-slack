import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requirePatientAccess } from '../middleware.js';
import { checkOrder } from '../ai-client.js';

const router = Router();

// Preview an order — runs the AI check without saving. Frontend calls this
// as the doctor is composing the order, so the alert appears BEFORE they hit
// Confirm. Synchronous by design (see README).
router.post('/:patientId/orders/preview', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const { medication, dosage } = req.body || {};
    if (!medication) return res.status(400).json({ error: 'missing_medication' });

    const allergies = await query(
      `SELECT a.substance, a.reaction, a.severity, a.recorded_at,
              d.full_name AS recorded_by_name, dep.name AS recorded_by_department
       FROM allergies a
       JOIN doctors d ON d.id = a.recorded_by
       LEFT JOIN departments dep ON dep.id = d.department_id
       WHERE a.patient_id = $1`,
      [req.patientId]
    );
    const currentMedications = await query(
      `SELECT o.medication, o.dosage, d.full_name AS prescribed_by_name, dep.name AS prescribed_by_department
       FROM orders o
       JOIN doctors d ON d.id = o.prescribed_by
       JOIN departments dep ON dep.id = o.department_id
       WHERE o.patient_id = $1 AND o.status = 'active'`,
      [req.patientId]
    );

    const aiResult = await checkOrder({
      medication,
      dosage: dosage || '',
      allergies,
      currentMedications,
    });

    // Log every AI check for auditability, even when clean.
    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details)
       VALUES ($1,$2,'ai.check.preview',$3)`,
      [
        req.user.id,
        req.patientId,
        { medication, dosage, severity: aiResult.severity, conflict_count: aiResult.conflicts.length },
      ]
    );

    res.json({ aiCheck: aiResult });
  } catch (err) {
    next(err);
  }
});

// Place the order for real. Re-runs the AI check server-side (don't trust the client)
// and requires override_reason if there are conflicts.
router.post('/:patientId/orders', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const { medication, dosage, reason, override_reason } = req.body || {};
    if (!medication || !dosage) return res.status(400).json({ error: 'missing_fields' });

    const [allergies, currentMedications] = await Promise.all([
      query(
        `SELECT a.substance, a.reaction, a.severity, a.recorded_at,
                d.full_name AS recorded_by_name, dep.name AS recorded_by_department
         FROM allergies a
         JOIN doctors d ON d.id = a.recorded_by
         LEFT JOIN departments dep ON dep.id = d.department_id
         WHERE a.patient_id = $1`,
        [req.patientId]
      ),
      query(
        `SELECT o.medication, o.dosage, d.full_name AS prescribed_by_name, dep.name AS prescribed_by_department
         FROM orders o
         JOIN doctors d ON d.id = o.prescribed_by
         JOIN departments dep ON dep.id = o.department_id
         WHERE o.patient_id = $1 AND o.status = 'active'`,
        [req.patientId]
      ),
    ]);

    const aiResult = await checkOrder({
      medication,
      dosage,
      allergies,
      currentMedications,
    });

    const hasBlocking =
      aiResult.severity === 'critical' || aiResult.severity === 'high';

    if (hasBlocking && !override_reason) {
      // Log the raised alert; do not save the order.
      await query(
        `INSERT INTO audit_log (actor_id, patient_id, action, details)
         VALUES ($1,$2,'ai.alert.raised',$3)`,
        [
          req.user.id,
          req.patientId,
          {
            medication,
            dosage,
            severity: aiResult.severity,
            conflicts: aiResult.conflicts,
          },
        ]
      );
      return res.status(409).json({
        error: 'conflict_requires_override',
        aiCheck: aiResult,
      });
    }

    const order = await one(
      `INSERT INTO orders
         (patient_id, medication, dosage, reason, prescribed_by, department_id,
          ai_check_result, override_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, medication, dosage, reason, status, created_at, prescribed_by`,
      [
        req.patientId,
        medication,
        dosage,
        reason || null,
        req.user.id,
        req.user.department_id,
        aiResult,
        override_reason || null,
      ]
    );

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details)
       VALUES ($1,$2,$3,$4)`,
      [
        req.user.id,
        req.patientId,
        override_reason ? 'order.override' : 'order.placed',
        {
          order_id: order.id,
          medication,
          dosage,
          severity: aiResult.severity,
          override_reason: override_reason || null,
        },
      ]
    );

    // Escalate an overridden prescription (e.g. prescribed despite a
    // documented allergy): mention the conflicting doctor(s) — whoever
    // recorded the allergy or prescribed the interacting medication — in the
    // Discussion Timeline. Critical-severity conflicts also raise an
    // Emergency Alert via the existing alert_type='emergency' feed;
    // high-severity overrides stay visible via alert_type='critical'
    // without inflating the nav Emergency Alert count.
    if (override_reason && hasBlocking) {
      const conflictingDoctors = [...new Set(
        aiResult.conflicts
          .map((c) => c.source?.recorded_by || c.source?.prescribed_by_name)
          .filter(Boolean)
      )];
      const mention = conflictingDoctors.length ? `Notifying ${conflictingDoctors.join(', ')}. ` : '';
      const conflictLines = aiResult.conflicts.map((c) => `- ${c.message}`).join('\n');

      await query(
        `INSERT INTO notes (patient_id, author_id, department_id, kind, title, body, status, alert_type)
         VALUES ($1,$2,$3,'concern',$4,$5,'Concern',$6)`,
        [
          req.patientId,
          req.user.id,
          req.user.department_id,
          'Prescription Conflict Override',
          `${mention}"${medication} ${dosage}" was prescribed despite a flagged conflict:\n${conflictLines}\n\nOverride reason: ${override_reason}`,
          aiResult.severity === 'critical' ? 'emergency' : 'critical',
        ]
      );
    }

    res.status(201).json({ order, aiCheck: aiResult });
  } catch (err) {
    next(err);
  }
});

// Edit a prescription. Only dosage and clinical reason are editable — the
// medication itself is immutable here since changing it would bypass the
// allergy/interaction check that runs at order time; that should be a new
// order. Only the prescribing doctor (or an admin) may edit, and only while
// the order is still active.
router.patch('/:patientId/orders/:orderId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ error: 'bad_order_id' });

    const existing = await one(
      `SELECT id, prescribed_by, status FROM orders WHERE id = $1 AND patient_id = $2`,
      [orderId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && existing.prescribed_by !== req.user.id) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only edit prescriptions you placed.' });
    }
    if (existing.status !== 'active') {
      return res.status(409).json({ error: 'locked', message: 'This prescription has already been cancelled.' });
    }

    const { dosage, reason } = req.body || {};
    const order = await one(
      `UPDATE orders SET
         dosage = COALESCE($1, dosage),
         reason = COALESCE($2, reason)
       WHERE id = $3 AND patient_id = $4
       RETURNING id, medication, dosage, reason, status, created_at, prescribed_by`,
      [dosage ?? null, reason ?? null, orderId, req.patientId]
    );

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'order.updated',$3)`,
      [req.user.id, req.patientId, { order_id: orderId }]
    );

    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// "Delete" a prescription. Prescriptions are a medical record, so this is a
// soft cancel (reusing the existing active/cancelled status) rather than a
// hard delete — it disappears from the active list the same as a true
// delete would. Only the prescribing doctor (or an admin) may cancel, and
// only while it's still active.
router.delete('/:patientId/orders/:orderId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ error: 'bad_order_id' });

    const existing = await one(
      `SELECT id, prescribed_by, status, medication FROM orders WHERE id = $1 AND patient_id = $2`,
      [orderId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && existing.prescribed_by !== req.user.id) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only delete prescriptions you placed.' });
    }
    if (existing.status !== 'active') {
      return res.status(409).json({ error: 'locked', message: 'This prescription has already been cancelled.' });
    }

    await query(`UPDATE orders SET status = 'cancelled' WHERE id = $1 AND patient_id = $2`, [orderId, req.patientId]);
    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'order.cancelled',$3)`,
      [req.user.id, req.patientId, { order_id: orderId, medication: existing.medication }]
    );

    res.json({ id: orderId });
  } catch (err) {
    next(err);
  }
});

export default router;
