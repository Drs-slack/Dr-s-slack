import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requirePatientAccess } from '../middleware.js';
import { checkTreatmentConflict } from '../ai-client.js';

const router = Router();

// Everything the conflict checker needs to evaluate a proposed treatment
// against this patient's existing cross-department care.
async function loadConflictInputs(patientId) {
  const [allergies, existingTreatments, patient] = await Promise.all([
    query(
      `SELECT a.substance, a.reaction, a.severity,
              d.full_name AS recorded_by_name, dep.name AS recorded_by_department
       FROM allergies a
       JOIN doctors d ON d.id = a.recorded_by
       LEFT JOIN departments dep ON dep.id = d.department_id
       WHERE a.patient_id = $1`,
      [patientId]
    ),
    query(
      `SELECT t.id, t.treatment_name, doc.full_name AS assigned_doctor_name, dep.name AS department_name
       FROM treatments t
       JOIN doctors doc ON doc.id = t.assigned_doctor_id
       JOIN departments dep ON dep.id = t.department_id
       WHERE t.patient_id = $1 AND t.status = 'ongoing'`,
      [patientId]
    ),
    one(`SELECT diagnoses FROM patients WHERE id = $1`, [patientId]),
  ]);
  return { allergies, existingTreatments, diagnoses: patient?.diagnoses || [] };
}

// List patients this doctor has access to via their department.
// Admin sees everyone.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = await query(
        `SELECT p.id, p.external_id, p.full_name, p.age, p.gender, p.risk_level,
                p.status, p.avatar_url, p.admitted_on,
                (SELECT MAX(created_at) FROM notes WHERE patient_id = p.id) AS last_activity
         FROM patients p ORDER BY p.id`
      );
    } else {
      rows = await query(
        `SELECT DISTINCT p.id, p.external_id, p.full_name, p.age, p.gender, p.risk_level,
                p.status, p.avatar_url, p.admitted_on,
                (SELECT MAX(created_at) FROM notes WHERE patient_id = p.id) AS last_activity
         FROM patients p
         JOIN patient_departments pd ON pd.patient_id = p.id
         WHERE pd.department_id = $1 ORDER BY p.id`,
        [req.user.department_id]
      );
    }
    res.json({ patients: rows });
  } catch (err) {
    next(err);
  }
});

// Full patient bundle: patient + allergies + meds + care team + notes.
router.get('/:patientId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const patient = await one(
      `SELECT id, external_id, full_name, age, gender, blood_group, admitted_on,
              risk_level, status, avatar_url, diagnoses, vitals, labs
       FROM patients WHERE id = $1`,
      [req.patientId]
    );
    if (!patient) return res.status(404).json({ error: 'not_found' });

    const [allergies, medications, careTeam, notes, treatments] = await Promise.all([
      query(
        `SELECT a.id, a.substance, a.reaction, a.severity, a.recorded_at, a.recorded_by,
                d.full_name AS recorded_by_name, dep.name AS recorded_by_department
         FROM allergies a
         JOIN doctors d ON d.id = a.recorded_by
         LEFT JOIN departments dep ON dep.id = d.department_id
         WHERE a.patient_id = $1 ORDER BY a.recorded_at DESC`,
        [req.patientId]
      ),
      query(
        `SELECT o.id, o.medication, o.dosage, o.reason, o.status, o.created_at, o.prescribed_by,
                d.full_name AS prescribed_by_name, dep.name AS department_name
         FROM orders o
         JOIN doctors d ON d.id = o.prescribed_by
         JOIN departments dep ON dep.id = o.department_id
         WHERE o.patient_id = $1 AND o.status = 'active'
         ORDER BY o.created_at DESC`,
        [req.patientId]
      ),
      query(
        `SELECT d.id, d.full_name, d.title, d.avatar_url, dep.id AS department_id, dep.name AS department_name, dep.icon_key
         FROM patient_departments pd
         JOIN departments dep ON dep.id = pd.department_id
         JOIN doctors d ON d.department_id = dep.id AND d.role = 'doctor'
         WHERE pd.patient_id = $1 ORDER BY dep.name, d.full_name`,
        [req.patientId]
      ),
      query(
        `SELECT n.id, n.kind, n.title, n.body, n.status, n.alert_type, n.reply_count, n.like_count, n.created_at,
                n.resolved_at, n.resolved_by, n.author_id, rd.full_name AS resolved_by_name,
                d.full_name AS author_name, dep.name AS department_name, dep.icon_key
         FROM notes n
         JOIN doctors d ON d.id = n.author_id
         JOIN departments dep ON dep.id = n.department_id
         LEFT JOIN doctors rd ON rd.id = n.resolved_by
         WHERE n.patient_id = $1 AND ($2::text IS NULL OR n.alert_type = $2)
         ORDER BY n.created_at ASC`,
        [req.patientId, req.query.alert_type || null]
      ),
      query(
        `SELECT t.id, t.treatment_name, t.start_date, t.status, t.notes, t.created_at, t.updated_at,
                t.conflict_severity, t.conflict_details, t.override_reason, t.is_override,
                t.created_by, t.assigned_doctor_id,
                dep.name AS department_name,
                doc.full_name AS assigned_doctor_name
         FROM treatments t
         JOIN departments dep ON dep.id = t.department_id
         JOIN doctors doc ON doc.id = t.assigned_doctor_id
         WHERE t.patient_id = $1
         ORDER BY t.updated_at DESC`,
        [req.patientId]
      ),
    ]);

    res.json({ patient, allergies, medications, careTeam, notes, treatments });
  } catch (err) {
    next(err);
  }
});

