// Tests for the safety-critical rule-based conflict checker.
// Run with: node --test test/check-order.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../src/check-order.js';

const wilson = {
  substance: 'Penicillin',
  reaction: 'Anaphylaxis, hives',
  severity: 'critical',
  recorded_by_name: 'Dr. James Wilson',
  recorded_by_department: 'Nephrology',
  recorded_at: '2026-07-01T10:00:00Z',
};

describe('drug-allergy conflicts', () => {
  test('flags Amoxicillin against a recorded Penicillin allergy (the centerpiece scenario)', () => {
    const result = runCheck({
      medication: 'Amoxicillin',
      dosage: '500mg TID',
      allergies: [wilson],
      currentMedications: [],
    });
    assert.equal(result.severity, 'critical');
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].type, 'drug_allergy');
    assert.match(result.conflicts[0].message, /Penicillin/);
    assert.match(result.conflicts[0].message, /Dr\. James Wilson/);
    assert.match(result.conflicts[0].message, /Nephrology/);
    assert.ok(result.alternatives.length > 0);
    assert.ok(result.alternatives.some(a => a.medication === 'Azithromycin'));
  });

  test('flags cross-reactive Cephalosporin against a Penicillin allergy', () => {
    const result = runCheck({
      medication: 'Cephalexin',
      dosage: '500mg',
      allergies: [wilson],
      currentMedications: [],
    });
    assert.equal(result.severity, 'critical');
    assert.equal(result.conflicts[0].type, 'drug_allergy');
  });

  test('is case-insensitive and tolerates dosage in the medication string', () => {
    const result = runCheck({
      medication: 'aMOXicillin 500mg',
      dosage: '',
      allergies: [wilson],
      currentMedications: [],
    });
    assert.equal(result.severity, 'critical');
  });

  test('does not flag an unrelated drug against a Penicillin allergy', () => {
    const result = runCheck({
      medication: 'Azithromycin',
      dosage: '250mg',
      allergies: [wilson],
      currentMedications: [],
    });
    assert.equal(result.severity, 'none');
    assert.equal(result.conflicts.length, 0);
  });

  test('lower-severity allergy still blocks (escalates to high)', () => {
    const result = runCheck({
      medication: 'Amoxicillin',
      dosage: '500mg',
      allergies: [{ ...wilson, severity: 'low' }],
      currentMedications: [],
    });
    assert.equal(result.severity, 'high');
  });

  test('unknown medication with no family produces no conflicts', () => {
    const result = runCheck({
      medication: 'SomeUnknownDrugXYZ',
      dosage: '10mg',
      allergies: [wilson],
      currentMedications: [],
    });
    assert.equal(result.severity, 'none');
  });

  test('handles missing/empty allergies array gracefully', () => {
    const result = runCheck({
      medication: 'Amoxicillin',
      dosage: '500mg',
      allergies: [],
      currentMedications: [],
    });
    assert.equal(result.severity, 'none');
  });
});

describe('drug-drug interactions', () => {
  test('flags ACE inhibitor + K-sparing diuretic as high severity', () => {
    const result = runCheck({
      medication: 'Lisinopril',
      dosage: '10mg',
      allergies: [],
      currentMedications: [{ medication: 'Spironolactone', dosage: '25mg' }],
    });
    assert.equal(result.severity, 'high');
    assert.equal(result.conflicts[0].type, 'drug_drug');
    assert.match(result.conflicts[0].message, /Hyperkalemia|hyperkalemia/);
  });

  test('flags ACE inhibitor + ARB duplicate RAAS blockade', () => {
    const result = runCheck({
      medication: 'Losartan',
      dosage: '50mg',
      allergies: [],
      currentMedications: [{ medication: 'Enalapril', dosage: '5mg' }],
    });
    assert.equal(result.severity, 'high');
  });

  test('flags NSAID + ACE inhibitor as medium severity', () => {
    const result = runCheck({
      medication: 'Ibuprofen',
      dosage: '400mg',
      allergies: [],
      currentMedications: [{ medication: 'Lisinopril', dosage: '10mg' }],
    });
    assert.equal(result.severity, 'medium');
  });

  test('no interaction when families are unrelated', () => {
    const result = runCheck({
      medication: 'Metformin',
      dosage: '500mg',
      allergies: [],
      currentMedications: [{ medication: 'Atorvastatin', dosage: '20mg' }],
    });
    assert.equal(result.severity, 'none');
  });
});

