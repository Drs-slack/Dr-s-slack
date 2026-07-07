// Deterministic order-conflict checker.
// Rule-based on purpose: safety-critical, no LLM in the loop, no hallucination risk,
// sub-ms latency, every rule reviewable in code.
//
// Returns:
//   { severity: 'none'|'low'|'medium'|'high'|'critical',
//     conflicts: [{ type, severity, message, source }, ...],
//     alternatives: [{ medication, note }, ...] }

import {
  familiesOf,
  familiesBlockedByAllergen,
  INTERACTIONS,
  ALTERNATIVES_BY_BLOCKED_FAMILY,
  normalizeMedName,
} from './drug-rules.js';

const SEVERITY_ORDER = ['none', 'low', 'medium', 'high', 'critical'];
const maxSeverity = (...items) =>
  items.reduce((max, s) => (SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(max) ? s : max), 'none');

export function runCheck({ medication, dosage, allergies = [], currentMedications = [] }) {
  const conflicts = [];
  const alternatives = [];
  const seenAlt = new Set();

  const proposedFamilies = familiesOf(medication);

  // --- 1. Drug-allergy conflicts ---
  for (const a of allergies) {
    const blocked = familiesBlockedByAllergen(a.substance);
    const hit = blocked.find(f => proposedFamilies.includes(f));
    if (!hit) continue;

    // Escalate severity: patient severity + cross-department signals bump it up.
    const base = (a.severity || 'high').toLowerCase();
    const severity =
      base === 'critical' ? 'critical' :
      base === 'high'     ? 'critical' : // any high-severity allergy conflict blocks
                            'high';

    const source = {
      kind: 'allergy',
      recorded_by: a.recorded_by_name || 'Unknown clinician',
      recorded_by_department: a.recorded_by_department || null,
      recorded_at: a.recorded_at || null,
      original_severity: a.severity,
      reaction: a.reaction || null,
    };

    conflicts.push({
      type: 'drug_allergy',
      severity,
      message:
        `${medication} contains a ${hit}-family compound. Patient has a documented ` +
        `${a.substance} allergy (${a.severity})` +
        (source.recorded_by_department ? ` recorded by ${source.recorded_by} (${source.recorded_by_department})` : '') +
        `.`,
      source,
    });

    // Collect alternatives keyed on the family we blocked
    const alts = ALTERNATIVES_BY_BLOCKED_FAMILY[hit] || [];
    for (const alt of alts) {
      if (!seenAlt.has(alt.medication)) {
        seenAlt.add(alt.medication);
        alternatives.push(alt);
      }
    }
  }

  // --- 2. Drug-drug interactions ---
  const activeFamilies = new Set();
  for (const m of currentMedications) {
    for (const f of familiesOf(m.medication)) activeFamilies.add(f);
  }
  for (const f of proposedFamilies) {
    for (const inter of INTERACTIONS) {
      const match =
        (inter.a === f && activeFamilies.has(inter.b)) ||
        (inter.b === f && activeFamilies.has(inter.a));
      if (!match) continue;

      // Find which active med triggered it (for citation)
      const otherFam = inter.a === f ? inter.b : inter.a;
      const triggeringMed = currentMedications.find(m =>
        familiesOf(m.medication).includes(otherFam)
      );

      conflicts.push({
        type: 'drug_drug',
        severity: inter.severity,
        message:
          `${medication} + ${triggeringMed?.medication || otherFam}: ${inter.risk}`,
        source: {
          kind: 'active_medication',
          medication: triggeringMed?.medication || null,
          dosage: triggeringMed?.dosage || null,
          prescribed_by_name: triggeringMed?.prescribed_by_name || null,
          prescribed_by_department: triggeringMed?.prescribed_by_department || null,
        },
      });
    }
  }

  // --- 3. Duplicate therapy (same family already on board) ---
  const activeFamilyList = Array.from(activeFamilies);
  for (const f of proposedFamilies) {
    if (activeFamilyList.includes(f) && f !== 'beta-lactam' /* too generic */) {
      const dup = currentMedications.find(m => familiesOf(m.medication).includes(f));
      if (dup && normalizeMedName(dup.medication) !== normalizeMedName(medication)) {
        conflicts.push({
          type: 'duplicate_therapy',
          severity: 'medium',
          message:
            `Duplicate ${f} therapy — patient is already on ${dup.medication} ${dup.dosage || ''}`.trim() + '.',
          source: {
            kind: 'active_medication',
            medication: dup.medication,
            dosage: dup.dosage,
            prescribed_by_name: dup.prescribed_by_name || null,
            prescribed_by_department: dup.prescribed_by_department || null,
          },
        });
      }
    }
  }

  const severity = maxSeverity(...conflicts.map(c => c.severity));

  return { severity, conflicts, alternatives };
}
