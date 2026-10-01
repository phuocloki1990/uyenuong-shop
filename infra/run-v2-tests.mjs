import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const legacyFixtures = [
  'san-pham/banh-phu-the-hue-tphcm.html',
  'san-pham/banh-phu-the-mien-bac-tphcm.html',
  'san-pham/banh-phu-the-tphcm.html',
  'san-pham/banh-phuc-linh-tphcm.html',
  'san-pham/mam-qua-cuoi-tphcm.html',
  'cam-nang/goi-y-chon-mam-qua-4-mam-va-6-mam.html',
  'cam-nang/mam-qua-cuoi-gom-nhung-gi.html',
  'cam-nang/nen-dat-banh-phu-the-bao-nhieu-cai.html',
  'chuyen-muc/banh-cuoi-bai-viet.html',
  'chuyen-muc/banh-cuoi-hoi.html',
  'chuyen-muc/banh-phuc-linh.html',
  'chuyen-muc/cam-nang-cuoi.html',
  'chuyen-muc/mam-qua-cuoi-bai-viet.html',
  'chuyen-muc/mam-qua-cuoi.html'
];

const created = [];
const createdDirs = new Set();

function ensureFixture(relative) {
  const file = path.join(root, relative);
  if (fs.existsSync(file)) return;
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    createdDirs.add(dir);
  }
  fs.writeFileSync(file, '<!doctype html><title>Legacy redirect QA fixture</title>\n');
  created.push(file);
}

function cleanup() {
  for (const file of created.reverse()) fs.rmSync(file, { force: true });
  const dirs = [...createdDirs].sort((a, b) => b.length - a.length);
  for (const dir of dirs) {
    try { if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch {}
  }
}

for (const relative of legacyFixtures) ensureFixture(relative);

try {
  const v2Tests = fs.readdirSync(path.join(root, 'v2/scripts'))
    .filter(name => name.endsWith('.test.mjs'))
    .sort()
    .map(name => path.join(root, 'v2/scripts', name));
  const infraTests = [path.join(root, 'infra/infra.test.mjs')].filter(fs.existsSync);
  const result = spawnSync(process.execPath, ['--test', ...v2Tests, ...infraTests], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  cleanup();
}
