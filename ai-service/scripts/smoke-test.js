#!/usr/bin/env node
// Smoke-tests a *running* ai-service instance over HTTP.
//
// Usage:
//   cd ai-service && npm install && npm run dev   (in one terminal)
//   npm run smoke-test                            (in another terminal)
//
// This is intentionally separate from the `npm test` unit suite: it
// exercises the real HTTP layer (Express routing, JSON parsing, the
// validation middleware) end-to-end, and tells you plainly whether the
// LLM endpoints are live or running in degraded mode.

const BASE = process.env.AI_SERVICE_URL || 'http://localhost:4100';

let passed = 0;
let failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response, leave data null
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`Smoke-testing ai-service at ${BASE}\n`);

  // --- Health check ---
  console.log('health check');
  let health;
  try {
    const res = await fetch(`${BASE}/health`);
    health = await res.json();
    ok('server responds', res.status === 200);
    ok('reports service name', health.service === 'ai-service');
  } catch (err) {
    console.error(`\nCould not reach ${BASE} — is ai-service running? (npm run dev)`);
    console.error(err.message);
    process.exit(1);
  }
  console.log(
    `  ℹ LLM configured: ${health.llm_configured ? 'yes' : 'no (ask/summarize will run degraded)'}\n`
  );

  // --- /check-order: the centerpiece scenario ---
  console.log('check-order — centerpiece: Amoxicillin vs. recorded Penicillin allergy');
  {
    const { status, data } = await post('/check-order', {
      medication: 'Amoxicillin',
      dosage: '500mg TID',
      allergies: [
        {
          substance: 'Penicillin',
          reaction: 'Anaphylaxis, hives',
          severity: 'critical',
          recorded_by_name: 'Dr. James Wilson',
          recorded_by_department: 'Nephrology',
          recorded_at: '2026-07-01T10:00:00Z',
        },
      ],
      currentMedications: [],
    });
    ok('returns 200', status === 200, `got ${status}`);
    ok('severity is critical', data?.severity === 'critical', `got ${data?.severity}`);
    ok('flags a drug_allergy conflict', data?.conflicts?.some(c => c.type === 'drug_allergy'));
    ok('cites Dr. Wilson / Nephrology in the message', /Wilson/.test(data?.conflicts?.[0]?.message || ''));
    ok('offers alternatives', (data?.alternatives?.length || 0) > 0);
  }
  console.log();

  console.log('check-order — clean order, no conflicts');
  {
    const { status, data } = await post('/check-order', {
      medication: 'Azithromycin',
      dosage: '250mg',
      allergies: [{ substance: 'Penicillin', severity: 'critical' }],
      currentMedications: [],
    });
    ok('returns 200', status === 200);
    ok('severity is none', data?.severity === 'none', `got ${data?.severity}`);
  }
  console.log();

  console.log('check-order — validation rejects malformed input');
  {
    const { status, data } = await post('/check-order', { medication: '' });
    ok('returns 400', status === 400, `got ${status}`);
    ok('error is validation_error', data?.error === 'validation_error');
  }
  {
    const { status } = await post('/check-order', { medication: 'Amoxicillin', allergies: 'not-an-array' });
    ok('rejects non-array allergies with 400', status === 400, `got ${status}`);
  }
  console.log();

  // --- /ask ---
  console.log('ask — grounded Q&A (or degraded stub if no API key)');
  {
    const { status, data } = await post('/ask', {
      question: 'What allergies does this patient have?',
      patientRecord: {
        patient: { full_name: 'John Doe', age: 65, gender: 'Male', external_id: 'PT-2024-00158', admitted_on: '2024-03-12' },
        allergies: [{ substance: 'Penicillin', severity: 'critical', recorded_by_name: 'Dr. Wilson', recorded_by_department: 'Nephrology' }],
        medications: [],
        notes: [],
      },
    });
    ok('returns 200', status === 200, `got ${status}`);
    ok('response has an answer field', typeof data?.answer === 'string');
    if (data?.degraded) {
      console.log('  ℹ running in degraded mode (no OPENROUTER_API_KEY set) — this is expected without a key');
    } else {
      console.log('  ℹ LLM responded live');
    }
  }
  console.log();

  console.log('ask — validation rejects malformed input');
  {
    const { status } = await post('/ask', { question: 'hi' }); // missing patientRecord
    ok('returns 400 for missing patientRecord', status === 400, `got ${status}`);
  }
  console.log();

  // --- /summarize-document ---
  console.log('summarize-document — (or degraded stub if no API key)');
  {
    const { status, data } = await post('/summarize-document', {
      text: 'Chest X-ray: mild cardiomegaly, no acute infiltrate. Recommend follow-up in 6 weeks.',
    });
    ok('returns 200', status === 200, `got ${status}`);
    ok('response has a summary field', typeof data?.summary === 'string');
  }
  console.log();

  console.log('summarize-document — validation rejects empty text');
  {
    const { status } = await post('/summarize-document', { text: '' });
    ok('returns 400', status === 400, `got ${status}`);
  }
  console.log();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
