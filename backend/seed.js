// Seed the demo dataset. Sets up the centerpiece scenario:
// Dr. Abhigneya (Nephrology) has already recorded Rishikesh's Penicillin allergy.
// Dr. Prerna (Cardiology) is the one who tries to prescribe Amoxicillin.
import 'dotenv/config';
import pg from 'pg';
import { hashPassword } from './src/auth.js';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function q(text, params) {
  const r = await client.query(text, params);
  return r.rows;
}

console.log('Seeding…');

// --- Departments ---
const depSpec = [
  ['Cardiology',    'favorite'],
  ['Nephrology',    'nephrology'],
  ['Dermatology',   'water_drop'],
  ['Radiology',     'radiology'],
  ['Neurology',     'psychology'],
];
const departments = {};
for (const [name, icon] of depSpec) {
  const [row] = await q(
    `INSERT INTO departments (name, icon_key) VALUES ($1,$2) RETURNING id, name`,
    [name, icon]
  );
  departments[name] = row.id;
}

// --- Doctors ---
const pw = await hashPassword('password123');
const adminPw = await hashPassword('admin123');

async function makeDoctor(email, full_name, dep, avatar) {
  const [row] = await q(
    `INSERT INTO doctors (email, password_hash, full_name, department_id, avatar_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, pw, full_name, dep ? departments[dep] : null, avatar]
  );
  return row.id;
}

const AVATAR = 'https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg';

const smith  = await makeDoctor('sarah.smith@drslack.demo',  'Dr. Prerna',     'Cardiology',  AVATAR);
const wilson = await makeDoctor('james.wilson@drslack.demo', 'Dr. Abhigneya',  'Nephrology',  AVATAR);
const davis  = await makeDoctor('emily.davis@drslack.demo',  'Dr. Vivek',      'Dermatology', AVATAR);
const brown  = await makeDoctor('michael.brown@drslack.demo','Dr. Pratheek',   'Radiology',   AVATAR);
const lee    = await makeDoctor('anna.lee@drslack.demo',     'Dr. Anna Lee',   'Neurology',   AVATAR);

const [admin] = await q(
  `INSERT INTO doctors (email, password_hash, full_name, department_id, role)
   VALUES ('admin@drslack.demo', $1, 'Admin', NULL, 'admin') RETURNING id`,
  [adminPw]
);

// --- Patients ---
const diagnoses = [
  { code: 'I50.9', label: 'Heart Failure' },
  { code: 'N18.3', label: 'CKD Stage 3' },
  { code: 'E11',   label: 'Type 2 Diabetes' },
  { code: 'I10',   label: 'Hypertension' },
];
const vitals = { bp: '138/86 mmHg', hr: '78 bpm', rr: '18 /min', spo2: '96 %', temp: '98.6 °F', measured_ago: '2h ago' };
const labs = [
  { name: 'Creatinine', value: '2.1', unit: 'mg/dL', trend: 'up',   flag: 'high' },
  { name: 'eGFR',       value: '38',  unit: 'mL/min', trend: 'down', flag: 'high' },
  { name: 'Potassium',  value: '5.2', unit: 'mmol/L', trend: 'up',   flag: 'medium' },
  { name: 'HbA1c',      value: '8.1', unit: '%',      trend: 'up',   flag: 'medium' },
];

const [john] = await q(
  `INSERT INTO patients (external_id, full_name, age, gender, blood_group, admitted_on,
                         risk_level, avatar_url, diagnoses, vitals, labs)
   VALUES ('PT-2024-00158', 'Rishikesh', 16, 'Male', 'A+', '2024-03-12', 'medium', $1, $2, $3, $4)
   RETURNING id`,
  [AVATAR, JSON.stringify(diagnoses), JSON.stringify(vitals), JSON.stringify(labs)]
);

// A second patient so the Active Cases screen isn't lonely
const [maria] = await q(
  `INSERT INTO patients (external_id, full_name, age, gender, blood_group, admitted_on,
                         risk_level, avatar_url, diagnoses, vitals, labs)
   VALUES ('PT-2024-00084', 'Maria Rodriguez', 42, 'Female', 'O+', '2024-03-11', 'high', $1, $2, '{}', '[]')
   RETURNING id`,
  [AVATAR, JSON.stringify([{ code: 'K35.80', label: 'Acute appendicitis' }])]
);

// Assign care teams — Rishikesh is the multi-department case
const johnCareTeam = ['Cardiology', 'Nephrology', 'Dermatology', 'Radiology', 'Neurology'];
for (const dep of johnCareTeam) {
  await q(
    `INSERT INTO patient_departments (patient_id, department_id) VALUES ($1,$2)`,
    [john.id, departments[dep]]
  );
}
await q(
  `INSERT INTO patient_departments (patient_id, department_id) VALUES ($1,$2)`,
  [maria.id, departments['Cardiology']]
);

// --- The allergy Dr. Abhigneya recorded (this is the whole point) ---
await q(
  `INSERT INTO allergies (patient_id, substance, reaction, severity, recorded_by, recorded_at)
   VALUES ($1, 'Penicillin', 'Anaphylaxis, hives', 'critical', $2, NOW() - INTERVAL '2 days')`,
  [john.id, wilson]
);

// --- Existing meds on Rishikesh ---
async function seedOrder(patientId, doctorId, dep, med, dose) {
  await q(
    `INSERT INTO orders (patient_id, medication, dosage, prescribed_by, department_id,
                         ai_check_result, created_at)
     VALUES ($1,$2,$3,$4,$5,'{"severity":"none","conflicts":[],"alternatives":[]}', NOW() - INTERVAL '1 day')`,
    [patientId, med, dose, doctorId, departments[dep]]
  );
}
await seedOrder(john.id, smith,  'Cardiology',   'Lisinopril',   '10mg OD');
await seedOrder(john.id, smith,  'Cardiology',   'Furosemide',   '40mg OD');
await seedOrder(john.id, davis,  'Dermatology',  'Metformin',    '500mg BD');
await seedOrder(john.id, smith,  'Cardiology',   'Atorvastatin', '20mg OD');

// --- Discussion timeline (matches the reference design) ---
async function seedNote(patientId, doctorId, dep, kind, title, body, status, hoursAgo) {
  await q(
    `INSERT INTO notes (patient_id, author_id, department_id, kind, title, body, status,
                        reply_count, like_count, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW() - ($10 || ' hours')::interval)`,
    [patientId, doctorId, departments[dep], kind, title, body, status, 0, 0, hoursAgo]
  );
}
await seedNote(john.id, smith,  'Cardiology',    'recommendation',
  'Cardiology Recommendation', 'Recommend increasing ACE inhibitor dosage to 20 mg OD for better BP control and reduced cardiac workload.',
  'Pending Review', 5);
await seedNote(john.id, wilson, 'Nephrology',    'concern',
  'Nephrology Concern', 'Creatinine increased from 1.6 to 2.1 in last 48h. High risk of worsening renal function with increased ACE inhibitor.',
  'Concern', 4);
await seedNote(john.id, davis,  'Dermatology', 'update',
  'Dermatology Update', 'Blood glucose levels remain elevated. Adjusted insulin regimen. Monitor for hypoglycemia.',
  'Update', 3);
await seedNote(john.id, brown,  'Radiology',   'note',
  'Radiology Note', 'Patient reports improved breathing. Continue current diuretic therapy.',
  'Note', 2);
await seedNote(john.id, lee,    'Neurology',     'note',
  'Neurology Input', 'No new neurological deficits. Monitor for any signs of uremic encephalopathy.',
  'Note', 1);

// Update reply/like counts to match the reference
await q(`UPDATE notes SET reply_count=3, like_count=2 WHERE title='Cardiology Recommendation'`);
await q(`UPDATE notes SET reply_count=5, like_count=4 WHERE title='Nephrology Concern'`);
await q(`UPDATE notes SET reply_count=1, like_count=1 WHERE title='Dermatology Update'`);

// --- Treatment timeline ---
async function seedTreatment(patientId, doctorId, dep, name, status, notesText, daysAgo) {
  await q(
    `INSERT INTO treatments (patient_id, department_id, treatment_name, assigned_doctor_id,
                             start_date, status, notes, created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4, (NOW() - ($5 || ' days')::interval)::date, $6, $7, $4,
             NOW() - ($5 || ' days')::interval, NOW() - ($5 || ' days')::interval)`,
    [patientId, departments[dep], name, doctorId, daysAgo, status, notesText]
  );
}
await seedTreatment(john.id, smith,  'Cardiology',  'ACE Inhibitor Titration',        'ongoing',   'Titrating Lisinopril upward while monitoring renal function closely.', 6);
await seedTreatment(john.id, smith,  'Cardiology',  'Diuretic Therapy',               'ongoing',   'Furosemide for fluid overload management.', 5);
await seedTreatment(john.id, wilson, 'Nephrology',  'CKD Stage 3 Management',         'ongoing',   'Renal diet counseling and close creatinine monitoring given rising trend.', 5);
await seedTreatment(john.id, wilson, 'Nephrology',  'Potassium Correction',           'completed', 'Short course of potassium binder; levels normalized.', 3);
await seedTreatment(john.id, davis,  'Dermatology', 'Insulin Regimen Adjustment',     'ongoing',   'Adjusted insulin dosing schedule to address elevated glucose readings.', 4);
await seedTreatment(john.id, brown,  'Radiology',   'Chest Imaging Follow-up',        'completed', 'Follow-up chest X-ray to confirm improved pulmonary congestion.', 2);
await seedTreatment(john.id, lee,    'Neurology',   'Neurological Monitoring',        'ongoing',   'Routine checks for uremic encephalopathy given declining renal function.', 2);
await seedTreatment(john.id, smith,  'Cardiology',  'Cardiac Rehabilitation Plan',    'paused',    'Paused pending stabilization of blood pressure and renal markers.', 1);

console.log('Seeded successfully.');
console.log('');
console.log('Demo accounts (password: password123, admin: admin123):');
console.log('  sarah.smith@drslack.demo     — Dr. Prerna, Cardiology');
console.log('  james.wilson@drslack.demo    — Dr. Abhigneya, Nephrology');
console.log('  emily.davis@drslack.demo     — Dr. Vivek, Dermatology');
console.log('  michael.brown@drslack.demo   — Dr. Pratheek, Radiology');
console.log('  anna.lee@drslack.demo        — Dr. Anna Lee, Neurology');
console.log('  admin@drslack.demo           — Admin');

await client.end();
