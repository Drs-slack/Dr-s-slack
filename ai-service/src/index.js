import 'dotenv/config';
import express from 'express';
import { runCheck } from './check-order.js';
import { runTreatmentCheck } from './check-treatment-conflict.js';
import { ask, askAboutCases } from './ask.js';
import { summarize } from './summarize.js';
import {
  ValidationError,
  validateCheckOrderBody,
  validateCheckTreatmentConflictBody,
  validateAskBody,
  validateAskCasesBody,
  validateSummarizeBody,
} from './validation.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    service: 'ai-service',
    llm_configured: Boolean(process.env.OPENROUTER_API_KEY),
  })
);

app.post('/check-order', (req, res, next) => {
  try {
    const input = validateCheckOrderBody(req.body);
    const result = runCheck(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/check-treatment-conflict', (req, res, next) => {
  try {
    const input = validateCheckTreatmentConflictBody(req.body);
    const result = runTreatmentCheck(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/ask', async (req, res, next) => {
  try {
    const input = validateAskBody(req.body);
    const result = await ask(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/ask-cases', async (req, res, next) => {
  try {
    const input = validateAskCasesBody(req.body);
    const result = await askAboutCases(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/summarize-document', async (req, res, next) => {
  try {
    const input = validateSummarizeBody(req.body);
    const result = await summarize(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Error handler — validation errors get a clean 400 with the specific
// reason; anything unexpected gets a 500 and is logged for follow-up.
app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    return res.status(err.status).json({ error: 'validation_error', message: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'ai_service_error', message: err.message });
});

const port = process.env.PORT || 4100;
app.listen(port, () => {
  console.log(`AI service listening on http://localhost:${port}`);
  console.log(
    `LLM: ${process.env.OPENROUTER_API_KEY ? 'configured' : 'not configured — /ask and /summarize will return degraded stubs'}`
  );
});
