import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requirePatientAccess } from '../middleware.js';
import { askAboutPatient, askAboutCases, summarizeDocument } from '../ai-client.js';

const router = Router();

// Q&A grounded across every active case the doctor's department is
// collaborating on — same patient set as GET /patients, so this always
// answers from what the doctor can actually see in Active Cases.
router.post('/cases/ask', requireAuth, async (req, res, next) => {
  try {
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ error: 'missing_question' });

    const patients = req.user.role === 'admin'
      ? await query(
          `SELECT id, external_id, full_name, age, gender, status, risk_level, diagnoses
           FROM patients ORDER BY id`
        )
      : await query(
          `SELECT DISTINCT p.id, p.external_id, p.full_name, p.age, p.gender, p.status, p.risk_level, p.diagnoses
           FROM patients p
           JOIN patient_departments pd ON pd.patient_id = p.id
           WHERE pd.department_id = $1 ORDER BY p.id`,
          [req.user.department_id]
        );

    const cases = await Promise.all(
      patients.map(async (patient) => {
        const [allergies, medications, notes] = await Promise.all([
          query(
            `SELECT a.substance, a.reaction, a.severity
             FROM allergies a WHERE a.patient_id = $1`,
            [patient.id]
          ),
          query(
            `SELECT o.medication, o.dosage, dep.name AS department_name
             FROM orders o JOIN departments dep ON dep.id = o.department_id
             WHERE o.patient_id = $1 AND o.status = 'active'`,
            [patient.id]
          ),
          query(
            `SELECT n.id, n.title, n.body, n.status, n.created_at,
                    d.full_name AS author_name, dep.name AS department_name
             FROM notes n JOIN doctors d ON d.id = n.author_id
             JOIN departments dep ON dep.id = n.department_id
             WHERE n.patient_id = $1 ORDER BY n.created_at DESC LIMIT 8`,
            [patient.id]
          ),
        ]);
        return { patient, allergies, medications, notes: notes.reverse() };
      })
    );

    const answer = await askAboutCases({ question, cases });

    await query(
      `INSERT INTO audit_log (actor_id, action, details) VALUES ($1,'ai.ask_cases',$2)`,
      [req.user.id, { question, case_count: cases.length }]
    );

    res.json(answer); // { answer, citations, degraded }
  } catch (err) {
    next(err);
  }
});

// Q&A grounded in a single patient's record. The backend loads the record
// server-side rather than trusting the client — that way the LLM can never
// receive data the doctor isn't allowed to see.
router.post('/patients/:patientId/ask', requireAuth, requirePatientAccess, async (req, res, next) => {
  try {
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ error: 'missing_question' });

    const [patient, allergies, medications, notes] = await Promise.all([
      one(
        `SELECT id, external_id, full_name, age, gender, blood_group, admitted_on,
                risk_level, diagnoses, vitals, labs FROM patients WHERE id = $1`,
        [req.patientId]
      ),
      query(
        `SELECT a.substance, a.reaction, a.severity, a.recorded_at,
                d.full_name AS recorded_by_name, dep.name AS recorded_by_department
         FROM allergies a JOIN doctors d ON d.id = a.recorded_by
         LEFT JOIN departments dep ON dep.id = d.department_id
         WHERE a.patient_id = $1`,
        [req.patientId]
      ),
      query(
        `SELECT o.medication, o.dosage, o.status, o.created_at,
                d.full_name AS prescribed_by_name, dep.name AS department_name
         FROM orders o JOIN doctors d ON d.id = o.prescribed_by
         JOIN departments dep ON dep.id = o.department_id
         WHERE o.patient_id = $1 AND o.status = 'active'`,
        [req.patientId]
      ),
      query(
        `SELECT n.id, n.kind, n.title, n.body, n.status, n.created_at,
                d.full_name AS author_name, dep.name AS department_name
         FROM notes n JOIN doctors d ON d.id = n.author_id
         JOIN departments dep ON dep.id = n.department_id
         WHERE n.patient_id = $1 ORDER BY n.created_at ASC`,
        [req.patientId]
      ),
    ]);

    const answer = await askAboutPatient({
      question,
      patientRecord: { patient, allergies, medications, notes },
    });

    await query(
      `INSERT INTO audit_log (actor_id, patient_id, action, details) VALUES ($1,$2,'ai.ask',$3)`,
      [req.user.id, req.patientId, { question }]
    );

    res.json(answer); // { answer, citations }
  } catch (err) {
    next(err);
  }
});

router.post('/summarize-document', requireAuth, async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'missing_text' });
    const result = await summarizeDocument({ text });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
