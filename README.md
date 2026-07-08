# Dr's Slack — Judge Demo

**Live demo:** https://drs-slack-v1.up.railway.app

Multi-department clinical collaboration platform. This demo proves the
centerpiece scenario from the brief — **a cross-department conflict is
caught before it's finalized** — across **two** independent safety checks:

- **Prescriptions** — a new drug order is checked against the patient's
  allergies and active medications.
- **Treatments** — a new treatment plan is checked against the patient's
  allergies, diagnoses, *and* other departments' active treatment plans.

Both checks are deterministic (rule-based,  LLM) and run synchronously
before the record is saved, so the alert appears while the doctor is still
composing the order/treatment — not after.

Synthetic data only.

## Demo accounts

Password for every doctor account is `password123` (admin is `admin123`) —
also shown directly on the login page.

| Login                          | Password    | Department  |
|---------------------------------|-------------|-------------|
| sarah.smith@drslack.demo       | password123 | Cardiology  |
| james.wilson@drslack.demo      | password123 | Nephrology  |
| emily.davis@drslack.demo       | password123 | Dermatology |
| michael.brown@drslack.demo     | password123 | Radiology   |
| anna.lee@drslack.demo          | password123 | Neurology   |
| admin@drslack.demo             | admin123    | (admin)     |

All demo accounts share one patient, **Rishikesh**, whose care team spans
all five departments above.

## Try it: prescription conflict

The seed already records Rishikesh's **Penicillin allergy** under Dr.
Abhigneya (Nephrology).

1. Log in as **Dr. Prerna** (`sarah.smith@drslack.demo`, Cardiology).
2. Open Rishikesh's patient page.
3. Click **New Order** and prescribe **Amoxicillin 500mg**.
4. The AI service flags the conflict **before** the order is saved —
   Amoxicillin is a Penicillin-family beta-lactam.
5. You're offered alternatives (Azithromycin, Doxycycline) or can override
   with a documented reason. Both paths are written to the audit log.

Rule table: `ai-service/src/drug-rules.js`. Check logic: `ai-service/src/check-order.js`.

## Try it: treatment conflict

The seed already has an active **CKD Stage 3 Management** treatment under
Dr. Abhigneya (Nephrology) and an active **ACE Inhibitor Titration**
treatment under Dr. Prerna (Cardiology) — both on Rishikesh.

1. Log in as any doctor on Rishikesh's care team.
2. Open Rishikesh's patient page and click **New Treatment**.
3. Enter a treatment name containing an NSAID (e.g. **"NSAID therapy for
   pain management"**).
4. The AI service flags it **before** the treatment is saved: NSAIDs are
   nephrotoxic (conflicts with the active CKD management from Nephrology)
   and blunt ACE inhibitor efficacy (conflicts with the active regimen from
   Cardiology).
5. As with orders, you can pick a documented override reason instead — it's
   recorded on the treatment record for audit.

Rule table: `ai-service/src/treatment-rules.js`. Check logic:
`ai-service/src/check-treatment-conflict.js`.

Also worth trying: the **AI Copilot** panel on the patient page, and posting
a discussion note across departments.

## Architecture

Four layers, each with one job:

- **`/frontend`** — React + Vite + Tailwind. Talks only to the backend.
- **`/backend`** — Node/Express + Postgres. Trust boundary: auth, patient
  records, orders, treatments, audit log. Every write goes through here.
- **`/ai-service`** — Separate Node/Express service. Only place that talks
  to the LLM.
  - `POST /check-order` — deterministic drug/allergy + interaction rules.
  - `POST /check-treatment-conflict` — deterministic treatment vs.
    allergy/diagnosis/cross-department-treatment rules.
  - `POST /ask` — LLM Q&A grounded in the patient record, with citations.
  - `POST /summarize-document` — LLM summarization.
  - Both conflict checks are deliberately rule-based, not LLM calls, so
    they're testable and never hallucinate.
- **Postgres** — everything relational (patients, allergies, orders,
  treatments, notes, audit log).

## Quick start

### Requirements
- Node.js 20+
- Docker (for Postgres)
- Optional: `OPENROUTER_API_KEY` (only needed for `/ask` and `/summarize`;
  both conflict-check flows work without it). Free key from
  [openrouter.ai/keys](https://openrouter.ai/keys) — no billing required,
  uses `:free`-tagged models.

### 1. Start Postgres
```bash
docker compose up -d
```

### 2. Install & seed the backend
```bash
cd backend
npm install
npm run db:setup   # creates schema + seeds demo data
npm run dev        # http://localhost:4000
```

### 3. Start the AI service
```bash
cd ai-service
npm install
cp .env.example .env    # optionally add OPENROUTER_API_KEY
npm run dev             # http://localhost:4100
```

### 4. Start the frontend
```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

Open http://localhost:5173.

## Folder structure

```
dr's_slack.v1/
├── docker-compose.yml         # Postgres only
├── README.md
├── backend/                   # Express + Postgres, port 4000
│   ├── schema.sql
│   ├── migrations/             # treatments + treatment-conflict columns
│   ├── seed.js
│   └── src/
│       ├── index.js           # app entry
│       ├── db.js              # pg pool
│       ├── auth.js            # JWT + bcrypt helpers
│       ├── middleware.js      # requireAuth, requirePatientAccess
│       ├── ai-client.js       # calls to ai-service
│       └── routes/
│           ├── auth.js        # login
│           ├── patients.js    # list, get, allergies, meds, care team
│           ├── orders.js      # place order (with conflict check)
│           ├── notes.js       # discussion timeline
│           ├── emergencies.js # emergency alerts
│           ├── ai.js          # /ask, /summarize proxies
│           └── audit.js       # admin-only
├── ai-service/                # Express, port 4100
│   └── src/
│       ├── index.js
│       ├── drug-rules.js               # drug → ingredient families, interactions
│       ├── check-order.js              # deterministic prescription conflict check
│       ├── treatment-rules.js          # treatment family keywords + interactions
│       ├── check-treatment-conflict.js # deterministic treatment conflict check
│       ├── ask.js                      # LLM Q&A with citations
│       └── summarize.js                # LLM summarization
└── frontend/                  # React + Vite + Tailwind, port 5173
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx            # router
        ├── lib/
        │   ├── api.js         # fetch wrapper
        │   └── auth.jsx       # AuthContext
        ├── components/
        │   ├── Layout.jsx           # sidebar + topbar shell (used everywhere)
        │   ├── Sidebar.jsx
        │   ├── TopBar.jsx
        │   ├── OrderEntryModal.jsx  # prescription centerpiece
        │   └── TreatmentModal.jsx   # treatment centerpiece
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── ActiveCases.jsx
            └── PatientDetail.jsx
```

## Design notes

- **Rule-based conflict checks.** Both prescription and treatment conflict
  detection are safety-critical; an LLM would introduce hallucination risk
  with no upside. The rule tables (`drug-rules.js`, `treatment-rules.js`)
  are small on purpose: adding a new drug, family, or interaction is a code
  change reviewable in a PR, not a prompt tweak.
- **Cross-department read, single-author write.** Every doctor whose
  department is on a patient's care team can read the full record; only the
  authoring doctor can edit their own note/order/treatment. Enforced in
  `middleware.js`.
- **Audit everything meaningful.** Order/treatment placement, AI alert
  (fired or clean), override with reason — all land in `audit_log`. The
  admin account can list them.
- **Not for production.** Passwords are bcrypt-hashed but there's no SSO,
  2FA, password reset, TLS termination, or rate limiting. Synthetic data
  only.
