import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRouter from './routes/auth.js';
import patientsRouter from './routes/patients.js';
import ordersRouter from './routes/orders.js';
import notesRouter from './routes/notes.js';
import aiRouter from './routes/ai.js';
import auditRouter from './routes/audit.js';
import emergenciesRouter from './routes/emergencies.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'backend' }));

app.use('/api/auth', authRouter);
app.use('/api/patients', patientsRouter);   // list + get
app.use('/api/patients', ordersRouter);     // /:patientId/orders*
app.use('/api/patients', notesRouter);      // /:patientId/notes
app.use('/api/ai', aiRouter);
app.use('/api/audit', auditRouter);
app.use('/api/emergencies', emergenciesRouter);

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error', message: err.message });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
