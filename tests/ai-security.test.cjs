'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRequest, buildInstructions, sanitizeValue } = require('../api/ai/core');

test('rejects missing and malformed request bodies', () => {
  assert.match(validateRequest(null).error, /غير صالح/);
  assert.match(validateRequest({ question: 'سؤال' }).error, /ملخص/);
  assert.match(validateRequest({ question: '   ', summary: {} }).error, /اكتب/);
});

test('rejects oversized question', () => {
  assert.match(validateRequest({ question: 'س'.repeat(1201), summary: {} }).error, /أطول/);
});

test('removes direct identifiers and raw free-text fields from summary', () => {
  assert.deepEqual(sanitizeValue({
    total: 10, complainant: 'Customer Name', content: 'Private complaint text',
    policy: 'AWB-123', notes: 'Private notes',
    branches: [{ label: 'Alexandria', count: 4 }]
  }), { total: 10, branches: [{ label: 'Alexandria', count: 4 }] });
});

test('bounds long strings and array/object growth', () => {
  const result = sanitizeValue({ label: 'x'.repeat(500), items: Array.from({ length: 50 }, (_, i) => i) });
  assert.equal(result.label.length, 240);
  assert.equal(result.items.length, 30);
});

test('instructions prohibit invented figures and automatic approvals', () => {
  const instructions = buildInstructions();
  assert.match(instructions, /لا تخترع أرقامًا/);
  assert.match(instructions, /اعتمادًا بشريًا/);
});

test('valid request returns sanitized aggregate summary', () => {
  const result = validateRequest({ question: 'قارن الشهرين', summary: { total: 15, branches: [{ label: 'Tanta', count: 5 }], complainant: 'not sent' } });
  assert.equal(result.error, undefined);
  assert.equal(result.question, 'قارن الشهرين');
  assert.deepEqual(result.summary, { total: 15, branches: [{ label: 'Tanta', count: 5 }] });
});
