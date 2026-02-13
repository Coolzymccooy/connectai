import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.resolve(rootDir, 'public/version.json');

const safeGit = (command) => {
  try {
    return execSync(command, { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

const gitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.RENDER_GIT_COMMIT ||
  safeGit('git rev-parse HEAD') ||
  'unknown';

const gitBranch =
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.RENDER_GIT_BRANCH ||
  safeGit('git rev-parse --abbrev-ref HEAD') ||
  'unknown';

const payload = {
  version: process.env.npm_package_version || '0.0.0',
  buildTime: new Date().toISOString(),
  gitSha,
  gitBranch,
  source: process.env.VERCEL ? 'vercel' : process.env.RENDER ? 'render' : 'local',
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`[build-meta] wrote ${outputPath}`);
