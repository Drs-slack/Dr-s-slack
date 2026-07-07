// Minimal hand-rolled validation. Deliberately not pulling in a schema
// library (zod/joi/etc.) for three small endpoints — these checks are
// simple enough to read at a glance, which matters for a safety-critical
// service.

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function isArrayOrUndefined(v) {
  return v === undefined || v === null || Array.isArray(v);
}

export function validateCheckOrderBody(body) {
  const { medication, dosage, allergies, currentMedications } = body || {};
  if (!isNonEmptyString(medication)) {
    throw new ValidationError('medication is required and must be a non-empty string');
  }
  if (dosage !== undefined && dosage !== null && typeof dosage !== 'string') {
    throw new ValidationError('dosage must be a string if provided');
  }
  if (!isArrayOrUndefined(allergies)) {
    throw new ValidationError('allergies must be an array if provided');
  }
  if (!isArrayOrUndefined(currentMedications)) {
    throw new ValidationError('currentMedications must be an array if provided');
  }
  // Each allergy needs at least a substance to be checkable.
  for (const a of allergies || []) {
    if (!a || !isNonEmptyString(a.substance)) {
      throw new ValidationError('each allergy entry requires a non-empty substance field');
    }
  }
  for (const m of currentMedications || []) {
    if (!m || !isNonEmptyString(m.medication)) {
      throw new ValidationError('each currentMedications entry requires a non-empty medication field');
    }
  }
  return {
    medication,
    dosage: dosage || '',
    allergies: allergies || [],
    currentMedications: currentMedications || [],
  };
}

export function validateAskBody(body) {
  const { question, patientRecord } = body || {};
  if (!isNonEmptyString(question)) {
    throw new ValidationError('question is required and must be a non-empty string');
  }
  if (!patientRecord || typeof patientRecord !== 'object') {
    throw new ValidationError('patientRecord is required and must be an object');
  }
  const { patient, allergies, medications, notes } = patientRecord;
  if (!patient || typeof patient !== 'object') {
    throw new ValidationError('patientRecord.patient is required and must be an object');
  }
  if (!isArrayOrUndefined(allergies) || !isArrayOrUndefined(medications) || !isArrayOrUndefined(notes)) {
    throw new ValidationError('patientRecord.allergies/medications/notes must be arrays if provided');
  }
  return {
    question,
    patientRecord: {
      patient,
      allergies: allergies || [],
      medications: medications || [],
      notes: notes || [],
    },
  };
}

export function validateAskCasesBody(body) {
  const { question, cases } = body || {};
  if (!isNonEmptyString(question)) {
    throw new ValidationError('question is required and must be a non-empty string');
  }
  if (!Array.isArray(cases)) {
    throw new ValidationError('cases is required and must be an array');
  }
  for (const c of cases) {
    if (!c || typeof c !== 'object' || !c.patient || typeof c.patient !== 'object') {
      throw new ValidationError('each case entry requires a patient object');
    }
    if (!isArrayOrUndefined(c.allergies) || !isArrayOrUndefined(c.medications) || !isArrayOrUndefined(c.notes)) {
      throw new ValidationError('each case allergies/medications/notes must be arrays if provided');
    }
  }
  return {
    question,
    cases: cases.map((c) => ({
      patient: c.patient,
      allergies: c.allergies || [],
      medications: c.medications || [],
      notes: c.notes || [],
    })),
  };
}

export function validateCheckTreatmentConflictBody(body) {
  const { treatmentName, existingTreatments, allergies, diagnoses } = body || {};
  if (!isNonEmptyString(treatmentName)) {
    throw new ValidationError('treatmentName is required and must be a non-empty string');
  }
  if (!isArrayOrUndefined(existingTreatments)) {
    throw new ValidationError('existingTreatments must be an array if provided');
  }
  if (!isArrayOrUndefined(allergies)) {
    throw new ValidationError('allergies must be an array if provided');
  }
  if (!isArrayOrUndefined(diagnoses)) {
    throw new ValidationError('diagnoses must be an array if provided');
  }
  for (const t of existingTreatments || []) {
    if (!t || !isNonEmptyString(t.treatment_name)) {
      throw new ValidationError('each existingTreatments entry requires a non-empty treatment_name field');
    }
  }
  for (const a of allergies || []) {
    if (!a || !isNonEmptyString(a.substance)) {
      throw new ValidationError('each allergy entry requires a non-empty substance field');
    }
  }
  return {
    treatmentName,
    existingTreatments: existingTreatments || [],
    allergies: allergies || [],
    diagnoses: diagnoses || [],
  };
}

export function validateSummarizeBody(body) {
  const { text } = body || {};
  if (!isNonEmptyString(text)) {
    throw new ValidationError('text is required and must be a non-empty string');
  }
  if (text.length > 50_000) {
    throw new ValidationError('text exceeds the 50,000 character limit for a single summarization request');
  }
  return { text };
}
