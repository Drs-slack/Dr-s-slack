import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requirePatientAccess } from '../middleware.js';

const router = Router();

const ALERT_TYPES = new Set(['emergency', 'critical', 'urgent', 'stable', 'followup', 'observation']);

router.post('/:patientId/notes', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const { title, body, kind = 'note', status = 'Note', alert_type = null } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'missing_fields' });
    if (alert_type && !ALERT_TYPES.has(alert_type)) {
      return res.status(400).json({ error: 'invalid_alert_type' });
    }
    if (!req.user.department_id) {
      return res.status(403).json({ error: 'no_department', message: 'Admins cannot post notes.' });
    }

    const note = await one(
      `INSERT INTO notes (patient_id, author_id, department_id, kind, title, body, status, alert_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, kind, title, body, status, alert_type, reply_count, like_count, created_at`,
      [req.patientId, req.user.id, req.user.department_id, kind, title, body, status, alert_type]
    );

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'note.created',$3)`,
      [req.user.id, req.patientId, { note_id: note.id, kind, status, alert_type }]
    );

    // Return the enriched shape the timeline expects
    const enriched = await one(
      `SELECT n.id, n.kind, n.title, n.body, n.status, n.alert_type, n.reply_count, n.like_count, n.created_at,
              n.author_id, d.full_name AS author_name, dep.name AS department_name, dep.icon_key
       FROM notes n
       JOIN doctors d ON d.id = n.author_id
       JOIN departments dep ON dep.id = n.department_id
       WHERE n.id = $1`,
      [note.id]
    );

    res.status(201).json({ note: enriched });
  } catch (err) {
    next(err);
  }
});

// Mark an alert-tagged note (e.g. an emergency) as resolved. Any doctor on the
// care team can resolve; we record who + when for the audit trail.
router.patch('/:patientId/notes/:noteId/resolve', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const noteId = Number(req.params.noteId);
    if (!Number.isFinite(noteId)) return res.status(400).json({ error: 'bad_note_id' });

    const note = await one(
      `UPDATE notes SET resolved_at = NOW(), resolved_by = $1
       WHERE id = $2 AND patient_id = $3 AND resolved_at IS NULL
       RETURNING id, resolved_at, resolved_by`,
      [req.user.id, noteId, req.patientId]
    );
    if (!note) return res.status(404).json({ error: 'not_found_or_already_resolved' });

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'note.resolved',$3)`,
      [req.user.id, req.patientId, { note_id: noteId }]
    );

    const enriched = await one(
      `SELECT n.id, n.resolved_at, n.resolved_by, d.full_name AS resolved_by_name
       FROM notes n LEFT JOIN doctors d ON d.id = n.resolved_by
       WHERE n.id = $1`,
      [noteId]
    );

    res.json({ note: enriched });
  } catch (err) {
    next(err);
  }
});

// Edit a note. Only the author (or an admin) may edit — resolution status
// doesn't lock it, since resolving just records who handled the alert.
router.patch('/:patientId/notes/:noteId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const noteId = Number(req.params.noteId);
    if (!Number.isFinite(noteId)) return res.status(400).json({ error: 'bad_note_id' });

    const existing = await one(
      `SELECT id, author_id FROM notes WHERE id = $1 AND patient_id = $2`,
      [noteId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && existing.author_id !== req.user.id) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only edit your own entries.' });
    }

    const { title, body, alert_type } = req.body || {};
    if (alert_type && !ALERT_TYPES.has(alert_type)) {
      return res.status(400).json({ error: 'invalid_alert_type' });
    }
    if (title === undefined && body === undefined && alert_type === undefined) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const note = await one(
      `UPDATE notes SET
         title = COALESCE($1, title),
         body = COALESCE($2, body),
         alert_type = CASE WHEN $3::boolean THEN $4 ELSE alert_type END
       WHERE id = $5 AND patient_id = $6
       RETURNING id, kind, title, body, status, alert_type, reply_count, like_count, created_at, resolved_at`,
      [title ?? null, body ?? null, alert_type !== undefined, alert_type ?? null, noteId, req.patientId]
    );

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'note.updated',$3)`,
      [req.user.id, req.patientId, { note_id: noteId }]
    );

    const enriched = await one(
      `SELECT n.id, n.kind, n.title, n.body, n.status, n.alert_type, n.reply_count, n.like_count, n.created_at,
              n.resolved_at, n.resolved_by, n.author_id, rd.full_name AS resolved_by_name,
              d.full_name AS author_name, dep.name AS department_name, dep.icon_key
       FROM notes n
       JOIN doctors d ON d.id = n.author_id
       JOIN departments dep ON dep.id = n.department_id
       LEFT JOIN doctors rd ON rd.id = n.resolved_by
       WHERE n.id = $1`,
      [note.id]
    );

    res.json({ note: enriched });
  } catch (err) {
    next(err);
  }
});

// Delete a note. Only the author (or an admin) may delete — resolution
// status doesn't lock it. A snapshot is written to the audit trail first
// since the row itself is gone after this.
router.delete('/:patientId/notes/:noteId', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const noteId = Number(req.params.noteId);
    if (!Number.isFinite(noteId)) return res.status(400).json({ error: 'bad_note_id' });

    const existing = await one(
      `SELECT id, author_id, title, body, alert_type FROM notes WHERE id = $1 AND patient_id = $2`,
      [noteId, req.patientId]
    );
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && existing.author_id !== req.user.id) {
      return res.status(403).json({ error: 'not_owner', message: 'You can only delete your own entries.' });
    }

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'note.deleted',$3)`,
      [req.user.id, req.patientId, { note_id: noteId, title: existing.title, body: existing.body, alert_type: existing.alert_type }]
    );
    await query(`DELETE FROM notes WHERE id = $1 AND patient_id = $2`, [noteId, req.patientId]);

    res.json({ id: noteId });
  } catch (err) {
    next(err);
  }
});

export default router;
