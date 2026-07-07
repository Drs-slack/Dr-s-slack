// Deterministic drug knowledge base.
//
// This is deliberately a small, curated table — not a scraped drugs.com dump —
// so every rule is reviewable in a code review. Add entries as new demo
// scenarios need them.
//
// Each entry maps a medication (or a family) to allergen families it belongs
// to (for allergy cross-checking) and to the mechanism family it's a member of
// (for duplicate-therapy checks). Interactions live in a separate table.

// Allergen family membership. Keys are lowercased.
export const DRUG_ALLERGEN_FAMILIES = {
  // Penicillins & beta-lactams
  'penicillin':      ['penicillin', 'beta-lactam'],
  'amoxicillin':     ['penicillin', 'beta-lactam'],
  'ampicillin':      ['penicillin', 'beta-lactam'],
  'augmentin':       ['penicillin', 'beta-lactam'],
  'piperacillin':    ['penicillin', 'beta-lactam'],
  'flucloxacillin':  ['penicillin', 'beta-lactam'],
  // Cephalosporins cross-react with penicillin allergy (well-known)
  'cephalexin':      ['cephalosporin', 'beta-lactam', 'penicillin-cross'],
  'ceftriaxone':     ['cephalosporin', 'beta-lactam', 'penicillin-cross'],
  'cefuroxime':      ['cephalosporin', 'beta-lactam', 'penicillin-cross'],
  // Sulfa
  'sulfamethoxazole':['sulfa'],
  'trimethoprim-sulfamethoxazole': ['sulfa'],
  'bactrim':         ['sulfa'],
  // NSAIDs
  'ibuprofen':       ['nsaid'],
  'naproxen':        ['nsaid'],
  'aspirin':         ['nsaid', 'salicylate'],
  // Statins
  'atorvastatin':    ['statin'],
  'simvastatin':     ['statin'],
  'rosuvastatin':    ['statin'],
  // ACE inhibitors
  'lisinopril':      ['ace-inhibitor'],
  'enalapril':       ['ace-inhibitor'],
  'ramipril':        ['ace-inhibitor'],
  // ARBs
  'losartan':        ['arb'],
  'valsartan':       ['arb'],
  // K-sparing diuretics
  'spironolactone':  ['k-sparing-diuretic'],
  'eplerenone':      ['k-sparing-diuretic'],
  'amiloride':       ['k-sparing-diuretic'],
  // Loop diuretics
  'furosemide':      ['loop-diuretic'],
  'bumetanide':      ['loop-diuretic'],
  // Metformin
  'metformin':       ['biguanide'],
  // Macrolides — common non-penicillin alternatives for infections
  'azithromycin':    ['macrolide'],
  'clarithromycin':  ['macrolide'],
  'erythromycin':    ['macrolide'],
  // Tetracyclines
  'doxycycline':     ['tetracycline'],
  'tetracycline':    ['tetracycline'],
  // Beta-blockers
  'metoprolol':      ['beta-blocker'],
  'atenolol':        ['beta-blocker'],
  'carvedilol':      ['beta-blocker'],
  'bisoprolol':      ['beta-blocker'],
  // Calcium channel blockers — non-dihydropyridine (rate-limiting)
  'diltiazem':       ['ccb-non-dhp'],
  'verapamil':       ['ccb-non-dhp'],
  // Calcium channel blockers — dihydropyridine (vasodilating, no rate effect)
  'amlodipine':      ['ccb-dhp'],
  'nifedipine':      ['ccb-dhp'],
  // Anticoagulants
  'warfarin':        ['anticoagulant'],
  'apixaban':        ['anticoagulant'],
  'rivaroxaban':     ['anticoagulant'],
  // Antiplatelets
  'clopidogrel':     ['antiplatelet'],
  'aspirin-antiplatelet': ['antiplatelet'], // distinct low-dose use; aspirin itself stays under nsaid/salicylate above
  // Sulfonylureas — hypoglycemia risk
  'glipizide':       ['sulfonylurea'],
  'glyburide':       ['sulfonylurea'],
  'glimepiride':     ['sulfonylurea'],
  // Insulin
  'insulin':         ['insulin'],
  // Cardiac glycoside
  'digoxin':         ['cardiac-glycoside'],
  // Potassium supplements — normalizeMedName only keeps the first word of the
  // medication string, so "Potassium Chloride" normalizes to "potassium".
  'potassium':       ['potassium-supplement'],
  'kcl':             ['potassium-supplement'],
  // Opioids
  'oxycodone':       ['opioid'],
  'morphine':        ['opioid'],
  'tramadol':        ['opioid'],
  // Proton pump inhibitors
  'omeprazole':      ['ppi'],
  'pantoprazole':    ['ppi'],
};

