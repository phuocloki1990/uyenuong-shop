import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '../..');
const PROD_HOSTS = new Set(['uyenuong-shop.pages.dev']);

const parseRedirects = text => text
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'))
  .map((line, index) => {
    const [from, to, status] = line.split(/\s+/);
    if (!from || !to || !status) throw new Error(`_redirects dòng ${index + 1} không hợp lệ`);
    return { from, to, status:Number(status) };
  });

const timeoutSignal = ms => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return controller.signal;
};

const hasNoindex = response => /(?:^|[,\s])noindex(?:[,\s]|$)/i.test(response.headers.get('x-robots-tag') || '');

export async function runLivePreviewQa({ baseUrl, fetchImpl = globalThis.fetch, repoRoot = defaultRoot, timeoutMs = 15000 } = {}) {
  if (!baseUrl) throw new Error('Thiếu PREVIEW_BASE_URL.');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:') throw new Error('Preview phải dùng HTTPS.');
  if (PROD_HOSTS.has(base.hostname.toLowerCase())) throw new Error('Không chạy Live Preview QA trực tiếp trên host Production.');

  const issues = [];
  const checks = [];
  const request = async (pathname, { redirect = 'manual', method = 'GET' } = {}) => {
    const url = new URL(pathname, base);
    try {
      return await fetchImpl(url, { redirect, method, signal:timeoutSignal(timeoutMs), headers:{'User-Agent':'uyenuong-v2-preview-qa'} });
    } catch (error) {
      issues.push(`${pathname}: không truy cập được (${error?.message || error})`);
      return null;
    }
  };
  const check = (ok, message) => {
    checks.push({ ok:Boolean(ok), message });
    if (!ok) issues.push(message);
  };

  const home = await request('/');
  if (home) {
    check(home.status === 200, `Trang chủ Preview phải trả 200, hiện tại ${home.status}.`);
    check(hasNoindex(home), 'Preview phải có X-Robots-Tag: noindex trên trang public.');
  }

  const sitemapResponse = await request('/sitemap.xml');
  let sitemap = '';
  if (sitemapResponse) {
    check(sitemapResponse.status === 200, `sitemap.xml phải trả 200, hiện tại ${sitemapResponse.status}.`);
    sitemap = await sitemapResponse.text();
    const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map(match => match[1] || '/');
    check(paths.length > 0, 'sitemap.xml không có URL canonical nào.');
    for (const pathname of paths) {
      const response = await request(pathname || '/');
      if (response) check(response.status === 200, `${pathname}: canonical Preview phải trả 200, hiện tại ${response.status}.`);
    }
  }

  for (const pathname of ['/robots.txt','/gio-hang/','/dat-hang/']) {
    const response = await request(pathname);
    if (!response) continue;
    check(response.status === 200, `${pathname}: phải trả 200, hiện tại ${response.status}.`);
    if (pathname !== '/robots.txt') check(hasNoindex(response), `${pathname}: thiếu X-Robots-Tag noindex.`);
  }

  const admin = await request('/admin/');
  if (admin) {
    const blocked = [301,302,303,307,308,401,403].includes(admin.status);
    check(blocked, `/admin/: chưa được Access chặn (status ${admin.status}).`);
  }
  const adminApi = await request('/admin/api/v2/content?kind=products');
  if (adminApi) {
    const blocked = [301,302,303,307,308,401,403].includes(adminApi.status);
    check(blocked, `/admin/api/v2/content: chưa được Access chặn (status ${adminApi.status}).`);
  }

  const publicApi = await request('/api/v2/orders');
  if (publicApi) {
    check([400,405].includes(publicApi.status), `/api/v2/orders GET phải bị từ chối an toàn, hiện tại ${publicApi.status}.`);
    check(hasNoindex(publicApi), '/api/v2/orders: thiếu X-Robots-Tag noindex.');
  }

  const redirectsFile = path.join(repoRoot, 'v2-preview/_redirects');
  if (fs.existsSync(redirectsFile)) {
    const redirects = parseRedirects(fs.readFileSync(redirectsFile, 'utf8'));
    for (const item of redirects) {
      const response = await request(item.from);
      if (!response) continue;
      check(response.status === item.status, `${item.from}: cần ${item.status}, hiện tại ${response.status}.`);
      const location = response.headers.get('location') || '';
      if (location) {
        const target = new URL(location, base);
        check(target.pathname === item.to, `${item.from}: redirect sai đích (${target.pathname} thay vì ${item.to}).`);
      } else {
        check(false, `${item.from}: thiếu Location header.`);
      }
    }
  } else {
    issues.push('Không tìm thấy v2-preview/_redirects để đối chiếu redirect legacy.');
  }

  const report = {
    ok: issues.length === 0,
    base_url: base.origin,
    checked_at: new Date().toISOString(),
    checks: checks.length,
    issues
  };
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.env.PREVIEW_BASE_URL || process.argv[2] || '';
  try {
    const report = await runLivePreviewQa({ baseUrl });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
