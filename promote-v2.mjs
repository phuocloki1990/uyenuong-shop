import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..');
const MANIFEST = '.v2-production-manifest.json';

const FIXED_LEGACY = [
  'gio-hang.html', 'dat-hang.html',
  'san-pham', 'chuyen-muc', 'content', 'css', 'scripts',
  'assets/js/app.js', 'assets/js/cms-catalog.js',
  'assets/images/Anh1.jpg', 'assets/images/Banner.jpg', 'assets/images/Banner1.jpg',
  'assets/images/banh-phuc-linh-1.jpg', 'assets/images/mam-qua-cuoi-1.jpg', 'assets/images/README.txt',
  'ADMIN_SETUP.md', 'B3-FILES.json', 'B3-HUONG-DAN.md', '.pages.yml', '.cms-build-manifest.json', 'rebuild-content.yml',
  '.github/workflows/rebuild-content.yml',
  'admin/orders.html', 'admin/products.html',
  'cam-nang/goi-y-chon-mam-qua-4-mam-va-6-mam.html',
  'cam-nang/mam-qua-cuoi-gom-nhung-gi.html',
  'cam-nang/nen-dat-banh-phu-the-bao-nhieu-cai.html'
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function cleanRelative(relative) {
  const value = String(relative).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!value || path.posix.isAbsolute(value) || value.includes('../') || value === '..') throw new Error(`Đường dẫn không an toàn: ${relative}`);
  return value;
}

function isProtected(relative) {
  return ['v2/', 'functions/', 'infra/', '.github/', 'assets/images/'].some(prefix => relative.startsWith(prefix)) ||
    ['DATA_UI_LOCK_SHA256.txt', 'README.md'].includes(relative);
}

function isManagedPublic(relative) {
  relative = cleanRelative(relative);
  if (isProtected(relative)) return false;
  if (['index.html', '_headers', '_redirects', 'robots.txt', 'sitemap.xml'].includes(relative)) return true;
  if (relative.startsWith('admin/') || relative.startsWith('assets/css/') || relative.startsWith('assets/js/') || relative.startsWith('cam-nang/')) return true;
  return relative.endsWith('/index.html');
}

function removePath(root, relative) {
  relative = cleanRelative(relative);
  const approvedProtectedLegacy = FIXED_LEGACY.includes(relative);
  if (isProtected(relative) && !approvedProtectedLegacy) throw new Error(`Từ chối xóa đường dẫn được bảo vệ: ${relative}`);
  fs.rmSync(path.join(root, relative), { recursive: true, force: true });
}

function pruneEmptyParents(root, relative) {
  let dir = path.dirname(path.join(root, relative));
  while (dir !== root && dir.startsWith(`${root}${path.sep}`)) {
    const rel = path.relative(root, dir).replace(/\\/g, '/');
    if (!rel || ['admin', 'assets', 'assets/css', 'assets/js', 'cam-nang'].includes(rel) || isProtected(`${rel}/`)) break;
    if (!fs.existsSync(dir) || fs.readdirSync(dir).length) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

function readPreviousManifest(root) {
  const file = path.join(root, MANIFEST);
  if (!fs.existsSync(file)) return [];
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error(`${MANIFEST} không hợp lệ.`); }
  if (!Array.isArray(data.files)) throw new Error(`${MANIFEST} thiếu danh sách files.`);
  return data.files.map(cleanRelative);
}

export function promoteV2(root = repoRoot, { stageDir = 'v2-preview' } = {}) {
  root = path.resolve(root);
  const stage = path.join(root, stageDir);
  if (!fs.existsSync(stage) || !fs.statSync(stage).isDirectory()) throw new Error(`Thiếu thư mục build ${stageDir}.`);

  const stageFiles = walk(stage).map(file => path.relative(stage, file).replace(/\\/g, '/')).sort();
  if (!stageFiles.includes('index.html') || !stageFiles.includes('_redirects') || !stageFiles.includes('admin/index.html')) {
    throw new Error('Build staging thiếu output bắt buộc.');
  }

  const managedNow = stageFiles.filter(relative => !relative.startsWith('assets/images/') && isManagedPublic(relative));
  const previous = readPreviousManifest(root);
  for (const relative of previous) {
    if (!isManagedPublic(relative)) throw new Error(`Manifest cũ chứa đường dẫn ngoài phạm vi: ${relative}`);
    if (!managedNow.includes(relative)) {
      removePath(root, relative);
      pruneEmptyParents(root, relative);
    }
  }

  for (const relative of FIXED_LEGACY) {
    if (fs.existsSync(path.join(root, relative))) removePath(root, relative);
  }

  for (const relative of stageFiles) {
    const source = path.join(stage, relative);
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  const manifest = { version: 1, files: managedNow };
  fs.writeFileSync(path.join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  const mismatches = [];
  for (const relative of stageFiles) {
    const source = path.join(stage, relative);
    const target = path.join(root, relative);
    if (!fs.existsSync(target) || hash(source) !== hash(target)) mismatches.push(relative);
  }
  if (mismatches.length) throw new Error(`Promotion copy sai ${mismatches.length} file: ${mismatches.join(', ')}`);

  const forbiddenAfter = [
    'gio-hang.html','dat-hang.html','san-pham','chuyen-muc','content','css','scripts',
    'assets/js/app.js','assets/js/cms-catalog.js','assets/images/Anh1.jpg','assets/images/Banner.jpg','assets/images/Banner1.jpg',
    'assets/images/banh-phuc-linh-1.jpg','assets/images/mam-qua-cuoi-1.jpg','assets/images/README.txt',
    'ADMIN_SETUP.md','B3-FILES.json','B3-HUONG-DAN.md','.pages.yml','.cms-build-manifest.json','rebuild-content.yml',
    '.github/workflows/rebuild-content.yml','admin/orders.html','admin/products.html',
    'cam-nang/goi-y-chon-mam-qua-4-mam-va-6-mam.html','cam-nang/mam-qua-cuoi-gom-nhung-gi.html','cam-nang/nen-dat-banh-phu-the-bao-nhieu-cai.html'
  ].filter(relative => fs.existsSync(path.join(root, relative)));
  if (forbiddenAfter.length) throw new Error(`Còn legacy sau promotion: ${forbiddenAfter.join(', ')}`);

  return { copied: stageFiles.length, managed: managedNow.length, removedLegacy: FIXED_LEGACY.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = promoteV2(repoRoot);
  console.log(`Promotion V2 đạt: copy ${result.copied} file, quản lý ${result.managed} public file; legacy allowlist đã dọn.`);
}
