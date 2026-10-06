import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyDataUiLock } from './check-data-ui-lock.mjs';
import { promoteV2 } from './promote-v2.mjs';
import { getPublishStatus } from '../functions/_shared/v2-admin-github.js';
import { processOrder } from '../functions/api/v2/orders/index.js';
import { onRequest as legacyOrders } from '../functions/api/orders/index.js';
import { onRequest as legacySendOrder } from '../functions/api/send-order.js';
import { onRequestGet as facebookLatest } from '../functions/api/facebook-latest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function write(base, relative, content='x') {
  const target = path.join(base, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test('infra package preserves the complete locked DATA/UI baseline before future Admin content changes', () => {
  const result = verifyDataUiLock(root, { mode:'baseline' });
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('all eight source images required by clean V2 build exist at managed root paths', () => {
  const expected = [
    'assets/images/logo.jpg','assets/images/logo-header.jpg',
    'assets/images/products/banh-phu-the.jpg','assets/images/products/banh-phuc-linh.jpg','assets/images/products/mam-qua-cuoi.jpg',
    'assets/images/articles/kinh-nghiem-chon-mam-qua-cuoi-cho-gia-dinh.jpg',
    'assets/images/articles/mam-qua-cuoi-thuong-co-nhung-gi.jpg',
    'assets/images/articles/nen-chuan-bi-so-luong-banh-phu-the-bao-nhieu.jpg'
  ];
  for (const relative of expected) assert.ok(fs.statSync(path.join(root, relative)).size > 1000, relative);
});

test('legacy public order endpoints are disabled with customer-safe messages', async () => {
  for (const handler of [legacyOrders, legacySendOrder]) {
    const response = await handler({ request:new Request('https://uyenuong-shop.pages.dev/api/orders') });
    assert.equal(response.status, 410);
    const body = await response.json();
    const text = JSON.stringify(body).toLowerCase();
    assert.doesNotMatch(text,/d1|token|cloudflare|github|endpoint|cấu hình/);
  }
});

test('V2 order endpoint hides infrastructure details when D1 is unavailable', async () => {
  const response = await processOrder({ request:new Request('https://uyenuong-shop.pages.dev/api/v2/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}), env:{} });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.doesNotMatch(body.message,/D1|DB|cấu hình|Cloudflare|binding/i);
  assert.match(body.message,/Zalo|gọi|tạm thời/i);
});

test('Facebook latest endpoint keeps the Page token server-side and returns only two public posts', async () => {
  const original = globalThis.fetch;
  const seen = {};
  globalThis.fetch = async (url, options = {}) => {
    seen.url = String(url);
    seen.authorization = options.headers?.Authorization;
    return Response.json({ data:[
      { id:'1', message:'Bài một', created_time:'2026-10-01T08:00:00+0000', permalink_url:'https://www.facebook.com/example/posts/1', full_picture:'https://scontent.example/1.jpg' },
      { id:'2', message:'Bài hai', created_time:'2026-09-30T08:00:00+0000', permalink_url:'https://www.facebook.com/example/posts/2', full_picture:'https://scontent.example/2.jpg' },
      { id:'3', message:'Bài ba', created_time:'2026-09-29T08:00:00+0000', permalink_url:'https://www.facebook.com/example/posts/3' }
    ] });
  };
  try {
    const response = await facebookLatest({ env:{ FACEBOOK_PAGE_ID:'737754799598805', FACEBOOK_PAGE_ACCESS_TOKEN:'server-secret-token' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.posts.length, 2);
    assert.equal(body.page_url, 'https://www.facebook.com/737754799598805');
    assert.equal(seen.authorization, 'Bearer server-secret-token');
    assert.doesNotMatch(seen.url, /server-secret-token/);
    assert.doesNotMatch(JSON.stringify(body), /server-secret-token/);
  } finally { globalThis.fetch = original; }
});

test('Facebook latest endpoint resolves repost text from original post or attachment without inventing copy', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    seen.push({ href, authorization:options.headers?.Authorization });
    if (href.includes('/737754799598805/posts')) {
      return Response.json({ data:[
        {
          id:'new-1',
          message:'',
          story:'Shop Uyên Ương shared a post.',
          parent_id:'737754799598805_old-1',
          created_time:'2026-09-27T08:00:00+0000',
          permalink_url:'https://www.facebook.com/example/posts/new-1',
          full_picture:'https://scontent.example/new-1.jpg',
          attachments:{ data:[{ description:'Nội dung attachment không được ưu tiên khi đọc được bài gốc.' }] }
        },
        {
          id:'new-2',
          message:'',
          story:'Shop Uyên Ương shared a post.',
          created_time:'2026-09-27T07:00:00+0000',
          permalink_url:'https://www.facebook.com/example/posts/new-2',
          full_picture:'https://scontent.example/new-2.jpg',
          attachments:{ data:[{ description:'#banhphuthehcm Nhận đặt bánh phu thê lá dừa truyền thống.' }] }
        }
      ] });
    }
    if (href.includes('/737754799598805_old-1')) {
      return Response.json({ message:'#banhphuthehcm Mời mọi người đặt bánh phu thê sợi dừa gốc Huế ạ.' });
    }
    return new Response('Not found', { status:404 });
  };
  try {
    const response = await facebookLatest({ env:{ FACEBOOK_PAGE_ID:'737754799598805', FACEBOOK_PAGE_ACCESS_TOKEN:'server-secret-token' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.posts[0].message, '#banhphuthehcm Mời mọi người đặt bánh phu thê sợi dừa gốc Huế ạ.');
    assert.equal(body.posts[1].message, '#banhphuthehcm Nhận đặt bánh phu thê lá dừa truyền thống.');
    assert.equal(seen.length, 2);
    assert.ok(seen.every(call => call.authorization === 'Bearer server-secret-token'));
    assert.ok(seen[0].href.includes('story%2Cparent_id') || seen[0].href.includes('story%2Cparent_id'.replace('%2C', ',')));
    assert.ok(seen[0].href.includes('attachments%7Bdescription%7D') || seen[0].href.includes('attachments{description}'));
    assert.doesNotMatch(JSON.stringify(body), /shared a post|không được ưu tiên/);
  } finally { globalThis.fetch = original; }
});

test('Facebook latest endpoint leaves message empty when repost text is unavailable', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const href = String(url);
    if (href.includes('/737754799598805/posts')) {
      return Response.json({ data:[{
        id:'new-3',
        message:'',
        story:'Shop Uyên Ương shared a post.',
        parent_id:'737754799598805_missing',
        created_time:'2026-09-27T06:00:00+0000',
        permalink_url:'https://www.facebook.com/example/posts/new-3',
        full_picture:'https://scontent.example/new-3.jpg'
      }] });
    }
    return new Response(JSON.stringify({ error:{ message:'Not readable' } }), { status:403, headers:{'Content-Type':'application/json'} });
  };
  try {
    const response = await facebookLatest({ env:{ FACEBOOK_PAGE_ID:'737754799598805', FACEBOOK_PAGE_ACCESS_TOKEN:'server-secret-token' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.posts.length, 1);
    assert.equal(body.posts[0].message, '');
  } finally { globalThis.fetch = original; }
});

test('Facebook latest endpoint fails closed without exposing infrastructure or upstream errors', async () => {
  const missing = await facebookLatest({ env:{} });
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { success:false, posts:[] });

  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error:{ message:'OAuth secret failure' } }), { status:500, headers:{'Content-Type':'application/json'} });
  try {
    const response = await facebookLatest({ env:{ FACEBOOK_PAGE_ID:'737754799598805', FACEBOOK_PAGE_ACCESS_TOKEN:'server-secret-token' } });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.deepEqual(body, { success:false, posts:[] });
    assert.doesNotMatch(JSON.stringify(body), /oauth|secret|token|facebook/i);
  } finally { globalThis.fetch = original; }
});

test('Admin publish status watches only the production workflow on main', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async url => { seen.push(String(url)); return Response.json({workflow_runs:[]}); };
  try {
    await getPublishStatus({token:'t',branch:'main',production:true});
  } finally { globalThis.fetch = original; }
  assert.equal(seen.length,1);
  assert.match(seen[0],/rebuild-v2-production\.yml/);
  assert.doesNotMatch(seen[0],/rebuild-v2-preview\.yml/);
});

test('production workflow is Node 24, lock-gated, fully tested and promotes with allowlisted script', () => {
  const workflow = fs.readFileSync(path.join(root,'.github/workflows/rebuild-v2-production.yml'),'utf8');
  assert.match(workflow,/node-version:\s*'24'/);
  assert.match(workflow,/check-data-ui-lock\.mjs --mode=immutable/);
  assert.match(workflow,/node v2\/scripts\/build\.mjs --check/);
  assert.match(workflow,/node v2\/scripts\/build\.mjs/);
  assert.match(workflow,/node infra\/run-v2-tests\.mjs/);
  assert.match(workflow,/node v2\/scripts\/preview-qa\.mjs/);
  assert.match(workflow,/node infra\/promote-v2\.mjs/);
  assert.match(workflow,/functions\/_shared\/\*\*/);
  assert.match(workflow,/functions\/admin\/\*\*/);
  assert.match(workflow,/functions\/api\/\*\*/);
  assert.match(workflow,/git add -A/);
  assert.doesNotMatch(workflow,/rm\s+-rf\s+\.\s*(?:$|\n)/m);
});

test('promotion removes only known legacy and preserves protected source/runtime areas', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'uu-promote-'));
  try {
    write(temp,'v2/keep.txt','source');
    write(temp,'functions/keep.js','runtime');
    write(temp,'infra/keep.mjs','infra');
    write(temp,'assets/images/products/unused.jpg','unused-source');
    write(temp,'san-pham/old.html','legacy');
    write(temp,'content/old.json','legacy');
    write(temp,'assets/js/app.js','legacy');
    write(temp,'assets/images/Anh1.jpg','legacy-image');
    write(temp,'.github/workflows/rebuild-content.yml','legacy');
    write(temp,'cam-nang/mam-qua-cuoi-gom-nhung-gi.html','legacy');
    write(temp,'v2-preview/index.html','new-home');
    write(temp,'v2-preview/_redirects','/old /new 301');
    write(temp,'v2-preview/admin/index.html','new-admin');
    write(temp,'v2-preview/cam-nang/index.html','new-guide');
    write(temp,'v2-preview/assets/css/site.css','css');
    write(temp,'v2-preview/assets/js/site.js','js');
    write(temp,'v2-preview/assets/images/products/used.jpg','used');
    const result = promoteV2(temp);
    assert.ok(result.copied >= 7);
    assert.equal(fs.readFileSync(path.join(temp,'v2/keep.txt'),'utf8'),'source');
    assert.equal(fs.readFileSync(path.join(temp,'functions/keep.js'),'utf8'),'runtime');
    assert.equal(fs.readFileSync(path.join(temp,'assets/images/products/unused.jpg'),'utf8'),'unused-source');
    assert.equal(fs.existsSync(path.join(temp,'san-pham')),false);
    assert.equal(fs.existsSync(path.join(temp,'content')),false);
    assert.equal(fs.existsSync(path.join(temp,'assets/images/Anh1.jpg')),false);
    assert.equal(fs.existsSync(path.join(temp,'.github/workflows/rebuild-content.yml')),false);
    assert.equal(fs.existsSync(path.join(temp,'cam-nang/mam-qua-cuoi-gom-nhung-gi.html')),false);
    assert.equal(fs.readFileSync(path.join(temp,'index.html'),'utf8'),'new-home');
    assert.equal(fs.readFileSync(path.join(temp,'admin/index.html'),'utf8'),'new-admin');
    assert.equal(fs.readFileSync(path.join(temp,'assets/images/products/used.jpg'),'utf8'),'used');
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});


test('immutable lock allows Admin-managed content but rejects UI code drift', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'uu-lock-'));
  try {
    fs.cpSync(path.join(root,'v2'), path.join(temp,'v2'), { recursive:true });
    fs.copyFileSync(path.join(root,'DATA_UI_LOCK_SHA256.txt'), path.join(temp,'DATA_UI_LOCK_SHA256.txt'));
    const product = path.join(temp,'v2/content/products/banh-phu-the.json');
    const data = JSON.parse(fs.readFileSync(product,'utf8'));
    data.featured = !data.featured;
    fs.writeFileSync(product, `${JSON.stringify(data,null,2)}\n`);
    assert.equal(verifyDataUiLock(temp,{mode:'immutable'}).ok,true);
    fs.appendFileSync(path.join(temp,'v2/assets/css/site.css'),'\n/* unauthorized drift */\n');
    const drift = verifyDataUiLock(temp,{mode:'immutable'});
    assert.equal(drift.ok,false);
    assert.ok(drift.failures.some(item => item.includes('v2/assets/css/site.css')));
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

test('promotion manifest removes obsolete generated routes on later Admin rebuilds', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'uu-promote-next-'));
  try {
    write(temp,'v2-preview/index.html','home-1');
    write(temp,'v2-preview/_redirects','');
    write(temp,'v2-preview/admin/index.html','admin');
    write(temp,'v2-preview/san-pham-moi/index.html','old-route');
    promoteV2(temp);
    assert.equal(fs.readFileSync(path.join(temp,'san-pham-moi/index.html'),'utf8'),'old-route');
    fs.rmSync(path.join(temp,'v2-preview'),{recursive:true,force:true});
    write(temp,'v2-preview/index.html','home-2');
    write(temp,'v2-preview/_redirects','');
    write(temp,'v2-preview/admin/index.html','admin');
    write(temp,'v2-preview/san-pham-doi-slug/index.html','new-route');
    promoteV2(temp);
    assert.equal(fs.existsSync(path.join(temp,'san-pham-moi')),false);
    assert.equal(fs.readFileSync(path.join(temp,'san-pham-doi-slug/index.html'),'utf8'),'new-route');
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
