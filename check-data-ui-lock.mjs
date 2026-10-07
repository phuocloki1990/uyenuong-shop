import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function readLock(root = repoRoot) {
  const lockFile = path.join(root, 'DATA_UI_LOCK_SHA256.txt');
  if (!fs.existsSync(lockFile)) throw new Error('Thiếu DATA_UI_LOCK_SHA256.txt.');
  const entries = new Map();
  for (const raw of fs.readFileSync(lockFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    if (!match) throw new Error(`Dòng lock không hợp lệ: ${raw}`);
    const relative = match[2].replace(/\\/g, '/');
    if (!relative.startsWith('v2/') || relative.includes('..')) throw new Error(`Đường dẫn lock không an toàn: ${relative}`);
    entries.set(relative, match[1].toLowerCase());
  }
  if (!entries.size) throw new Error('DATA/UI lock rỗng.');
  return entries;
}

function mutableV2(relative) {
  return relative.startsWith('v2/content/') || relative === 'v2/release/cutover-plan.json';
}

export function verifyDataUiLock(root = repoRoot, { mode = 'immutable' } = {}) {
  if (!['baseline', 'immutable'].includes(mode)) throw new Error(`Mode không hợp lệ: ${mode}`);
  const entries = readLock(root);
  const failures = [];
  const checked = [];

  for (const [relative, expected] of entries) {
    if (mode === 'immutable' && mutableV2(relative)) continue;
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) {
      failures.push(`${relative}: thiếu file`);
      continue;
    }
    const actual = sha256(file);
    if (actual !== expected) failures.push(`${relative}: hash thay đổi`);
    else checked.push(relative);
  }

  const currentV2 = walk(path.join(root, 'v2')).map(file => path.relative(root, file).replace(/\\/g, '/'));
  for (const relative of currentV2) {
    if (entries.has(relative)) continue;
    if (mode === 'immutable' && mutableV2(relative)) continue;
    failures.push(`${relative}: file V2 ngoài baseline lock`);
  }

  if (mode === 'baseline') {
    for (const relative of entries.keys()) {
      if (!currentV2.includes(relative)) failures.push(`${relative}: không có trong cây V2 hiện tại`);
    }
  }

  return { ok: failures.length === 0, mode, checked: checked.length, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find(value => value.startsWith('--mode='));
  const mode = arg ? arg.split('=')[1] : (process.argv.includes('--baseline') ? 'baseline' : 'immutable');
  const result = verifyDataUiLock(repoRoot, { mode });
  if (!result.ok) {
    console.error(`DATA/UI lock không đạt (${result.failures.length} lỗi):`);
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`DATA/UI lock đạt (${mode}): ${result.checked} file bất biến khớp hash.`);
  }
}
