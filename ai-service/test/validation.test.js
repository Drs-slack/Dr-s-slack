import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  validateCheckOrderBody,
  validateAskBody,
  validateSummarizeBody,
} from '../src/validation.js';

describe('validateCheckOrderBody', () => {
  test('accepts a minimal valid body and fills in defaults', () => {
    const result = validateCheckOrderBody({ medication: 'Amoxicillin' });
    assert.equal(result.medication, 'Amoxicillin');
    assert.equal(result.dosage, '');
    assert.deepEqual(result.allergies, []);
    assert.deepEqual(result.currentMedications, []);
  });

  test('rejects missing medication', () => {
    assert.throws(() => validateCheckOrderBody({}), ValidationError);
  });

  test('rejects empty-string medication', () => {
    assert.throws(() => validateCheckOrderBody({ medication: '   ' }), ValidationError);
  });

  test('rejects non-array allergies', () => {
    assert.throws(
      () => validateCheckOrderBody({ medication: 'Amoxicillin', allergies: 'penicillin' }),
      ValidationError
    );
  });

  test('rejects non-array currentMedications', () => {
    assert.throws(
      () => validateCheckOrderBody({ medication: 'Amoxicillin', currentMedications: {} }),
      ValidationError
    );
  });

  test('rejects an allergy entry missing substance', () => {
    assert.throws(
      () => validateCheckOrderBody({ medication: 'Amoxicillin', allergies: [{ severity: 'high' }] }),
      ValidationError
    );
  });

  test('rejects a currentMedications entry missing medication field', () => {
    assert.throws(
      () => validateCheckOrderBody({ medication: 'Amoxicillin', currentMedications: [{ dosage: '10mg' }] }),
      ValidationError
    );
  });

  test('accepts a fully populated valid body', () => {
    const result = validateCheckOrderBody({
      medication: 'Amoxicillin',
      dosage: '500mg',
      allergies: [{ substance: 'Penicillin', severity: 'high' }],
      currentMedications: [{ medication: 'Lisinopril', dosage: '10mg' }],
    });
    assert.equal(result.allergies.length, 1);
    assert.equal(result.currentMedications.length, 1);
  });
});

describe('validateAskBody', () => {
  test('accepts a minimal valid body and fills in defaults', () => {
    const result = validateAskBody({
      question: 'What allergies does this patient have?',
      patientRecord: { patient: { full_name: 'John Doe' } },
    });
    assert.deepEqual(result.patientRecord.allergies, []);
    assert.deepEqual(result.patientRecord.medications, []);
    assert.deepEqual(result.patientRecord.notes, []);
  });

  test('rejects missing question', () => {
    assert.throws(
      () => validateAskBody({ patientRecord: { patient: {} } }),
      ValidationError
    );
  });

  test('rejects missing patientRecord', () => {
    assert.throws(() => validateAskBody({ question: 'hi' }), ValidationError);
  });

  test('rejects patientRecord missing patient', () => {
    assert.throws(
      () => validateAskBody({ question: 'hi', patientRecord: {} }),
      ValidationError
    );
  });

  test('rejects non-array notes', () => {
    assert.throws(
      () =>
        validateAskBody({
          question: 'hi',
          patientRecord: { patient: {}, notes: 'not an array' },
        }),
      ValidationError
    );
  });
});

describe('validateSummarizeBody', () => {
  test('accepts valid text', () => {
    const result = validateSummarizeBody({ text: 'Some clinical document text.' });
    assert.equal(result.text, 'Some clinical document text.');
  });

  test('rejects missing text', () => {
    assert.throws(() => validateSummarizeBody({}), ValidationError);
  });

  test('rejects text over the length limit', () => {
    assert.throws(
      () => validateSummarizeBody({ text: 'a'.repeat(50_001) }),
      ValidationError
    );
  });
});
