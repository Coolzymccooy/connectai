import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = process.env.INTEGRATION_BASE_URL;

test('integration health deps (optional)', { skip: !baseUrl }, async () => {
  const res = await fetch(`${baseUrl}/api/health/deps`);
  assert.equal(res.ok, true);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok('jobWorker' in data);
});
