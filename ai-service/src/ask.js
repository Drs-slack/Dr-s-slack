// LLM-backed Q&A grounded in a single patient's record.
// Requires OPENROUTER_API_KEY. If missing, returns a helpful stub explaining
// that Q&A is disabled — the safety-critical /check-order still works.

import { callOpenRouter, OpenRouterCallError } from './openrouter-client.js';

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';

function buildContext(patientRecord) {
  const { patient, allergies, medications, notes } = patientRecord;
  const lines = [];
  lines.push('# Patient');
  lines.push(`Name: ${patient.full_name}`);
  lines.push(`Age/Sex: ${patient.age} / ${patient.gender}`);
  lines.push(`Blood group: ${patient.blood_group || 'unknown'}`);
  lines.push(`ID: ${patient.external_id}`);
  lines.push(`Admitted on: ${patient.admitted_on}`);

  lines.push('\n# Diagnoses');
  const dxs = patient.diagnoses || [];
  if (dxs.length === 0) lines.push('(none recorded)');
  else for (const d of dxs) lines.push(`- ${d.label} (${d.code})`);

  lines.push('\n# Allergies');
  if (allergies.length === 0) lines.push('(none recorded)');
  else
    for (const a of allergies)
      lines.push(
        `- ${a.substance} — reaction: ${a.reaction || 'unspecified'}, severity: ${a.severity}, ` +
        `recorded by ${a.recorded_by_name} (${a.recorded_by_department}) on ${a.recorded_at}`
      );

  lines.push('\n# Active medications');
  if (medications.length === 0) lines.push('(none)');
  else
    for (const m of medications)
      lines.push(`- ${m.medication} ${m.dosage} — ${m.prescribed_by_name} (${m.department_name})`);

  lines.push('\n# Case discussion (chronological)');
  for (const n of notes)
    lines.push(
      `[note #${n.id}] ${n.created_at} — ${n.department_name} / ${n.author_name}: ` +
      `**${n.title}** — ${n.body} (status: ${n.status})`
    );

  return lines.join('\n');
}

function buildCasesContext(cases) {
  const lines = [];
  for (const c of cases) {
    const { patient, allergies, medications, notes } = c;
    lines.push(`\n## Case: ${patient.full_name} (ID: ${patient.external_id})`);
    lines.push(`Age/Sex: ${patient.age} / ${patient.gender} — Risk: ${patient.risk_level || 'unknown'} — Status: ${patient.status || 'unknown'}`);

    const dxs = patient.diagnoses || [];
    lines.push(`Diagnoses: ${dxs.length ? dxs.map((d) => `${d.label} (${d.code})`).join(', ') : '(none recorded)'}`);

    lines.push(
      `Allergies: ${allergies.length
        ? allergies.map((a) => `${a.substance} (${a.severity})`).join(', ')
        : '(none recorded)'}`
    );

    lines.push(
      `Active medications: ${medications.length
        ? medications.map((m) => `${m.medication} ${m.dosage} — ${m.department_name}`).join(', ')
        : '(none)'}`
    );

    if (notes.length) {
      lines.push('Recent discussion:');
      for (const n of notes)
        lines.push(
          `  [note #${n.id}, patient ${patient.external_id}] ${n.created_at} — ${n.department_name} / ${n.author_name}: ` +
          `**${n.title}** — ${n.body} (status: ${n.status})`
        );
    }
  }
  return lines.join('\n');
}

export async function askAboutCases({ question, cases }) {
  if (!API_KEY) {
    return {
      answer:
        "AI Q&A is not configured on this deployment. Set OPENROUTER_API_KEY in " +
        "ai-service/.env to enable it.",
      citations: [],
      degraded: true,
    };
  }

  if (cases.length === 0) {
    return {
      answer: "You don't have any active cases assigned right now.",
      citations: [],
      degraded: false,
    };
  }

  const context = buildCasesContext(cases);
  const system =
    "You are a clinical assistant helping a doctor keep track of every active case " +
    "they are currently working on, across patients. Answer only from the case " +
    "records provided. When you reference a note, cite it as [note #ID, patient EXTERNAL_ID]. " +
    "If asked about a specific patient, focus on that case; if asked broadly, summarize across " +
    "cases. If the records do not contain the answer, say so briefly. Do not offer treatment " +
    "recommendations — you are a summarizer, not a prescriber.";

  let data;
  try {
    data = await callOpenRouter({
      apiKey: API_KEY,
      model: MODEL,
      maxTokens: 900,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content:
            `Here are the doctor's active cases:\n${context}\n\n---\n\nQuestion: ${question}`,
        },
      ],
    });
  } catch (err) {
    if (err instanceof OpenRouterCallError) {
      return {
        answer: err.retryable
          ? 'The AI assistant is temporarily unavailable. Please try again in a moment.'
          : 'The AI assistant could not process this request.',
        citations: [],
        degraded: true,
      };
    }
    throw err;
  }
  const answer = data.choices?.[0]?.message?.content || '';

  const citations = [];
  const re = /\[note #(\d+)/g;
  let m;
  while ((m = re.exec(answer)) !== null) {
    const id = Number(m[1]);
    if (!citations.find((c) => c.note_id === id)) citations.push({ note_id: id });
  }

  return { answer, citations, degraded: false };
}

export async function ask({ question, patientRecord }) {
  if (!API_KEY) {
    return {
      answer:
        "AI Q&A is not configured on this deployment. Set OPENROUTER_API_KEY in " +
        "ai-service/.env to enable it. The drug-allergy conflict check works " +
        "without it.",
      citations: [],
      degraded: true,
    };
  }

  const context = buildContext(patientRecord);
  const system =
    "You are a clinical assistant helping doctors interpret a specific patient's " +
    "record. Answer only from the record provided. When you reference a note, cite " +
    "it as [note #ID]. If the record does not contain the answer, say so briefly. " +
    "Do not offer treatment recommendations — you are a summarizer, not a prescriber.";

  let data;
  try {
    data = await callOpenRouter({
      apiKey: API_KEY,
      model: MODEL,
      maxTokens: 800,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content:
            `Here is the patient's full record:\n\n${context}\n\n---\n\nQuestion: ${question}`,
        },
      ],
    });
  } catch (err) {
    // Surface a clinician-friendly degraded response rather than a 500 —
    // a doctor mid-shift shouldn't see a stack trace for a Q&A sidebar.
    if (err instanceof OpenRouterCallError) {
      return {
        answer: err.retryable
          ? 'The AI assistant is temporarily unavailable. Please try again in a moment.'
          : 'The AI assistant could not process this request.',
        citations: [],
        degraded: true,
      };
    }
    throw err;
  }
  const answer = data.choices?.[0]?.message?.content || '';

  // Parse note citations for the frontend to hyperlink
  const citations = [];
  const re = /\[note #(\d+)\]/g;
  let m;
  while ((m = re.exec(answer)) !== null) {
    const id = Number(m[1]);
    if (!citations.find(c => c.note_id === id)) citations.push({ note_id: id });
  }

  return { answer, citations, degraded: false };
}
