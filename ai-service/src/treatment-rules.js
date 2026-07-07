// Deterministic cross-department treatment conflict knowledge base.
//
// Same philosophy as drug-rules.js: a small, curated, code-reviewable table —
// not a scraped interaction database. Family detection here is keyword-based
// because `treatment_name` is a free-text label a doctor typed (e.g.
// "High-dose NSAID therapy", "Heart Failure management therapy"), not a
// structured drug code like `orders.medication`.

// Keywords (lowercased, substring match) that imply a treatment belongs to a
// given clinical family.
export const TREATMENT_FAMILY_KEYWORDS = {
  'nsaid':                ['nsaid', 'ibuprofen', 'naproxen', 'diclofenac', 'ketorolac'],
  'anticoagulant':        ['anticoagulant', 'warfarin', 'heparin', 'apixaban', 'rivaroxaban', 'blood thinner'],
  'antiplatelet':         ['antiplatelet', 'clopidogrel', 'dual antiplatelet'],
  'ace-inhibitor':        ['ace inhibitor', 'ace-inhibitor', 'lisinopril', 'enalapril', 'ramipril'],
  'arb':                  ['angiotensin receptor blocker', 'arb therapy', 'losartan', 'valsartan'],
  'k-sparing-diuretic':   ['potassium-sparing diuretic', 'potassium sparing diuretic', 'spironolactone', 'eplerenone'],
  'loop-diuretic':        ['loop diuretic', 'furosemide', 'lasix'],
  'nephrotoxic':          ['nephrotoxic', 'contrast dye', 'aminoglycoside', 'gentamicin', 'vancomycin'],
  'corticosteroid':       ['corticosteroid', 'steroid therapy', 'prednisone', 'dexamethasone'],
  'immunosuppressant':    ['immunosuppress', 'chemotherapy', 'biologic therapy'],
  'beta-blocker':         ['beta blocker', 'beta-blocker', 'metoprolol', 'atenolol', 'carvedilol'],
  'heart-failure-therapy':['heart failure', 'chf management', 'cardiac failure'],
  'ckd-management':       ['ckd', 'chronic kidney', 'renal management', 'dialysis'],
  'opioid':               ['opioid', 'morphine', 'oxycodone', 'fentanyl'],
};

// Known dangerous pairings between treatment families. Directional entries
// are checked both ways by the caller, so list each pair once.
export const TREATMENT_INTERACTIONS = [
  { a: 'nsaid', b: 'heart-failure-therapy', severity: 'critical',
    risk: 'NSAIDs promote sodium and fluid retention and can precipitate acute decompensation in heart failure.' },
  { a: 'nsaid', b: 'ckd-management', severity: 'high',
    risk: 'NSAIDs are nephrotoxic and can accelerate decline in renal function.' },
  { a: 'nsaid', b: 'ace-inhibitor', severity: 'medium',
    risk: 'NSAIDs blunt ACE inhibitor efficacy and increase renal risk when combined.' },
  { a: 'nsaid', b: 'anticoagulant', severity: 'high',
    risk: 'Combining NSAIDs with anticoagulation substantially increases bleeding risk.' },
  { a: 'anticoagulant', b: 'antiplatelet', severity: 'high',
    risk: 'Combined anticoagulant and antiplatelet therapy substantially raises bleeding risk.' },
  { a: 'ace-inhibitor', b: 'k-sparing-diuretic', severity: 'high',
    risk: 'Both agents raise serum potassium — risk of dangerous hyperkalemia.' },
  { a: 'ace-inhibitor', b: 'arb', severity: 'high',
    risk: 'Duplicate RAAS blockade increases hypotension, hyperkalemia, and renal impairment risk.' },
  { a: 'nephrotoxic', b: 'ckd-management', severity: 'critical',
    risk: 'Nephrotoxic agents can cause acute-on-chronic kidney injury in a CKD patient.' },
  { a: 'corticosteroid', b: 'immunosuppressant', severity: 'medium',
    risk: 'Combined immunosuppression significantly raises infection risk.' },
  { a: 'beta-blocker', b: 'heart-failure-therapy', severity: 'low',
    risk: 'Beta-blockade needs careful titration alongside heart failure management — verify dosing is coordinated.' },
];

// Diagnoses that imply an at-risk "condition family" — checked the same way
// as an existing treatment, so a conflict can be flagged even before any
// other department has placed a competing treatment.
export const DIAGNOSIS_CONDITION_FAMILIES = [
  { match: ['heart failure', 'i50'], family: 'heart-failure-therapy' },
  { match: ['chronic kidney', 'ckd', 'n18'], family: 'ckd-management' },
];

const SEVERITY_ORDER = ['none', 'low', 'medium', 'high', 'critical'];
export const maxSeverity = (...items) =>
  items.reduce((max, s) => (SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(max) ? s : max), 'none');

/** Families implied by a free-text treatment name via keyword match. */
export function familiesOfTreatment(name) {
  const text = (name || '').toLowerCase();
  const families = [];
  for (const [family, keywords] of Object.entries(TREATMENT_FAMILY_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) families.push(family);
  }
  return families;
}

/** Condition families implied by a patient's recorded diagnoses. */
export function familiesOfDiagnoses(diagnoses = []) {
  const hits = [];
  for (const d of diagnoses) {
    const text = `${d.label || ''} ${d.code || ''}`.toLowerCase();
    for (const entry of DIAGNOSIS_CONDITION_FAMILIES) {
      if (entry.match.some((m) => text.includes(m))) {
        hits.push({ family: entry.family, diagnosis: d });
      }
    }
  }
  return hits;
}

/** Look up the interaction rule (if any) between two families, either order. */
export function findInteraction(familyA, familyB) {
  return TREATMENT_INTERACTIONS.find(
    (i) => (i.a === familyA && i.b === familyB) || (i.b === familyA && i.a === familyB)
  );
}
