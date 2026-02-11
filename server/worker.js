import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env.local', import.meta.url).pathname });

const BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8787';
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';
const INTERVAL_MS = Number(process.env.JOB_WORKER_INTERVAL_MS || 30_000);
let warnedMissingToken = false;
let warnedForbidden = false;

const tick = async () => {
  if (!WORKER_TOKEN) {
    if (!warnedMissingToken) {
      console.error('[worker] WORKER_TOKEN missing. Set WORKER_TOKEN to enable job processing.');
      warnedMissingToken = true;
    }
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/api/jobs/process`, {
      method: 'POST',
      headers: {
        'X-Worker-Token': WORKER_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && !warnedForbidden) {
        console.error('[worker] forbidden. Check WORKER_TOKEN matches server.');
        warnedForbidden = true;
      } else {
        console.error('[worker] job process failed', data);
      }
    } else {
      console.log('[worker] processed', data.processed ?? 0);
    }
  } catch (err) {
    console.error('[worker] error', err?.message || err);
  }
};

setInterval(tick, INTERVAL_MS);
tick();
