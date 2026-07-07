// Deterministic cross-department treatment conflict checker.
// Same rationale as check-order.js: rule-based, no LLM, sub-ms latency,
// every rule reviewable in code.
//
// Returns:
//   { severity: 'none'|'low'|'medium'|'high'|'critical',
//     conflicts: [{ type, severity, message, source }, ...] }

import {
  familiesOfTreatment,
  familiesOfDiagnoses,
  findInteraction,
  maxSeverity,
} from './treatment-rules.js';
import { familiesBlockedByAllergen } from './drug-rules.js';

export function runTreatmentCheck({ treatmentName, existingTreatments = [], allergies = [], diagnoses = [] }) {
  const conflicts = [];
  const proposedFamilies = familiesOfTreatment(treatmentName);

  // --- 1. Allergy conflicts ---
  for (const a of allergies) {
    const blocked = familiesBlockedByAllergen(a.substance);
    const hit = blocked.find((f) => proposedFamilies.includes(f));
    if (!hit) continue;

    const base = (a.severity || 'high').toLowerCase();
    const severity = base === 'critical' || base === 'high' ? 'critical' : 'high';

    conflicts.push({
      type: 'allergy',
      severity,
      message:
        `${treatmentName} involves a ${hit}-family agent. Patient has a documented ` +
        `${a.substance} allergy (${a.severity}).`,
      source: {
        kind: 'allergy',
        substance: a.substance,
        recorded_by: a.recorded_by_name || null,
        recorded_by_department: a.recorded_by_department || null,
        reaction: a.reaction || null,
      },
    });
  }

  // --- 2. Diagnosis contraindications ---
  for (const { family: condFamily, diagnosis } of familiesOfDiagnoses(diagnoses)) {
    for (const f of proposedFamilies) {
      const inter = findInteraction(f, condFamily);
      if (!inter) continue;
      conflicts.push({
        type: 'diagnosis_contraindication',
        severity: inter.severity,
        message:
          `${treatmentName} may worsen ${diagnosis.label}` +
          `${diagnosis.code ? ` (${diagnosis.code})` : ''}: ${inter.risk}`,
        source: { kind: 'diagnosis', label: diagnosis.label, code: diagnosis.code || null },
      });
    }
  }

  // --- 3. Conflicts with other active cross-department treatments ---
  for (const t of existingTreatments) {
    const otherFamilies = familiesOfTreatment(t.treatment_name);
    for (const f of proposedFamilies) {
      const otherHit = otherFamilies.find((of_) => findInteraction(f, of_));
      if (!otherHit) continue;
      const inter = findInteraction(f, otherHit);
      conflicts.push({
        type: 'treatment_interaction',
        severity: inter.severity,
        message:
          `${treatmentName} may conflict with "${t.treatment_name}" prescribed by ` +
          `${t.assigned_doctor_name} (${t.department_name}): ${inter.risk}`,
        source: {
          kind: 'treatment',
          treatment_id: t.id,
          treatment_name: t.treatment_name,
          doctor_name: t.assigned_doctor_name,
          department_name: t.department_name,
        },
      });
    }
  }

  const severity = maxSeverity(...conflicts.map((c) => c.severity));
  return { severity, conflicts };
}