// Record a new allergy (must be a doctor on the care team).
router.post('/:patientId/allergies', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const { substance, reaction, severity = 'high' } = req.body || {};
    if (!substance) return res.status(400).json({ error: 'missing_substance' });

    const row = await one(
      `INSERT INTO allergies (patient_id, substance, reaction, severity, recorded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.patientId, substance, reaction || null, severity, req.user.id]
    );
    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'allergy.recorded',$3)`,
      [req.user.id, req.patientId, { substance, severity }]
    );
    res.status(201).json({ allergy: row });
  } catch (err) {
    next(err);
  }
});

// Preview a treatment — runs the cross-department conflict check without
// saving. Frontend calls this as the doctor is composing the treatment, so
// the warning appears BEFORE they hit Confirm (same pattern as orders/preview).
router.post('/:patientId/treatments/preview', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const { treatment_name } = req.body || {};
    if (!treatment_name) return res.status(400).json({ error: 'missing_treatment_name' });

    const { allergies, existingTreatments, diagnoses } = await loadConflictInputs(req.patientId);
    const aiResult = await checkTreatmentConflict({
      treatmentName: treatment_name,
      existingTreatments,
      allergies,
      diagnoses,
    });

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details)
       VALUES ($1,$2,'ai.treatment_check.preview',$3)`,
      [req.user.id, req.patientId, { treatment_name, severity: aiResult.severity, conflict_count: aiResult.conflicts.length }]
    );

    res.json({ aiCheck: aiResult });
  } catch (err) {
    next(err);
  }
});

// Add a treatment to the patient's treatment timeline. Re-runs the conflict
// check server-side (don't trust the client) and requires an override_reason
// if the check flags a high/critical-severity conflict.
router.post('/:patientId/treatments', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const { department_id, treatment_name, assigned_doctor_id, start_date, status, notes, override_reason } = req.body || {};
    if (!department_id || !treatment_name || !assigned_doctor_id || !start_date) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const { allergies, existingTreatments, diagnoses } = await loadConflictInputs(req.patientId);
    const aiResult = await checkTreatmentConflict({
      treatmentName: treatment_name,
      existingTreatments,
      allergies,
      diagnoses,
    });

    const hasBlocking = aiResult.severity === 'critical' || aiResult.severity === 'high';

    if (hasBlocking && !override_reason) {
      await query(
        `INSERT INTO audit_log (actor_id, patient_id, action, details)
         VALUES ($1,$2,'ai.treatment_conflict.raised',$3)`,
        [req.user.id, req.patientId, { treatment_name, severity: aiResult.severity, conflicts: aiResult.conflicts }]
      );
      return res.status(409).json({ error: 'conflict_requires_override', aiCheck: aiResult });
    }

    const isOverride = hasBlocking && Boolean(override_reason);
    const conflictSeverity = aiResult.severity === 'none' ? null : aiResult.severity;
    const conflictDetails = aiResult.conflicts.length ? JSON.stringify(aiResult.conflicts) : null;

    const row = await one(
      `INSERT INTO treatments
         (patient_id, department_id, treatment_name, assigned_doctor_id, start_date, status, notes, created_by,
          conflict_severity, conflict_details, override_reason, is_override)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, treatment_name, start_date, status, notes, created_at, updated_at,
                 conflict_severity, conflict_details, override_reason, is_override`,
      [
        req.patientId,
        department_id,
        treatment_name,
        assigned_doctor_id,
        start_date,
        status || 'ongoing',
        notes || null,
        req.user.id,
        conflictSeverity,
        conflictDetails,
        isOverride ? override_reason : null,
        isOverride,
      ]
    );
    const [dep, doc] = await Promise.all([
      one('SELECT name FROM departments WHERE id = $1', [department_id]),
      one('SELECT full_name FROM doctors WHERE id = $1', [assigned_doctor_id]),
    ]);
    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,$3,$4)`,
      [
        req.user.id,
        req.patientId,
        isOverride ? 'treatment.conflict.override' : 'treatment.added',
        {
          treatment_id: row.id,
          treatment_name,
          department_id,
          status: row.status,
          severity: aiResult.severity,
          override_reason: isOverride ? override_reason : null,
        },
      ]
    );

    // Escalate a flagged-and-overridden treatment: mention the conflicting
    // doctor(s) in the Discussion Timeline. Critical-severity conflicts also
    // raise an Emergency Alert via the existing alert_type='emergency' feed —
    // moderate/low conflicts stay visible via alert_type='critical' without
    // inflating the nav Emergency Alert count.
    if (conflictSeverity) {
      const conflictingDoctors = [...new Set(
        aiResult.conflicts
          .filter((c) => c.source?.kind === 'treatment' && c.source.doctor_name)
          .map((c) => c.source.doctor_name)
      )];
      const mention = conflictingDoctors.length ? `Notifying ${conflictingDoctors.join(', ')}. ` : '';
      const conflictLines = aiResult.conflicts.map((c) => `- ${c.message}`).join('\n');
      const overrideLine = isOverride ? `\n\nOverride reason: ${override_reason}` : '';

      await query(
        `INSERT INTO notes (patient_id, author_id, department_id, kind, title, body, status, alert_type)
         VALUES ($1,$2,$3,'concern',$4,$5,'Concern',$6)`,
        [
          req.patientId,
          req.user.id,
          department_id,
          'Cross-Department Treatment Conflict',
          `${mention}"${treatment_name}" conflicts with existing care:\n${conflictLines}${overrideLine}`,
          conflictSeverity === 'critical' ? 'emergency' : 'critical',
        ]
      );
    }

    res.status(201).json({
      treatment: {
        ...row,
        created_by: req.user.id,
        assigned_doctor_id,
        department_name: dep?.name,
        assigned_doctor_name: doc?.full_name,
      },
      aiCheck: aiResult,
    });
  } catch (err) {
    next(err);
  }
});