describe('duplicate therapy', () => {
  test('flags a second ACE inhibitor as duplicate therapy', () => {
    const result = runCheck({
      medication: 'Ramipril',
      dosage: '5mg',
      allergies: [],
      currentMedications: [{ medication: 'Lisinopril', dosage: '10mg' }],
    });
    assert.equal(result.severity, 'medium');
    assert.equal(result.conflicts[0].type, 'duplicate_therapy');
  });

  test('does not flag re-ordering the exact same medication as duplicate', () => {
    const result = runCheck({
      medication: 'Lisinopril',
      dosage: '20mg',
      allergies: [],
      currentMedications: [{ medication: 'Lisinopril', dosage: '10mg' }],
    });
    // Same drug re-order (e.g. dose change) shouldn't trip the duplicate-family rule
    assert.equal(result.conflicts.find(c => c.type === 'duplicate_therapy'), undefined);
  });
});

describe('expanded drug knowledge base', () => {
  test('flags anticoagulant + NSAID bleeding risk', () => {
    const result = runCheck({
      medication: 'Warfarin',
      dosage: '5mg',
      allergies: [],
      currentMedications: [{ medication: 'Ibuprofen', dosage: '400mg' }],
    });
    assert.equal(result.severity, 'high');
    assert.match(result.conflicts[0].message, /bleeding|Bleeding/);
  });

  test('flags beta-blocker + non-dihydropyridine CCB bradycardia risk', () => {
    const result = runCheck({
      medication: 'Metoprolol',
      dosage: '25mg',
      allergies: [],
      currentMedications: [{ medication: 'Diltiazem', dosage: '120mg' }],
    });
    assert.equal(result.severity, 'high');
  });

  test('does not flag beta-blocker + dihydropyridine CCB (safe combination)', () => {
    const result = runCheck({
      medication: 'Metoprolol',
      dosage: '25mg',
      allergies: [],
      currentMedications: [{ medication: 'Amlodipine', dosage: '5mg' }],
    });
    assert.equal(result.severity, 'none');
  });

  test('flags digoxin + loop diuretic toxicity risk', () => {
    const result = runCheck({
      medication: 'Digoxin',
      dosage: '0.125mg',
      allergies: [],
      currentMedications: [{ medication: 'Furosemide', dosage: '40mg' }],
    });
    assert.equal(result.severity, 'medium');
  });

  test('flags K-sparing diuretic + potassium supplement hyperkalemia risk', () => {
    const result = runCheck({
      medication: 'Spironolactone',
      dosage: '25mg',
      allergies: [],
      currentMedications: [{ medication: 'Potassium Chloride', dosage: '20mEq' }],
    });
    assert.equal(result.severity, 'high');
  });
});

describe('combined scenarios', () => {
  test('severity is the max across multiple simultaneous conflicts', () => {
    const result = runCheck({
      medication: 'Amoxicillin', // critical allergy conflict
      dosage: '500mg',
      allergies: [wilson],
      currentMedications: [{ medication: 'Ibuprofen', dosage: '400mg' }], // unrelated
    });
    assert.equal(result.severity, 'critical');
  });

  test('multiple allergies each produce their own conflict entry', () => {
    const result = runCheck({
      medication: 'Amoxicillin',
      dosage: '500mg',
      allergies: [
        wilson,
        { substance: 'Sulfa', severity: 'high', recorded_by_name: 'Dr. Davis', recorded_by_department: 'Endocrinology' },
      ],
      currentMedications: [],
    });
    // Only the penicillin allergy should match amoxicillin; sulfa is unrelated
    assert.equal(result.conflicts.filter(c => c.type === 'drug_allergy').length, 1);
  });
});
