import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskPhone, maskEmail, redactText, computeExpiresAt, sanitizeCallForStorage } from '../utils/gdpr.js';

test('maskPhone keeps last 4 digits', () => {
  assert.equal(maskPhone('+1 (555) 012-3456'), '****3456');
});

test('maskEmail keeps domain', () => {
  assert.equal(maskEmail('agent@example.com'), 'a***@example.com');
});

test('redactText masks phones and emails', () => {
  const input = 'Call me at +1 555-012-3456 or agent@example.com';
  const output = redactText(input);
  assert.ok(output.includes('****3456'));
  assert.ok(output.includes('a***@example.com'));
});

test('computeExpiresAt returns undefined for invalid days', () => {
  assert.equal(computeExpiresAt(Date.now(), 0), undefined);
});

test('sanitizeCallForStorage applies redaction and retention', () => {
  const call = {
    id: 'c1',
    direction: 'outbound',
    customerName: 'Test User',
    phoneNumber: '+15550123456',
    queue: 'Sales',
    startTime: 1000,
    durationSeconds: 0,
    status: 'ACTIVE',
    transcript: [{ id: 't1', speaker: 'agent', text: 'Email me at agent@example.com', timestamp: 1000 }]
  };
  const safe = sanitizeCallForStorage(call, { anonymizePii: true, retentionDays: '1' });
  assert.equal(safe.phoneNumber, '****3456');
  assert.ok(safe.expiresAt);
  assert.equal(safe.transcript[0].text.includes('a***@example.com'), true);
});
