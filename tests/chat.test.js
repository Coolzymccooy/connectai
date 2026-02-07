import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInternalConversationId, buildExternalConversationId, normalizePhone } from '../utils/chat.js';

test('normalizePhone strips non-digits', () => {
  assert.equal(normalizePhone('+1 (555) 012-3456'), '15550123456');
});

test('buildInternalConversationId is order-independent', () => {
  const a = buildInternalConversationId('u2', 'u1');
  const b = buildInternalConversationId('u1', 'u2');
  assert.equal(a, b);
});

test('buildExternalConversationId uses phone digits', () => {
  const id = buildExternalConversationId('+1 (555) 012-3456');
  assert.ok(id.startsWith('ext_15550123456'));
});
