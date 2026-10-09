import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateContentHtml, imagePathsFromHtml} from './safe-html.mjs';
import {onRequestPatch} from '../../functions/admin/api/orders/[id].js';
import {onRequestGet as onOrderList} from '../../functions/admin/api/orders/index.js';
import {validateDocument} from '../../functions/_shared/v2-admin-github.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const site=JSON.parse(fs.readFileSync(path.join(root,'v2/content/settings/site.json'),'utf8'));

test('Admin V2 accepts structured SEO content and protected CTA HTML without rewriting',()=>{
 const html='<h2>Bánh phu thê</h2><p>Chọn bánh tại TP.HCM.</p><figure><a href="/banh-phu-the/" class="article-btn"><img src="/assets/images/products/banh-phu-the.jpg" alt="Bánh phu thê" loading="lazy"></a><figcaption>Ảnh bánh</figcaption></figure><table><tbody><tr><th>Quy cách</th><td colspan="2">Hộp giấy</td></tr></tbody></table>';
 assert.equal(validateContentHtml(html),html);
 assert.deepEqual(imagePathsFromHtml(html),['/assets/images/products/banh-phu-the.jpg']);
});

test('Admin V2 refuses executable, unsafe or disallowed HTML',()=>{
 for(const html of [
  '<script>alert(1)</script>', '<h1>H1 khác</h1>', '<p onclick="alert(1)">A</p>',
  '<a href="javascript:alert(1)">x</a>', '<img src="data:image/svg+xml,x" alt="a">',
  '<img src="/assets/images/products/a.jpg" onerror="x()" alt="a">',
  '<p style="color:red">A</p>', '<iframe src="https://example.org/"></iframe>',
  '<a href="java&#x73;cript:alert(1)">x</a>', '<p><strong>Thiếu đóng</p>'
 ]) assert.throws(()=>validateContentHtml(html),undefined,html);
});

test('Media metadata is schema-validated without introducing another content file',()=>{
 const valid=structuredClone(site);valid.media_meta={'/assets/images/products/banh-phu-the.jpg':{alt:'Bánh phu thê',caption:'Ảnh sản phẩm'}};
 assert.ok(validateDocument('settings',valid));
 const unsafe=structuredClone(valid);unsafe.media_meta={'../../forged.js':{alt:'x',caption:''}};
 assert.throws(()=>validateDocument('settings',unsafe));
});

test('Order update refuses stale edits and writes only with matching updated_at',async()=>{
 let changes=0,sql='';
 const env={DB:{prepare(query){sql=query;return {bind(...values){return {async first(){return {id:7,updated_at:'2026-10-09 10:00:00'}},async run(){changes++;assert.match(query,/COALESCE\(updated_at/);assert.equal(values[3],'2026-10-09 10:00:00');return {meta:{changes:1}}}}}}}}};
 const request=(updated)=>({async json(){return {status:'processing',internal_note:'Đang xử lý',expected_updated_at:updated}}});
 const stale=await onRequestPatch({params:{id:'7'},request:request('2026-10-08 09:00:00'),env});
 assert.equal(stale.status,409);assert.equal(changes,0);
 const good=await onRequestPatch({params:{id:'7'},request:request('2026-10-09 10:00:00'),env});
 assert.equal(good.status,200);assert.equal(changes,1);
});

test('Order API returns accurate total alongside pagination limit',async()=>{
 const env={DB:{prepare(sql){return {bind(...params){return {async first(){assert.match(sql,/COUNT\(\*\)/);return {total:125}},async all(){assert.match(sql,/LIMIT/);return {results:[]}}}}}}}};
 const response=await onOrderList({request:new Request('https://uyenuong-shop.pages.dev/admin/api/orders?limit=20&offset=40'),env});
 const result=await response.json();assert.equal(result.total,125);assert.equal(result.limit,20);assert.equal(result.offset,40);
});
