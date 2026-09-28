import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildV2, repoRoot } from './build.mjs';
import { createCutoverPlan } from './prepare-cutover.mjs';
import { renderHeaders } from './seo.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uu-v2-seo-'));
  fs.cpSync(path.join(repoRoot,'v2'),path.join(root,'v2'),{recursive:true});
  fs.mkdirSync(path.join(root,'assets'),{recursive:true});
  fs.cpSync(path.join(repoRoot,'assets/images'),path.join(root,'assets/images'),{recursive:true});
  fs.mkdirSync(path.join(root,'functions/_generated'),{recursive:true});
  return root;
}

const page = (root, rel) => fs.readFileSync(path.join(root,'v2-preview',rel),'utf8');

test('Phase II.7 emits final sitemap, robots, headers and explicit V1 redirects', () => {
  const result=buildV2(repoRoot,{check:true});
  const sitemap=result.outputs.get('sitemap.xml');
  const robots=result.outputs.get('robots.txt');
  const headers=result.outputs.get('_headers');
  const redirects=result.outputs.get('_redirects');
  assert.match(sitemap,/https:\/\/shopuyenuong\.vn\/banh-phu-the\//);
  assert.doesNotMatch(sitemap,/\.html|\/gio-hang\/|\/dat-hang\/|\/admin\//);
  assert.match(robots,/Disallow: \/admin\//);
  assert.match(robots,/Disallow: \/api\//);
  assert.match(robots,/Sitemap: https:\/\/shopuyenuong\.vn\/sitemap\.xml/);
  assert.match(headers,/\/admin\/\*/);
  assert.match(headers,/X-Robots-Tag: noindex, nofollow/);
  assert.match(headers,/\/gio-hang\/\*/);
  assert.match(headers,/\/dat-hang\/\*/);
  assert.match(redirects,/\/san-pham\/banh-phu-the-hue-tphcm\.html \/banh-phu-the\/ 301/);
  assert.match(redirects,/\/cam-nang\/goi-y-chon-mam-qua-4-mam-va-6-mam\.html \/cam-nang\/kinh-nghiem-chon-mam-qua-cuoi-cho-gia-dinh\/ 301/);
});


test('Preview deployment target adds global noindex without changing Production headers', () => {
  const production=renderHeaders();
  const preview=renderHeaders({preview:true});
  assert.doesNotMatch(production,/^\/\*\n/m);
  assert.match(preview,/^\/\*\n  X-Robots-Tag: noindex, nofollow/m);
  assert.match(preview,/\/admin\/\*/);
  assert.match(preview,/\/gio-hang\/\*/);
  assert.match(preview,/\/dat-hang\/\*/);
});

test('slug change keeps stable content ID, generates direct 301, and removes old canonical from sitemap', () => {
  const root=fixture();
  try {
    const file=path.join(root,'v2/content/products/banh-phu-the.json');
    const product=JSON.parse(fs.readFileSync(file,'utf8'));
    product.slug='banh-phu-the-moi';
    product.previous_slugs=['banh-phu-the'];
    fs.writeFileSync(file,`${JSON.stringify(product,null,2)}\n`);
    buildV2(root);
    assert.ok(fs.existsSync(path.join(root,'v2-preview/banh-phu-the-moi/index.html')));
    assert.equal(fs.existsSync(path.join(root,'v2-preview/banh-phu-the/index.html')),false);
    const redirects=page(root,'_redirects');
    const sitemap=page(root,'sitemap.xml');
    const html=page(root,'banh-phu-the-moi/index.html');
    assert.match(redirects,/\/banh-phu-the\/ \/banh-phu-the-moi\/ 301/);
    assert.match(redirects,/\/san-pham\/banh-phu-the-tphcm\.html \/banh-phu-the-moi\/ 301/);
    assert.match(sitemap,/\/banh-phu-the-moi\//);
    assert.doesNotMatch(sitemap,/\/banh-phu-the\//);
    assert.match(html,/canonical" href="https:\/\/shopuyenuong\.vn\/banh-phu-the-moi\/"/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('article slug change preserves related references by stable article ID and redirects old URLs', () => {
  const root=fixture();
  try {
    const file=path.join(root,'v2/content/articles/mam-qua-cuoi-thuong-co-nhung-gi.json');
    const article=JSON.parse(fs.readFileSync(file,'utf8'));
    article.slug='mam-qua-cuoi-co-nhung-gi';
    article.previous_slugs=['mam-qua-cuoi-thuong-co-nhung-gi'];
    fs.writeFileSync(file,`${JSON.stringify(article,null,2)}\n`);
    buildV2(root);
    const redirects=page(root,'_redirects');
    const related=page(root,'cam-nang/kinh-nghiem-chon-mam-qua-cuoi-cho-gia-dinh/index.html');
    assert.match(redirects,/\/cam-nang\/mam-qua-cuoi-thuong-co-nhung-gi\/ \/cam-nang\/mam-qua-cuoi-co-nhung-gi\/ 301/);
    assert.match(redirects,/\/cam-nang\/mam-qua-cuoi-gom-nhung-gi\.html \/cam-nang\/mam-qua-cuoi-co-nhung-gi\/ 301/);
    assert.match(related,/\/cam-nang\/mam-qua-cuoi-co-nhung-gi\//);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('cart/order/admin are noindex and V2 APIs declare X-Robots-Tag in response helpers', () => {
  const result=buildV2(repoRoot,{check:true});
  assert.match(result.outputs.get('gio-hang/index.html'),/name="robots" content="noindex,follow"/);
  assert.match(result.outputs.get('dat-hang/index.html'),/name="robots" content="noindex,follow"/);
  assert.match(result.outputs.get('admin/index.html'),/name="robots" content="noindex,nofollow"/);
  const orderApi=fs.readFileSync(path.join(repoRoot,'functions/api/v2/orders/index.js'),'utf8');
  const adminShared=fs.readFileSync(path.join(repoRoot,'functions/_shared/v2-admin-github.js'),'utf8');
  assert.match(orderApi,/X-Robots-Tag': 'noindex, nofollow'/);
  assert.match(adminShared,/X-Robots-Tag':'noindex, nofollow'/);
});

test('cutover plan is prepare-only and never instructs Phase II.7 to delete V1 or migrate D1', () => {
  const plan=createCutoverPlan(repoRoot);
  assert.equal(plan.mode,'prepare-only');
  assert.equal(plan.production_domain,'https://shopuyenuong.vn');
  assert.ok(plan.generated_root_files.includes('_redirects'));
  assert.ok(plan.generated_root_files.includes('_headers'));
  assert.ok(plan.legacy_paths_to_replace_at_cutover.includes('san-pham/'));
  assert.ok(plan.preserve_without_migration.includes('D1 orders data'));
  assert.match(plan.rollback.join(' '),/commit Production .*trước cutover/);
});


test('every legacy V1 public HTML route is covered by a permanent redirect', () => {
  const result=buildV2(repoRoot,{check:true});
  const redirects=result.outputs.get('_redirects');
  const sources=new Set(
    redirects.split(/\r?\n/)
      .map(line=>line.trim())
      .filter(Boolean)
      .map(line=>line.split(/\s+/)[0])
  );
  const roots=['index.html','gio-hang.html','dat-hang.html'];
  const directories=['san-pham','cam-nang','chuyen-muc'];
  const legacy=[...roots];
  for (const dir of directories) {
    for (const name of fs.readdirSync(path.join(repoRoot,dir))) {
      if (name.endsWith('.html')) legacy.push(`${dir}/${name}`);
    }
  }
  for (const relative of legacy) {
    assert.ok(sources.has(`/${relative}`),`Missing redirect for /${relative}`);
  }
});

test('every sitemap URL resolves to generated HTML with the same canonical URL', () => {
  const result=buildV2(repoRoot,{check:true});
  const sitemap=result.outputs.get('sitemap.xml');
  const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
  assert.ok(locs.length>0,'Sitemap should contain URLs');
  for (const loc of locs) {
    const url=new URL(loc);
    assert.equal(url.origin,'https://shopuyenuong.vn');
    const rel=url.pathname==='/'?'index.html':`${url.pathname.replace(/^\//,'')}index.html`;
    const html=result.outputs.get(rel);
    assert.ok(html,`Missing generated page for ${url.pathname}`);
    const escaped=loc.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(html,new RegExp(`<link rel="canonical" href="${escaped}">`),`Canonical mismatch for ${url.pathname}`);
  }
});
