import fs from 'node:fs';
import path from 'node:path';

const routePattern = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*$/;

function fail(message) {
  const error = new Error(message);
  error.name = 'V2SeoError';
  throw error;
}

function validateRoute(value, field) {
  if (typeof value !== 'string' || !value.startsWith('/') || !routePattern.test(value) || value.includes('..') || value.includes('//')) fail(`${field}: route không hợp lệ`);
  return value;
}

export function indexablePaths({ products, articles, categories }) {
  return [
    '/',
    ...products.filter(item => item.status === 'published').map(item => `/${item.slug}/`),
    '/cam-nang/',
    ...articles.filter(item => item.status === 'published').map(item => `/cam-nang/${item.slug}/`),
    ...categories.filter(item => item.status === 'published' && item.public_hub).map(item => `/cam-nang/${item.slug}/`),
    '/lien-he/'
  ];
}

export function loadLegacyRedirects(repoRoot, { products, articles, categories }) {
  const file = path.join(repoRoot, 'v2/config/legacy-redirects.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) fail('legacy-redirects.json: phải là mảng');
  const productById = new Map(products.filter(item => item.status === 'published').map(item => [item.id,item]));
  const articleById = new Map(articles.filter(item => item.status === 'published').map(item => [item.id,item]));
  const categoryById = new Map(categories.filter(item => item.status === 'published' && item.public_hub).map(item => [item.id,item]));
  const resolveTarget = (item, index) => {
    if (item.to) return validateRoute(item.to, `legacy-redirects[${index}].to`);
    const id = String(item.target_id || '').trim();
    if (!id) fail(`legacy-redirects[${index}].target_id: bắt buộc`);
    if (item.target_kind === 'product') {
      const target = productById.get(id); if (!target) fail(`legacy-redirects[${index}]: product target không tồn tại: ${id}`); return `/${target.slug}/`;
    }
    if (item.target_kind === 'article') {
      const target = articleById.get(id); if (!target) fail(`legacy-redirects[${index}]: article target không tồn tại: ${id}`); return `/cam-nang/${target.slug}/`;
    }
    if (item.target_kind === 'category') {
      const target = categoryById.get(id); if (!target) fail(`legacy-redirects[${index}]: category target không tồn tại: ${id}`); return `/cam-nang/${target.slug}/`;
    }
    fail(`legacy-redirects[${index}].target_kind: không hợp lệ`);
  };
  return data.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`legacy-redirects[${index}]: không hợp lệ`);
    return { from: validateRoute(item.from, `legacy-redirects[${index}].from`), to: resolveTarget(item,index), status:301 };
  });
}

export function dynamicRedirects({ products, articles, categories }) {
  const redirects = [];
  for (const product of products.filter(item => item.status === 'published')) {
    for (const oldSlug of product.previous_slugs || []) redirects.push({ from:`/${oldSlug}/`, to:`/${product.slug}/`, status:301 });
  }
  for (const article of articles.filter(item => item.status === 'published')) {
    for (const oldSlug of article.previous_slugs || []) redirects.push({ from:`/cam-nang/${oldSlug}/`, to:`/cam-nang/${article.slug}/`, status:301 });
  }
  for (const category of categories.filter(item => item.status === 'published' && item.public_hub)) {
    for (const oldSlug of category.previous_slugs || []) redirects.push({ from:`/cam-nang/${oldSlug}/`, to:`/cam-nang/${category.slug}/`, status:301 });
  }
  return redirects;
}

export function collectRedirects(repoRoot, content) {
  const canonical = new Set(indexablePaths(content));
  const merged = [...loadLegacyRedirects(repoRoot, content), ...dynamicRedirects(content)];
  const bySource = new Map();
  for (const redirect of merged) {
    const from = validateRoute(redirect.from, 'redirect.from');
    const to = validateRoute(redirect.to, 'redirect.to');
    if (from === to) fail(`Redirect tự lặp: ${from}`);
    if (canonical.has(from)) fail(`Redirect source đang là canonical URL: ${from}`);
    if (!canonical.has(to) && !['/gio-hang/','/dat-hang/'].includes(to)) fail(`Redirect target không tồn tại trong V2: ${to}`);
    const prior = bySource.get(from);
    if (prior && prior.to !== to) fail(`Redirect source có nhiều target: ${from}`);
    bySource.set(from, { from, to, status:301 });
  }
  return [...bySource.values()].sort((a,b) => a.from.localeCompare(b.from, 'en'));
}

export function renderRedirects(redirects) {
  return `${redirects.map(item => `${item.from} ${item.to} ${item.status}`).join('\n')}\n`;
}

export function renderHeaders({ preview = false } = {}) {
  const globalPreview = preview ? `/*\n  X-Robots-Tag: noindex, nofollow\n\n` : '';
  return `${globalPreview}/admin/*\n  X-Robots-Tag: noindex, nofollow\n\n/gio-hang/*\n  X-Robots-Tag: noindex, follow\n\n/dat-hang/*\n  X-Robots-Tag: noindex, follow\n`;
}

export function renderRobots(canonicalDomain) {
  const canonical = String(canonicalDomain).replace(/\/$/, '');
  return `User-agent: *\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${canonical}/sitemap.xml\n`;
}
