import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildV2, repoRoot } from './build.mjs';
import { loadV2Content } from './schema.mjs';
import { getConfig, normalizeUploadName, detectImageType, saveDocument, validateDocument } from '../../functions/_shared/v2-admin-github.js';
import { onRequestPost as contentPost } from '../../functions/admin/api/v2/content/index.js';

const read = p => fs.readFileSync(path.join(repoRoot,p),'utf8');

const adminRoutes = [
  'admin/index.html','admin/products/index.html','admin/products/edit/index.html','admin/media/index.html',
  'admin/articles/index.html','admin/articles/edit/index.html','admin/categories/index.html','admin/orders/index.html','admin/settings/index.html'
];

test('Phase II.5 emits all nine locked Admin routes with noindex and one Admin shell', () => {
  const result = buildV2(repoRoot,{check:true});
  for (const route of adminRoutes) {
    const html = result.outputs.get(route);
    assert.ok(html, route);
    assert.match(html,/name="robots" content="noindex,nofollow"/);
    assert.match(html,/class="admin-sidebar"/);
    assert.match(html,/class="admin-topbar"/);
    assert.match(html,/Be\+Vietnam\+Pro/);
    assert.doesNotMatch(html,/Playfair|Pages CMS|GitHub|Cloudflare|Dịch vụ cưới|Khách hàng|admin@/i);
  }
});



test('Admin external/new-tab links always use rel=noopener', () => {
  const result = buildV2(repoRoot,{check:true});
  for (const route of adminRoutes) {
    const html = result.outputs.get(route) || '';
    const links = [...html.matchAll(/<a\b[^>]*target=\"_blank\"[^>]*>/gi)].map(match => match[0]);
    for (const link of links) assert.match(link,/rel=\"[^\"]*noopener[^\"]*\"/i,`${route}: ${link}`);
  }
});
test('Admin navigation is consistent and contains only the seven approved areas', () => {
  const html = buildV2(repoRoot,{check:true}).outputs.get('admin/index.html');
  for (const label of ['Tổng quan','Sản phẩm','Hình ảnh &amp; Media','Cẩm nang','Chuyên mục','Yêu cầu đặt hàng','Cài đặt cửa hàng']) assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/Analytics|Customers|Revenue|Messages|Billing|Security/i);
  assert.doesNotMatch(html,/class="nav-badge"|>Mới<\/b>/);
});

test('Admin Product Editor supports simple, variant and composite without legacy rules', () => {
  const html = buildV2(repoRoot,{check:true}).outputs.get('admin/products/edit/index.html');
  for (const label of ['Cơ bản','Có tùy chọn','Phức hợp','Tùy chọn sản phẩm','Lễ vật / thành phần','Số lượng','Gợi ý dưới số lượng','Giá theo quy cách','Quy tắc giá','Thông tin sản phẩm','Nội dung liên quan','SEO']) assert.match(html,new RegExp(label));
  for (const legacy of ['Huế','Miền Bắc','Song Hỷ','4 mâm','6 mâm','8 mâm','minimum 20']) assert.doesNotMatch(html,new RegExp(legacy,'i'));
});

test('Admin CSS includes mobile drawer, one-column editors and two-column media grid', () => {
  const css=read('v2/assets/css/admin.css');
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.admin-sidebar\.open/);
  assert.match(css,/\.editor-layout\{grid-template-columns:1fr\}/);
  assert.match(css,/\.media-grid\{grid-template-columns:repeat\(2,1fr\)/);
  assert.match(css,/prefers-reduced-motion/);
});

test('Admin client has no Pages CMS/Git/Cloudflare terminology and uses internal V2 APIs', () => {
  const source=read('v2/assets/js/admin.js');
  assert.doesNotMatch(source,/Pages CMS|GitHub|Cloudflare|branch|commit/i);
  assert.match(source,/\/admin\/api\/v2\/content/);
  assert.match(source,/\/admin\/api\/v2\/media/);
  assert.match(source,/\/admin\/api\/orders/);
});

test('content validation keeps stable IDs while allowing a public slug change', () => {
  const { products } = loadV2Content(repoRoot);
  const source = structuredClone(products.find(p=>p.id==='banh-phu-the'));
  source.id='banh-moi'; source.slug='banh-moi'; source.previous_slugs=[]; source.name='Bánh mới'; source.status='draft'; source.related_products=[]; source.related_articles=[];
  assert.equal(validateDocument('products',source).slug,'banh-moi');
  const changed={...source,slug:'banh-khac'};
  assert.equal(validateDocument('products',changed,'banh-moi').slug,'banh-khac');
  assert.throws(()=>validateDocument('products',{...changed,id:'id-khac'},'banh-moi'),/ID sản phẩm phải ổn định/);
});

test('Admin backend accepts the approved bánh phục linh hybrid price rules without losing them', () => {
  const { products } = loadV2Content(repoRoot);
  const product = structuredClone(products.find(p => p.id === 'banh-phuc-linh'));
  const validated = validateDocument('products', product, 'banh-phuc-linh');
  assert.equal(validated.price.mode, 'hybrid');
  assert.deepEqual(validated.price.rules.map(rule => [rule.option_id, rule.quantity, rule.amount]), [['2-vi',30,180000],['2-vi',50,230000]]);
  const invalid = structuredClone(product);
  invalid.price.rules[0].option_id = 'khong-ton-tai';
  assert.throws(() => validateDocument('products', invalid, 'banh-phuc-linh'), /option_id|không tồn tại|không hợp lệ/i);
});

test('Preview branch safety never falls back silently to main', () => {
  assert.throws(()=>getConfig(new Request('https://abc123.uyenuong-shop.pages.dev/admin/api/v2/content'),{GITHUB_CONTENT_TOKEN:'x'}),/nhánh Preview/);
  const cfg=getConfig(new Request('https://abc123.uyenuong-shop.pages.dev/admin/api/v2/content'),{GITHUB_CONTENT_TOKEN:'x',GITHUB_CONTENT_BRANCH:'preview-v2'});
  assert.equal(cfg.branch,'preview-v2');
  assert.equal(getConfig(new Request('https://shopuyenuong.vn/admin/api/v2/content'),{GITHUB_CONTENT_TOKEN:'x'}).branch,'main');
});

test('saveDocument creates Product D through GitHub Contents API without arbitrary paths', async () => {
  const { products }=loadV2Content(repoRoot);
  const data=structuredClone(products[0]); data.id='banh-moi';data.slug='banh-moi';data.name='Bánh mới';data.status='draft';data.related_products=[];data.related_articles=[];
  const calls=[]; const original=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{calls.push({url:String(url),method:options.method||'GET',body:options.body});if((options.method||'GET')==='GET')return Response.json({message:'Not Found'},{status:404});return Response.json({content:{sha:'a'.repeat(40)},commit:{sha:'b'.repeat(40)}},{status:201});};
  try {
    const result=await saveDocument({token:'t',branch:'preview-v2'},{kind:'products',slug:'banh-moi',sha:null,data});
    assert.equal(result.created,true);
    assert.match(calls.at(-1).url,/v2\/content\/products\/banh-moi\.json$/);
    assert.equal(JSON.parse(calls.at(-1).body).branch,'preview-v2');
  } finally { globalThis.fetch=original; }
});


test('saveDocument records the old public slug as redirect history without renaming the storage file', async () => {
  const { products } = loadV2Content(repoRoot);
  const current = structuredClone(products.find(p=>p.id==='banh-phu-the'));
  const changed = {...current, slug:'banh-phu-the-moi'};
  const currentSha='a'.repeat(40);
  const calls=[]; const original=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{
    const href=String(url); calls.push({href,method:options.method||'GET',body:options.body});
    if((options.method||'GET')==='GET' && href.includes('/contents/v2/content/products/banh-phu-the.json?')){
      return Response.json({type:'file',encoding:'base64',content:Buffer.from(JSON.stringify(current)).toString('base64'),sha:currentSha});
    }
    if((options.method||'GET')==='GET' && href.includes('/contents/v2/content/products?')) return Response.json([]);
    if((options.method||'GET')==='PUT') return Response.json({content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}});
    return Response.json({message:'Not Found'},{status:404});
  };
  try {
    const result=await saveDocument({token:'t',branch:'preview-v2'},{kind:'products',slug:'banh-phu-the',sha:currentSha,data:changed});
    assert.match(result.path,/v2\/content\/products\/banh-phu-the\.json$/);
    assert.equal(result.public_slug,'banh-phu-the-moi');
    const put=calls.find(call=>call.method==='PUT');
    const saved=JSON.parse(Buffer.from(JSON.parse(put.body).content,'base64').toString('utf8'));
    assert.deepEqual(saved.previous_slugs,['banh-phu-the']);
    assert.equal(saved.id,'banh-phu-the');
  } finally { globalThis.fetch=original; }
});
test('Admin content POST rejects cross-origin writes before touching GitHub', async () => {
  const request=new Request('https://shopuyenuong.vn/admin/api/v2/content',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});
  const response=await contentPost({request,env:{GITHUB_CONTENT_TOKEN:'x'}});
  assert.equal(response.status,403);
});