// Edit a treatment. Only the doctor who created it, the assigned doctor, or
// an admin may edit — and only while it's not yet completed. A completed
// treatment is a finalized record.
router.patch('/:patientId/treatments/:treatmentId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const treatmentId = Number(req.params.treatmentId);
    if (!Number.isFinite(treatmentId)) return res.status(400).json({ error: 'bad_treatment_id' });

    const existing = await one(
      `SELECT id, created_by, assigned_doctor_id, status FROM treatments WHERE id = $1 AND patient_id = $2`,
      [treatmentId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const isOwner = existing.created_by === req.user.id || existing.assigned_doctor_id === req.user.id;
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only edit treatments you created or are assigned to.' });
    }
    if (existing.status === 'completed') {
      return res.status(409).json({ error: 'locked', message: 'Completed treatments are locked.' });
    }

    const { treatment_name, start_date, status, notes } = req.body || {};
    const row = await one(
      `UPDATE treatments SET
         treatment_name = COALESCE($1, treatment_name),
         start_date = COALESCE($2, start_date),
         status = COALESCE($3, status),
         notes = COALESCE($4, notes),
         updated_at = NOW()
       WHERE id = $5 AND patient_id = $6
       RETURNING id, treatment_name, start_date, status, notes, created_at, updated_at,
                 conflict_severity, conflict_details, override_reason, is_override,
                 created_by, assigned_doctor_id`,
      [treatment_name ?? null, start_date ?? null, status ?? null, notes ?? null, treatmentId, req.patientId]
    );

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'treatment.updated',$3)`,
      [req.user.id, req.patientId, { treatment_id: treatmentId }]
    );

    const [dep, doc] = await Promise.all([
      one('SELECT name FROM departments WHERE id = (SELECT department_id FROM treatments WHERE id = $1)', [treatmentId]),
      one('SELECT full_name FROM doctors WHERE id = $1', [row.assigned_doctor_id]),
    ]);

    res.json({ treatment: { ...row, department_name: dep?.name, assigned_doctor_name: doc?.full_name } });
  } catch (err) {
    next(err);
  }
});

// Delete a treatment. Same ownership + completed-lock rules as edit.
router.delete('/:patientId/treatments/:treatmentId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const treatmentId = Number(req.params.treatmentId);
    if (!Number.isFinite(treatmentId)) return res.status(400).json({ error: 'bad_treatment_id' });

    const existing = await one(
      `SELECT id, created_by, assigned_doctor_id, status, treatment_name FROM treatments WHERE id = $1 AND patient_id = $2`,
      [treatmentId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const isOwner = existing.created_by === req.user.id || existing.assigned_doctor_id === req.user.id;
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only delete treatments you created or are assigned to.' });
    }
    if (existing.status === 'completed') {
      return res.status(409).json({ error: 'locked', message: 'Completed treatments are locked.' });
    }

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'treatment.deleted',$3)`,
      [req.user.id, req.patientId, { treatment_id: treatmentId, treatment_name: existing.treatment_name }]
    );
    await query(`DELETE FROM treatments WHERE id = $1 AND patient_id = $2`, [treatmentId, req.patientId]);

    res.json({ id: treatmentId });
  } catch (err) {
    next(err);
  }
});

