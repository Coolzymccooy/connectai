const baseUrl = process.env.LOAD_TEST_BASE_URL || 'http://localhost:8787';
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 25);
const iterations = Number(process.env.LOAD_TEST_ITERATIONS || 50);
const enableWebhook = process.env.LOAD_TEST_ENABLE_WEBHOOK === 'true';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const hitHealth = async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  if (!res.ok) throw new Error(`health failed ${res.status}`);
};

const hitDeps = async () => {
  const res = await fetch(`${baseUrl}/api/health/deps`);
  if (!res.ok) throw new Error(`deps failed ${res.status}`);
};

const hitWebhook = async () => {
  const payload = {
    from: `234800${Math.floor(Math.random() * 1000000)}`,
    to: 'connectai',
    sms: 'Load test inbound WhatsApp',
    channel: 'whatsapp',
  };
  const res = await fetch(`${baseUrl}/api/termii/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`webhook failed ${res.status}`);
};

const tasks = enableWebhook ? [hitHealth, hitDeps, hitWebhook] : [hitHealth, hitDeps];

const run = async () => {
  console.log(`[load-test] base=${baseUrl} concurrency=${concurrency} iterations=${iterations} webhook=${enableWebhook}`);
  for (let i = 0; i < iterations; i++) {
    const batch = Array.from({ length: concurrency }, () => {
      const task = tasks[Math.floor(Math.random() * tasks.length)];
      return task().catch(err => err);
    });
    const results = await Promise.all(batch);
    const errors = results.filter(r => r instanceof Error).length;
    if (errors) {
      console.log(`[load-test] iteration ${i + 1}: errors=${errors}`);
    } else {
      console.log(`[load-test] iteration ${i + 1}: ok`);
    }
    await sleep(150);
  }
  console.log('[load-test] done');
};

run().catch(err => {
  console.error('[load-test] fatal', err?.message || err);
  process.exit(1);
});
