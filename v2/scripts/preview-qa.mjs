import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function attrs(tag) {
  const result = {};
  const re = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(tag))) result[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return result;
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasWrappingLabel(html, index) {
  const open = html.lastIndexOf('<label', index);
  const close = html.lastIndexOf('</label>', index);
  return open > close;
}

function resolveLocal(root, url) {
  let pathname = url.split('#')[0].split('?')[0];
  try { pathname = decodeURIComponent(pathname); } catch {}
  if (!pathname.startsWith('/')) return null;
  if (pathname === '/') return path.join(root, 'index.html');
  const clean = pathname.replace(/^\/+/, '');
  const direct = path.join(root, clean);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return path.join(direct, 'index.html');
  if (pathname.endsWith('/')) return path.join(root, clean, 'index.html');
  return direct;
}

export function runPreviewQa(root = repoRoot) {
  const preview = path.join(root, 'v2-preview');
  if (!fs.existsSync(preview)) throw new Error('Chưa có v2-preview. Hãy chạy build trước.');

  const issues = [];
  const htmlFiles = walk(preview).filter(file => file.endsWith('.html')).sort();
  const internalLinks = new Set();
  const localAssets = new Set();

  for (const file of htmlFiles) {
    const rel = path.relative(preview, file).replaceAll(path.sep, '/');
    const html = fs.readFileSync(file, 'utf8');
    const admin = rel.startsWith('admin/');
    const cartOrOrder = rel.startsWith('gio-hang/') || rel.startsWith('dat-hang/');

    if (!/<html\b[^>]*\blang=["']vi["']/i.test(html)) issues.push(`${rel}: thiếu lang=vi`);
    if (!/<meta\b[^>]*\bname=["']viewport["']/i.test(html)) issues.push(`${rel}: thiếu meta viewport`);
    if (!/<title>\s*[^<]+\s*<\/title>/i.test(html)) issues.push(`${rel}: thiếu title`);
    if (!admin && !/<meta\b[^>]*\bname=["']description["']/i.test(html)) issues.push(`${rel}: thiếu meta description`);
    if ((admin || cartOrOrder) && !/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i.test(html)) issues.push(`${rel}: cần noindex`);

    const h1Count = (html.match(/<h1\b/gi) || []).length;
    if (h1Count < 1) issues.push(`${rel}: thiếu H1`);

    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      if (!/\balt\s*=/.test(m[0])) issues.push(`${rel}: img thiếu alt`);
      const a = attrs(m[0]);
      if (a.src?.startsWith('/')) localAssets.add(a.src);
    }

    for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) if (m[1].startsWith('/')) localAssets.add(m[1]);
    for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) if (m[1].startsWith('/') && !m[1].startsWith('//')) localAssets.add(m[1]);

    for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>/gi)) {
      const href = m[1].trim();
      if (!href || href === '#') issues.push(`${rel}: link rỗng/#`);
      if (/\.html(?:[?#]|$)/i.test(href)) issues.push(`${rel}: internal/public link còn .html (${href})`);
      if (href.startsWith('/') && !href.startsWith('/cdn-cgi/') && !href.startsWith('/api/')) internalLinks.add(href);
    }

    for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
      const a = attrs(`<button ${m[1]}>`);
      if (!stripTags(m[2]) && !a['aria-label'] && !a.title) issues.push(`${rel}: button thiếu nhãn truy cập`);
    }

    const controlRe = /<(input|select|textarea)\b[^>]*>/gi;
    for (const m of html.matchAll(controlRe)) {
      const tag = m[0];
      const a = attrs(tag);
      const type = (a.type || '').toLowerCase();
      if (['hidden','submit','button','reset'].includes(type)) continue;
      if (a['aria-label'] || a['aria-labelledby']) continue;
      if (hasWrappingLabel(html, m.index)) continue;
      if (a.id && new RegExp(`<label\\b[^>]*\\bfor=["']${a.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']`, 'i').test(html)) continue;
      issues.push(`${rel}: ${m[1]} thiếu accessible label (${a.name || a.id || 'không tên'})`);
    }
  }

  for (const href of internalLinks) {
    const target = resolveLocal(preview, href);
    if (!target || !fs.existsSync(target)) issues.push(`Link nội bộ không tồn tại: ${href}`);
  }
  for (const src of localAssets) {
    const target = resolveLocal(preview, src);
    if (!target || !fs.existsSync(target)) issues.push(`Asset nội bộ không tồn tại: ${src}`);
  }

  const siteCss = fs.readFileSync(path.join(preview, 'assets/css/site.css'), 'utf8');
  const adminCss = fs.readFileSync(path.join(preview, 'assets/css/admin.css'), 'utf8');
  if (!siteCss.includes('@media (max-width:980px)') || !siteCss.includes('@media (max-width:640px)')) issues.push('site.css: thiếu breakpoint tablet/mobile');
  if (!siteCss.includes('prefers-reduced-motion')) issues.push('site.css: thiếu prefers-reduced-motion');
  if (!adminCss.includes('@media(max-width:760px)')) issues.push('admin.css: thiếu mobile breakpoint');
  if (!adminCss.includes('prefers-reduced-motion')) issues.push('admin.css: thiếu prefers-reduced-motion');

  const runtimeFiles = walk(preview).filter(file => /\.(?:html|js|css)$/i.test(file));
  const runtime = runtimeFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const banned = [
    'bánh phu thê huế', 'bánh phu thê miền bắc', 'phu-the-hue', 'phu-the-bac',
    'song hỷ', 'rồng phụng', 'giờ hoàng đạo', 'gói 4 mâm', 'gói 6 mâm', 'gói 8 mâm'
  ];
  for (const term of banned) if (runtime.toLowerCase().includes(term)) issues.push(`Runtime còn legacy term: ${term}`);

  const adminRuntime = [path.join(preview,'assets/js/admin.js'), ...htmlFiles.filter(f => path.relative(preview,f).startsWith(`admin${path.sep}`))]
    .map(file => fs.readFileSync(file,'utf8')).join('\n').toLowerCase();
  for (const term of ['pages cms','github','cloudflare','branch','deploy']) if (adminRuntime.includes(term)) issues.push(`Admin UI lộ thuật ngữ hạ tầng: ${term}`);

  return {
    ok: issues.length === 0,
    issues,
    html_pages: htmlFiles.length,
    internal_links: internalLinks.size,
    local_assets: localAssets.size
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runPreviewQa(repoRoot);
  if (!report.ok) {
    console.error(`Preview QA không đạt (${report.issues.length} lỗi):`);
    for (const issue of report.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`Preview QA đạt: ${report.html_pages} HTML, ${report.internal_links} link nội bộ, ${report.local_assets} asset nội bộ; accessibility/static checks đạt.`);
  }
}
