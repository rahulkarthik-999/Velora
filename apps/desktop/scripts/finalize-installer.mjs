// Copies the NSIS installer Tauri built to the stable public name Velora-Setup.exe
// and writes its SHA-256 next to it. Fails loudly if the expected installer is missing,
// so a broken build can never publish a stale file.
//
// Run from apps/desktop after `tauri build`:  node scripts/finalize-installer.mjs

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const { productName, version } = conf;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (pkg.version !== version) {
  console.error(`Version mismatch: package.json ${pkg.version}, tauri.conf.json ${version}`);
  process.exit(1);
}

const nsisDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const built = join(nsisDir, `${productName}_${version}_x64-setup.exe`);
if (!existsSync(built)) {
  console.error(`Installer not found: ${built}`);
  process.exit(1);
}

const out = join(nsisDir, 'Velora-Setup.exe');
copyFileSync(built, out);
const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex');
writeFileSync(`${out}.sha256`, `${sha256}  Velora-Setup.exe\n`);
console.log(`${out}\nversion ${version}\nsha256 ${sha256}`);
