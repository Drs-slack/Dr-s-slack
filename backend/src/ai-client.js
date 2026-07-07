// Thin wrapper around the AI service HTTP API.
// The backend is the only thing that talks to ai-service; the frontend never does.

const BASE = process.env.AI_SERVICE_URL || 'http://localhost:4100';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-service ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

export function checkOrder({ medication, dosage, allergies, currentMedications }) {
  return post('/check-order', { medication, dosage, allergies, currentMedications });
}

export function checkTreatmentConflict({ treatmentName, existingTreatments, allergies, diagnoses }) {
  return post('/check-treatment-conflict', { treatmentName, existingTreatments, allergies, diagnoses });
}

export function askAboutPatient({ question, patientRecord }) {
  return post('/ask', { question, patientRecord });
}

export function askAboutCases({ question, cases }) {
  return post('/ask-cases', { question, cases });
}

export function summarizeDocument({ text }) {
  return post('/summarize-document', { text });
}
