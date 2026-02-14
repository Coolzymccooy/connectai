import crypto from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : '';
};

const tag = getArg('--tag') || `v${pkg.version}`;
const repo = getArg('--repo') || '';
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const outDir = path.join(root, 'release', 'desktop', tag);

if (!existsSync(bundleDir)) {
  console.error(`[desktop:artifacts] Missing build output at ${bundleDir}. Run "npm run desktop:build" first.`);
  process.exit(1);
}

const walk = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
};

const allFiles = walk(bundleDir);
const msi = allFiles.find((f) => f.toLowerCase().endsWith('.msi'));
const exe = allFiles.find((f) => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('nsis-web'));

if (!msi && !exe) {
  console.error('[desktop:artifacts] No installer files found (.msi or .exe).');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const artifacts = [];
const addArtifact = (src, fileName) => {
  if (!src) return;
  const dest = path.join(outDir, fileName);
  copyFileSync(src, dest);
  const hash = crypto.createHash('sha256').update(readFileSync(dest)).digest('hex');
  const size = statSync(dest).size;
  artifacts.push({ fileName, hash, size });
};

addArtifact(msi, `ConnectAI-Desktop-${tag}-windows-x64.msi`);
addArtifact(msi, 'ConnectAI-Desktop-windows-x64.msi');
addArtifact(exe, `ConnectAI-Desktop-${tag}-windows-x64-setup.exe`);
addArtifact(exe, 'ConnectAI-Desktop-windows-x64-setup.exe');

const checksumContent = artifacts.map((a) => `${a.hash}  ${a.fileName}`).join('\n') + '\n';
writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), checksumContent, 'utf8');

const baseUrl = repo ? `https://github.com/${repo}/releases/latest/download` : '';
const manifest = {
  productName: 'ConnectAI Desktop',
  channel: 'beta',
  unsigned: true,
  latestVersion: tag.replace(/^v/i, ''),
  publishedAt: new Date().toISOString(),
  releasesUrl: repo ? `https://github.com/${repo}/releases` : '',
  notesUrl: repo ? `https://github.com/${repo}/blob/master/CHANGELOG.md` : '',
  downloads: {
    windows: {
      label: 'Windows x64',
      fileName: 'ConnectAI-Desktop-windows-x64.msi',
      url: baseUrl ? `${baseUrl}/ConnectAI-Desktop-windows-x64.msi` : '',
      size: artifacts.find((a) => a.fileName === 'ConnectAI-Desktop-windows-x64.msi')?.size || 0
    }
  }
};

writeFileSync(path.join(outDir, 'desktop-release.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`[desktop:artifacts] Prepared ${artifacts.length} artifacts in ${outDir}`);
for (const artifact of artifacts) {
  console.log(`- ${artifact.fileName} (${artifact.size} bytes)`);
}
