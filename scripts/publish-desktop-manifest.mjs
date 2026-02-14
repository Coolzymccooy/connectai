import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : '';
};

const source = getArg('--source');
if (!source) {
  console.error('Usage: node scripts/publish-desktop-manifest.mjs --source <path-to-desktop-release.json>');
  process.exit(1);
}

const sourcePath = path.isAbsolute(source) ? source : path.resolve(root, source);
const destPath = path.join(root, 'public', 'desktop-release.json');

if (!existsSync(sourcePath)) {
  console.error(`Source manifest not found: ${sourcePath}`);
  process.exit(1);
}

copyFileSync(sourcePath, destPath);
console.log(`[desktop:manifest] Updated ${destPath} from ${sourcePath}`);
