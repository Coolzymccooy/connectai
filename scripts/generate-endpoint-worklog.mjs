import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const serverPath = path.join(repoRoot, 'server', 'index.js');
const outPath = path.join(repoRoot, 'WORK_LOG_ENDPOINTS.md');

const routeRegex = /app\.(get|post|put|patch|delete|options|all)\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*([^]*))?$/i;

const deriveScope = (line) => {
  const lower = line.toLowerCase();
  if (lower.includes('authorize([')) {
    const roleMatch = line.match(/authorize\(\[([^\]]+)\]\)/);
    if (roleMatch?.[1]) {
      const roles = roleMatch[1]
        .split(',')
        .map((r) => r.trim().replace(/UserRole\./g, ''))
        .filter(Boolean)
        .join(', ');
      return `Auth (${roles})`;
    }
    return 'Auth (Role-based)';
  }
  if (lower.includes('authenticate')) return 'Auth';
  return 'Public';
};

const deriveHelper = (method, pathName) => {
  const p = pathName.toLowerCase();
  if (p === '/api/health') return 'Service heartbeat and env readiness check.';
  if (p.includes('/api/settings')) return 'Read/save tenant application settings.';
  if (p.includes('/api/calls')) return method === 'get' ? 'Fetch call logs or a single call.' : 'Create/update call session state.';
  if (p.includes('/api/recordings')) return 'List, fetch, or serve call recordings.';
  if (p.includes('/api/jobs')) return 'Queue and inspect async background jobs.';
  if (p.includes('/api/invites')) return 'Create and accept user invitation workflow.';
  if (p.includes('/api/twilio/capabilities')) return 'Twilio monitor/listen readiness diagnostics.';
  if (p.includes('/api/supervisor/monitor')) return 'Supervisor listen/monitor/whisper controls.';
  if (p.includes('/twilio/')) return 'Twilio webhook/callflow endpoint.';
  if (p.includes('/api/billing/stripe')) return 'Stripe billing checkout/config for top-up and plans.';
  if (p.includes('/api/broadcasts')) return 'Admin broadcast creation and archive actions.';
  if (p.includes('/api/crm/hubspot')) return 'HubSpot status/connect/sync operations.';
  if (p.includes('/api/crm')) return 'CRM provider integration and synchronization.';
  if (p.includes('/api/marketing')) return 'Marketing provider connect/sync workflow.';
  if (p.includes('/api/oauth')) return 'OAuth initialization/callback for integrations.';
  if (p.includes('/api/integrations/status')) return 'Aggregate integration status snapshot.';
  if (p.includes('/api/gemini') || p.includes('/api/rag')) return 'AI generation and retrieval-assisted endpoints.';
  if (p.includes('/api/desktop-release') || p.includes('/api/public/desktop-release')) return 'Desktop release metadata for download UI.';
  if (p.includes('/api/export')) return 'Data export and reporting endpoints.';
  if (p.includes('/api/metrics')) return 'Operations and usage metrics summary.';
  return 'Application API route.';
};

const run = async () => {
  const raw = await fs.readFile(serverPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const entries = [];

  lines.forEach((line, index) => {
    const match = line.match(routeRegex);
    if (!match) return;
    const method = match[1].toUpperCase();
    const pathName = match[2];
    const scope = deriveScope(line);
    const helper = deriveHelper(match[1].toLowerCase(), pathName);
    entries.push({
      method,
      pathName,
      scope,
      helper,
      line: index + 1,
    });
  });

  entries.sort((a, b) => {
    if (a.pathName === b.pathName) return a.method.localeCompare(b.method);
    return a.pathName.localeCompare(b.pathName);
  });

  const generatedAt = new Date().toISOString();
  const body = [
    '# Endpoint Worklog',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This file is auto-generated from `server/index.js` and updates when new Express routes are added.',
    '',
    '| Method | Path | Access | Helper | Source |',
    '| --- | --- | --- | --- | --- |',
    ...entries.map((e) => `| ${e.method} | \`${e.pathName}\` | ${e.scope} | ${e.helper} | \`server/index.js:${e.line}\` |`),
    '',
    `Total endpoints discovered: **${entries.length}**`,
    '',
    '> Do not edit manually. Run `npm run worklog:endpoints`.',
    '',
  ].join('\n');

  await fs.writeFile(outPath, body, 'utf8');
  console.log(`[endpoint-worklog] wrote ${path.relative(repoRoot, outPath)} (${entries.length} endpoints)`);
};

run().catch((err) => {
  console.error('[endpoint-worklog] failed:', err?.message || err);
  process.exitCode = 1;
});