test('media filename normalization and magic detection are deterministic', () => {
  assert.equal(normalizeUploadName('Bánh Phu Thê 01.JPG'),'banh-phu-the-01');
  assert.equal(detectImageType(Uint8Array.from([0xff,0xd8,0xff,0x00])).ext,'.jpg');
  assert.equal(detectImageType(Uint8Array.from([0x89,0x50,0x4e,0x47])).ext,'.png');
  assert.equal(detectImageType(Uint8Array.from([0x00,0x00,0x00,0x00])),null);
});

test('R3 Admin order UI renders D1 orders with shared order labels on dashboard and order page', () => {
  const result = buildV2(repoRoot,{check:true});
  const dashboard = result.outputs.get('admin/index.html');
  const ordersPage = result.outputs.get('admin/orders/index.html');
  const source = read('v2/assets/js/admin.js');

  assert.match(dashboard, /"orderLabels":\{"new":"Mới"/);
  assert.match(ordersPage, /"orderLabels":\{"new":"Mới"/);
  assert.match(source, /const orderLabels = pageData\.orderLabels \|\|/);
  assert.match(source, /function orderRow\(order\)/);
  assert.match(source, /orders\.map\(orderRow\)/);
  assert.match(source, /Object\.entries\(orderLabels\)/);
  assert.match(source, /href=\"\/admin\/orders\/\?id=\$\{encodeURIComponent\(o\.id\)\}\"/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\('id'\)/);
  assert.match(source, /if\(requestedId\)\{const id=requestedId;requestedId=null;await show\(id\);\}/);
  assert.doesNotMatch(source, /statusLabels\[o\.status\]/);
});