// Simple substance-name aliases for allergies people record.
export const ALLERGEN_ALIASES = {
  'penicillin':  ['penicillin', 'beta-lactam', 'penicillin-cross'],
  'penicillins': ['penicillin', 'beta-lactam', 'penicillin-cross'],
  'amoxicillin': ['penicillin', 'beta-lactam', 'penicillin-cross'],
  'beta-lactam': ['beta-lactam', 'penicillin', 'penicillin-cross'],
  'sulfa':       ['sulfa'],
  'sulfa drugs': ['sulfa'],
  'sulfonamides':['sulfa'],
  'nsaid':       ['nsaid'],
  'nsaids':      ['nsaid'],
  'aspirin':     ['nsaid', 'salicylate'],
};

// Known dangerous pairings. Directional: A + B is a risk of X.
// Keep symmetric pairs (both orderings) so lookups are simple.
export const INTERACTIONS = [
  {
    a: 'ace-inhibitor',
    b: 'k-sparing-diuretic',
    severity: 'high',
    risk: 'Hyperkalemia — both agents raise serum potassium.',
  },
  {
    a: 'ace-inhibitor',
    b: 'arb',
    severity: 'high',
    risk: 'Duplicate RAAS blockade — increased risk of hypotension, hyperkalemia, and renal impairment.',
  },
  {
    a: 'nsaid',
    b: 'ace-inhibitor',
    severity: 'medium',
    risk: 'NSAIDs blunt ACE inhibitor efficacy and worsen renal function in CKD.',
  },
  {
    a: 'nsaid',
    b: 'loop-diuretic',
    severity: 'medium',
    risk: 'NSAIDs reduce loop diuretic efficacy and increase renal risk.',
  },
  {
    a: 'anticoagulant',
    b: 'nsaid',
    severity: 'high',
    risk: 'Significantly increased bleeding risk when anticoagulants are combined with NSAIDs.',
  },
  {
    a: 'anticoagulant',
    b: 'antiplatelet',
    severity: 'high',
    risk: 'Combined anticoagulant + antiplatelet therapy substantially raises bleeding risk.',
  },
  {
    a: 'beta-blocker',
    b: 'ccb-non-dhp',
    severity: 'high',
    risk: 'Additive negative chronotropic/dromotropic effect — risk of bradycardia or heart block.',
  },
  {
    a: 'cardiac-glycoside',
    b: 'loop-diuretic',
    severity: 'medium',
    risk: 'Loop-diuretic-induced hypokalemia increases the risk of digoxin toxicity.',
  },
  {
    a: 'sulfonylurea',
    b: 'insulin',
    severity: 'medium',
    risk: 'Combined use raises hypoglycemia risk — monitor blood glucose closely.',
  },
  {
    a: 'k-sparing-diuretic',
    b: 'potassium-supplement',
    severity: 'high',
    risk: 'Additive hyperkalemia risk when potassium-sparing diuretics are combined with potassium supplementation.',
  },
];

// Alternative medications to suggest when a drug is contraindicated.
// Keyed by the *family that's blocked* (e.g. patient is penicillin-allergic
// and doctor prescribed something in the penicillin family).
export const ALTERNATIVES_BY_BLOCKED_FAMILY = {
  'penicillin': [
    { medication: 'Azithromycin',  note: 'Macrolide — common alternative for respiratory infections.' },
    { medication: 'Doxycycline',   note: 'Tetracycline — broad coverage, avoid in pregnancy/children under 8.' },
    { medication: 'Clindamycin',   note: 'Lincosamide — good for skin/soft tissue infections.' },
  ],
  'sulfa': [
    { medication: 'Doxycycline',   note: 'Alternative for many indications where sulfa was chosen.' },
    { medication: 'Nitrofurantoin',note: 'Alternative for uncomplicated UTI.' },
  ],
  'nsaid': [
    { medication: 'Acetaminophen', note: 'For pain/fever without NSAID risks.' },
  ],
};

/** Normalize a free-text medication name to a lookup key. */
export function normalizeMedName(name) {
  if (!name) return '';
  return name.trim().toLowerCase().split(/\s+/)[0]; // "Amoxicillin 500mg" -> "amoxicillin"
}

/** Families a drug belongs to for allergy matching. */
export function familiesOf(medication) {
  return DRUG_ALLERGEN_FAMILIES[normalizeMedName(medication)] || [];
}

/** Families this allergen entry blocks. */
export function familiesBlockedByAllergen(substance) {
  const key = (substance || '').trim().toLowerCase();
  return ALLERGEN_ALIASES[key] || [key]; // fallback: assume the substance itself is the family
}
