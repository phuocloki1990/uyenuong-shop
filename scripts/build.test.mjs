import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, quoteProduct } from './build.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
const parse = (root, p) => JSON.parse(read(root, p));
const write = (root, p, value) => fs.writeFileSync(path.join(root, p), JSON.stringify(value, null, 2));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uu-b3-test-'));
  for (const name of ['content', 'index.html']) fs.cpSync(path.join(repo, name), path.join(root, name), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const pfile = 'content/products/banh-phuc-linh.json';
test('real data builds 13 pages; settings, metadata, relationships and bundles are preserved', t => {
  const root = fixture(t), result = build(root);
  assert.equal(result.products, 4); assert.equal(result.articles, 3); assert.equal(result.categories, 6);
  const manifest = parse(root, '.cms-build-manifest.json');
  assert.equal(Object.keys(manifest.pages).length, 15); // 13 HTML + public/private catalogs
  assert.match(read(root, 'scripts/generated/product-catalog.mjs'), /export const products/);
  const html = read(root, 'san-pham/banh-phuc-linh-tphcm.html');
  assert.match(html, /<option value="">-- Chọn --<\/option>/);
  assert.match(html, /180\.000đ \/ quy cách/);
  assert.ok(!html.includes('"@type":"Offer"'));
  const article = read(root, 'cam-nang/nen-dat-banh-phu-the-bao-nhieu-cai.html');
  assert.match(article, /san-pham\/banh-phu-the-hue-tphcm.html/);
  assert.match(article, /chuyen-muc\/banh-cuoi-bai-viet.html/);
  assert.ok(!article.includes('datePublished'));
  assert.equal((read(root, 'sitemap.xml').match(/<loc>/g) || []).length, 14);
  assert.ok(!read(root, 'sitemap.xml').includes('dat-hang'));
  assert.match(read(root, 'index.html'), /rel="canonical"/);
});
test('build is deterministic and check does not write', t => {
  const root = fixture(t); build(root);
  const files = [...Object.keys(parse(root, '.cms-build-manifest.json').pages), 'index.html', '_redirects', 'sitemap.xml', '.cms-build-manifest.json'];
  const before = files.map(p => read(root, p));
  build(root, { check: true }); assert.deepEqual(files.map(p => read(root, p)), before);
  build(root); assert.deepEqual(files.map(p => read(root, p)), before);
});
test('rename removes only owned old page and creates 301; hidden removes published output', t => {
  const root = fixture(t); build(root);
  const p = parse(root, pfile); p.slug = 'phuc-linh-moi'; p.redirect_from = ['/san-pham/banh-phuc-linh-tphcm.html']; write(root, pfile, p);
  const result = build(root);
  assert.ok(result.removed.includes('san-pham/banh-phuc-linh-tphcm.html'));
  assert.match(read(root, '_redirects'), /\/san-pham\/banh-phuc-linh-tphcm.html \/san-pham\/phuc-linh-moi.html 301/);
  assert.ok(!fs.existsSync(path.join(root, 'san-pham/banh-phuc-linh-tphcm.html')));
  p.status = 'hidden'; write(root, pfile, p); build(root);
  assert.ok(!fs.existsSync(path.join(root, 'san-pham/phuc-linh-moi.html')));
  assert.ok(!read(root, '_redirects').includes('phuc-linh-moi'));
  assert.ok(!read(root, 'sitemap.xml').includes('phuc-linh-moi'));
});
test('hidden category hides descendants and all related references', t => {
  const root = fixture(t); build(root);
  const cfile = 'content/categories/cam-nang-cuoi.json', c = parse(root, cfile); c.status = 'hidden'; write(root, cfile, c);
  const result = build(root); assert.equal(result.articles, 0); assert.equal(result.categories, 3);
  assert.ok(!read(root, 'sitemap.xml').includes('/cam-nang/'));
});
test('invalid content leaves all existing generated files untouched', t => {
  const root = fixture(t); build(root);
  const before = read(root, 'index.html'), manifest = read(root, '.cms-build-manifest.json');
  const p = parse(root, pfile); p.category = 'missing'; write(root, pfile, p);
  assert.throws(() => build(root), /Category không tồn tại/);
  assert.equal(read(root, 'index.html'), before); assert.equal(read(root, '.cms-build-manifest.json'), manifest);
});
test('reject duplicate ids, broken references, cycles, malformed types and bad dates', t => {
  const cases = [
    ['content/products/banh-phu-the-hue.json', p => { p.id = 'phuclinh'; }, /trùng id/],
    [pfile, p => { p.related_articles = ['missing']; }, /không tồn tại/],
    ['content/categories/cam-nang-cuoi.json', c => { c.parent = 'mam-qua-cuoi-bai-viet'; }, /vòng lặp/],
    [pfile, p => { p.details = 'bad'; }, /danh sách object/],
    [pfile, p => { p.quantity.step = 0; }, /quantity không hợp lệ/],
    ['content/articles/mam-qua-cuoi-gom-nhung-gi.json', a => { a.published_at = '2026-02-30'; }, /ngày ISO/],
    ['content/articles/mam-qua-cuoi-gom-nhung-gi.json', a => { a.body = '<script>alert(1)</script>'; }, /HTML không hỗ trợ/],
  ];
  for (const [file, mutate, pattern] of cases) {
    const root = fixture(t), x = parse(root, file); mutate(x); write(root, file, x);
    assert.throws(() => build(root), pattern);
  }
});
test('exact hybrid totals, fixed unit totals, incomplete choices and no price extrapolation', t => {
  const root = fixture(t), p = parse(root, pfile);
  assert.equal(quoteProduct(p, { flavor: '2 vị' }, 30), 180000);
  assert.equal(quoteProduct(p, { flavor: '2 vị' }, 50), 230000);
  for (const [choices, qty] of [[{ flavor: '2 vị' }, 60], [{ flavor: '5 vị' }, 30], [{}, 30], [{flavor:'2 vị'},30.5]]) assert.equal(quoteProduct(p, choices, qty), null);
  assert.equal(quoteProduct({...p, price_mode:'fixed',base_price:5000}, {flavor:'2 vị'},30),150000);
});
test('overlapping rules and unsupported option values stop build', t => {
  const root = fixture(t), p = parse(root, pfile);
  p.price_rules.push({label:'ambiguous',when:{qty:30},price:100}); write(root, pfile, p);
  assert.throws(() => build(root), /chồng điều kiện/);
  p.price_rules.pop(); p.price_rules[0].when.flavor = '7 vị'; write(root, pfile, p);
  assert.throws(() => build(root), /không khớp lựa chọn/);
});
test('manual files and edited generated files are protected', t => {
  const root = fixture(t); fs.mkdirSync(path.join(root,'san-pham'));
  fs.writeFileSync(path.join(root,'san-pham/banh-phuc-linh-tphcm.html'),'manual');
  assert.throws(() => build(root), /Không ghi đè/);
  const other = fixture(t); build(other);
  fs.appendFileSync(path.join(other,'san-pham/banh-phuc-linh-tphcm.html'),'manual edit');
  assert.throws(() => build(other), /đã bị sửa/);
});
test('redirect collisions, manual wildcard redirects and path traversal are rejected', t => {
  for (const from of ['/san-pham/mam-qua-cuoi-tphcm.html','/admin/orders.html','/../escape.html']) {
    const root=fixture(t), p=parse(root,pfile); p.redirect_from=[from];write(root,pfile,p);
    assert.throws(()=>build(root),/Redirect đè|redirect_from/);
  }
  const root=fixture(t);fs.writeFileSync(path.join(root,'_redirects'),'/* /index.html 200\n');
  assert.throws(()=>build(root),/thủ công xung đột/);
});
test('manual unrelated redirects survive and explicit duplicate sources fail', t => {
  const root=fixture(t);fs.writeFileSync(path.join(root,'_redirects'),'/old-support /dat-hang.html 301\n');build(root);
  assert.match(read(root,'_redirects'),/^\/old-support \/dat-hang.html 301/);
  for(const file of [pfile,'content/products/mam-qua-cuoi.json']){const p=parse(root,file);p.redirect_from=['/san-pham/old.html'];write(root,file,p);}
  assert.throws(()=>build(root),/trùng nguồn/);
});
test('settings update generated header, footer, home contact and canonical', t => {
  const root=fixture(t);build(root);const file='content/settings/site.json',s=parse(root,file);
  s.phone='0901234567';s.phone_display='0901 234 567';s.zalo_url='https://zalo.me/0901234567';s.site_url='https://example.com';write(root,file,s);build(root);
  for(const file of ['index.html','san-pham/banh-phuc-linh-tphcm.html']){
    const html=read(root,file);assert.match(html,/tel:0901234567/);assert.match(html,/https:\/\/example.com/);assert.ok(!html.includes('zalo.me/0868157858'));
  }
});

test('private order catalog tracks published products and is protected by the manifest', t => {
  const root = fixture(t); build(root);
  const privateFile = 'scripts/generated/product-catalog.mjs';
  assert.match(read(root, privateFile), /"phuthehue"/);
  const p = parse(root, pfile); p.status = 'hidden'; write(root, pfile, p);
  build(root);
  assert.ok(!read(root, privateFile).includes('"phuclinh":'));
  assert.ok(!read(root, 'assets/js/cms-catalog.js').includes('"phuclinh":'));
  fs.appendFileSync(path.join(root, privateFile), '// hand edited');
  assert.throws(() => build(root), /đã bị sửa/);
});
