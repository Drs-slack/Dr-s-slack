# Dr's Slack — MVP

Multi-department clinical collaboration platform. This MVP proves the centerpiece
scenario from the brief: **a cross-department drug-allergy conflict is caught
before the prescription is finalized.**

## Architecture

Four layers, each with one job:

- **`/frontend`** — React + Vite + Tailwind. Talks only to the backend.
- **`/backend`** — Node/Express + Postgres. Trust boundary: auth, patient records,
  orders, audit log. Every write goes through here.
- **`/ai-service`** — Separate Node/Express service. Only place that talks to the LLM.
  - `POST /check-order` — **deterministic** drug/allergy + interaction rules (no LLM).
    Deliberately rule-based so conflict checks are testable and never hallucinate.
  - `POST /ask` — LLM Q&A grounded in the patient record, with citations.
  - `POST /summarize-document` — LLM summarization.
- **Postgres** — everything relational (patients, allergies, orders, notes, audit log).

## Quick start

### Requirements
- Node.js 20+
- Docker (for Postgres)
- Optional: `OPENROUTER_API_KEY` (only needed for `/ask` and `/summarize`; the
  centerpiece conflict-check flow works without it). Free key from
  [openrouter.ai/keys](https://openrouter.ai/keys) — no billing required, uses
  `:free`-tagged models.

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

## Demo the centerpiece flow

Two seeded doctor accounts across two departments who share one patient (Rishikesh):

| Login                          | Password    | Department  |
|--------------------------------|-------------|-------------|
| james.wilson@drslack.demo      | password123 | Nephrology  |
| sarah.smith@drslack.demo       | password123 | Cardiology  |
| emily.davis@drslack.demo       | password123 | Dermatology |
| admin@drslack.demo             | admin123    | (admin)     |

The seed already records Rishikesh's **Penicillin allergy** under Dr. Abhigneya (Nephrology).

1. Log in as **Dr. Prerna** (Cardiology).
2. Open Rishikesh's patient page.
3. Click **New Order** and prescribe **Amoxicillin 500mg**.
4. The AI service flags the conflict **before** the order is saved:
   > "Amoxicillin contains a Penicillin-family beta-lactam. Patient has a
   > documented Penicillin allergy recorded by Dr. Abhigneya (Nephrology)
   > on <date>."
5. You're offered alternatives (Azithromycin, Doxycycline) or can override with
   a documented reason. Both paths are written to the audit log.

## Folder structure

```
drs-slack-mvp/
├── docker-compose.yml         # Postgres only
├── README.md
├── backend/                   # Express + Postgres, port 4000
│   ├── schema.sql
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
│           ├── ai.js          # /ask, /summarize proxies
│           └── audit.js       # admin-only
├── ai-service/                # Express, port 4100
│   └── src/
│       ├── index.js
│       ├── drug-rules.js      # drug → ingredient families, interactions
│       ├── check-order.js     # deterministic conflict check
│       ├── ask.js             # LLM Q&A with citations
│       └── summarize.js       # LLM summarization
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
        │   ├── Layout.jsx     # sidebar + topbar shell (used everywhere)
        │   ├── Sidebar.jsx
        │   ├── TopBar.jsx
        │   └── OrderEntryModal.jsx  # the centerpiece
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── ActiveCases.jsx
            └── PatientDetail.jsx
```

## Design notes

- **Rule-based conflict check.** Drug-allergy detection is a safety-critical
  feature; an LLM would introduce hallucination risk with no upside. The rule
  table (`ai-service/src/drug-rules.js`) is small on purpose: adding a new drug
  or family is a code change reviewable in a PR, not a prompt tweak.
- **Cross-department read, single-author write.** Every doctor whose department
  is on a patient's care team can read the full record; only the authoring
  doctor can edit their own note/order. Enforced in `middleware.js`.
- **Audit everything meaningful.** Order placement, AI alert (fired or clean),
  override with reason — all land in `audit_log`. The admin account can list them.
- **Not for production.** Passwords are bcrypt-hashed but there's no SSO, 2FA,
  password reset, TLS termination, or rate limiting. Synthetic data only.