// Edit an allergy (a Risk Centre entry). Only the recording doctor or an
// admin may edit.
router.patch('/:patientId/allergies/:allergyId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const allergyId = Number(req.params.allergyId);
    if (!Number.isFinite(allergyId)) return res.status(400).json({ error: 'bad_allergy_id' });

    const existing = await one(
      `SELECT id, recorded_by FROM allergies WHERE id = $1 AND patient_id = $2`,
      [allergyId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && existing.recorded_by !== req.user.id) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only edit allergies you recorded.' });
    }

    const { substance, reaction, severity } = req.body || {};
    const row = await one(
      `UPDATE allergies SET
         substance = COALESCE($1, substance),
         reaction = COALESCE($2, reaction),
         severity = COALESCE($3, severity)
       WHERE id = $4 AND patient_id = $5
       RETURNING *`,
      [substance ?? null, reaction ?? null, severity ?? null, allergyId, req.patientId]
    );

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'allergy.updated',$3)`,
      [req.user.id, req.patientId, { allergy_id: allergyId }]
    );

    res.json({ allergy: row });
  } catch (err) {
    next(err);
  }
});

// Delete an allergy. Same ownership rule as edit.
router.delete('/:patientId/allergies/:allergyId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const allergyId = Number(req.params.allergyId);
    if (!Number.isFinite(allergyId)) return res.status(400).json({ error: 'bad_allergy_id' });

    const existing = await one(
      `SELECT id, recorded_by, substance FROM allergies WHERE id = $1 AND patient_id = $2`,
      [allergyId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && existing.recorded_by !== req.user.id) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only delete allergies you recorded.' });
    }

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'allergy.deleted',$3)`,
      [req.user.id, req.patientId, { allergy_id: allergyId, substance: existing.substance }]
    );
    await query(`DELETE FROM allergies WHERE id = $1 AND patient_id = $2`, [allergyId, req.patientId]);

    res.json({ id: allergyId });
  } catch (err) {
    next(err);
  }
});

export default router;
