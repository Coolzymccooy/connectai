import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:8787';

test('health endpoint responds', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.ok, true);
  const data = await res.json();
  assert.equal(typeof data.ok, 'boolean');
});

test('deps health endpoint responds', async () => {
  const res = await fetch(`${baseUrl}/api/health/deps`);
  assert.equal(res.ok, true);
  const data = await res.json();
  assert.equal(typeof data.ok, 'boolean');
  assert.ok('jobWorker' in data);
});
