import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildV2, repoRoot } from './build.mjs';

const LEGACY_PUBLIC = [
  'index.html', 'gio-hang.html', 'dat-hang.html', 'sitemap.xml', '_redirects',
  'san-pham/', 'cam-nang/', 'chuyen-muc/', 'admin/'
];

export function createCutoverPlan(root = repoRoot) {
  const result = buildV2(root, { check:true });
  const generated = [...result.outputs.keys()].sort();
  return {
    version: 'phase-ii-7',
    mode: 'prepare-only',
    production_domain: result.site.canonical_domain.replace(/\/$/, ''),
    generated_root_files: generated,
    legacy_paths_to_replace_at_cutover: LEGACY_PUBLIC,
    preserve_without_migration: ['functions/', 'D1 orders data', 'Telegram secrets', 'Cloudflare Access policy', 'Git history'],
    rollback: [
      'Giữ commit Production ngay trước cutover.',
      'Chụp snapshot D1 trước khi đổi Production.',
      'Nếu QA Production fail, quay lại commit trước; Phase II.7 không xóa hoặc migration D1.'
    ],
    required_production_checks: [
      'Cloudflare Access chặn /admin/* khi chưa đăng nhập.',
      'D1 binding DB hoạt động trên Production.',
      'Telegram test không làm mất đơn nếu gửi thông báo lỗi.',
      'Redirect V1 trả 301 tới đúng canonical V2.',
      'PC, tablet, mobile kiểm trực quan các luồng chính.'
    ]
  };
}

export function writeCutoverPlan(root = repoRoot) {
  const plan = createCutoverPlan(root);
  const target = path.join(root, 'v2/release/cutover-plan.json');
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`);
  return { target, plan };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { target, plan } = writeCutoverPlan(repoRoot);
  console.log(`Cutover plan đã chuẩn bị: ${path.relative(repoRoot, target)} (${plan.generated_root_files.length} file V2). Không có file Production nào bị thay thế.`);
}
