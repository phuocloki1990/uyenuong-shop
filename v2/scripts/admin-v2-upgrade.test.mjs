import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateContentHtml, imagePathsFromHtml} from './safe-html.mjs';
import {loadV2Content} from './schema.mjs';
import {buildV2} from './build.mjs';
import {onRequestPatch} from '../../functions/admin/api/orders/[id].js';
import {onRequestGet as onOrderList} from '../../functions/admin/api/orders/index.js';
import {onRequestGet as contentGet, onRequestPost as contentPost} from '../../functions/admin/api/v2/content/index.js';
import {validateDocument} from '../../functions/_shared/v2-admin-github.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const site=JSON.parse(fs.readFileSync(path.join(root,'v2/content/settings/site.json'),'utf8'));
const fixtureHtml='<h2>Fixture heading</h2><p>Vietnamese nội dung <strong>đậm</strong> and <em>nghiêng</em>.</p><p><a href="/lien-he/">Liên hệ</a></p><table><tbody><tr><th scope="col">Loại</th><td>Bảng</td></tr></tbody></table><figure><img src="/assets/images/products/banh-phu-the.jpg" alt="Ảnh fixture" loading="lazy"></figure><p><a class="article-btn" href="/lien-he/">CTA</a></p>';

function createContentFixture(kind,slug,html=fixtureHtml){
 const {products,articles}=loadV2Content(root);
 const data=structuredClone(kind==='products'?products[0]:articles[0]);
 data.id=slug;data.slug=slug;data.previous_slugs=[];data.status='published';data.content_html=html;
 if(kind==='products'){data.name='QA fixture product';data.related_products=[];data.related_articles=[];}
 else {data.title='QA fixture article';data.related_products=[];data.related_articles=[];}
 return {data,products,articles};
}

function githubContentsMock(){
 const records=new Map(),writes=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const href=String(url),method=options.method||'GET';
  if(method==='PUT'){
   const payload=JSON.parse(options.body),path=new URL(href).pathname.replace('/repos/phuocloki1990/uyenuong-shop/contents/','');
   const sha='a'.repeat(40);records.set(path,{content:payload.content,sha});writes.push({path,payload});
   return Response.json({content:{sha},commit:{sha:'b'.repeat(40)}},{status:201});
  }
  const match=href.match(/\/contents\/(v2\/content\/[^?]+)\?ref=/);
  if(match){
   const path=match[1],record=records.get(path);
   if(record)return Response.json({type:'file',encoding:'base64',content:record.content,sha:record.sha});
   if(path.endsWith('.json'))return Response.json({message:'Not Found'},{status:404});
   return Response.json([]);
  }
  return Response.json({message:'Not Found'},{status:404});
 };
 return {records,writes,restore(){globalThis.fetch=original;}};
}

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

test('Article and product rich HTML completes validate, mocked save, readback, build-render and display',async()=>{
 const mock=githubContentsMock(),tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'uu-rich-html-pipeline-'));
 fs.cpSync(path.join(root,'v2'),path.join(tempRoot,'v2'),{recursive:true});
 fs.cpSync(path.join(root,'assets/images'),path.join(tempRoot,'assets/images'),{recursive:true});
 try{
  for(const kind of ['articles','products']){
   const slug=`qa-rich-${kind==='articles'?'article':'product'}`;
   const {data}=createContentFixture(kind,slug);
   const request=new Request('https://uyenuong-shop.pages.dev/admin/api/v2/content',{
    method:'POST',headers:{Origin:'https://uyenuong-shop.pages.dev','Content-Type':'application/json'},
    body:JSON.stringify({kind,slug,sha:null,confirm_write:true,data})
   });
   const saved=await contentPost({request,env:{GITHUB_CONTENT_TOKEN:'mock-token'}});
   assert.equal(saved.status,200,`${kind} mock save`);
   const response=await contentGet({request:new Request(`https://uyenuong-shop.pages.dev/admin/api/v2/content?kind=${kind}&slug=${slug}`),env:{GITHUB_CONTENT_TOKEN:'mock-token'}});
   assert.equal(response.status,200,`${kind} readback`);
   const readBack=(await response.json()).data;
   assert.equal(readBack.content_html,fixtureHtml,`${kind} canonical HTML readback`);
   const contentFile=path.join(tempRoot,'v2/content',kind,`${slug}.json`);
   fs.writeFileSync(contentFile,`${JSON.stringify(readBack,null,2)}\n`);
   const outputs=buildV2(tempRoot,{check:true}).outputs;
   const route=kind==='articles'?`cam-nang/${slug}/index.html`:`${slug}/index.html`;
   const rendered=outputs.get(route);
   assert.ok(rendered,`${kind} build route`);
   assert.match(rendered,/<h2>Fixture heading<\/h2>/,`${kind} rendered heading`);
   assert.match(rendered,/href="\/lien-he\/"[^>]*>CTA<\/a>/,`${kind} rendered CTA`);
   assert.match(rendered,/<table><tbody><tr><th scope="col">Loại<\/th><td>Bảng<\/td><\/tr><\/tbody><\/table>/,`${kind} rendered table`);
   assert.equal(mock.writes.filter(write=>write.path===`v2/content/${kind}/${slug}.json`).length,1);
  }
 }finally{mock.restore();fs.rmSync(tempRoot,{recursive:true,force:true});}
});

test('Article and product APIs reject incompatible rich HTML as HTTP 400 without writes',async()=>{
 const mock=githubContentsMock(),originalError=console.error;console.error=()=>{};
 try{
  for(const kind of ['articles','products']){
   for(const [index,html] of [
    '<p><span style="color:red">Styled</span></p>',
    '<p><script>alert(1)</script></p>',
    '<p onclick="alert(1)">Event</p>',
    '<p><a href="javascript:alert(1)">Unsafe link</a></p>'
   ].entries()){
    const slug=`qa-invalid-${kind}-${index}`,{data}=createContentFixture(kind,slug,html);
    const response=await contentPost({request:new Request('https://uyenuong-shop.pages.dev/admin/api/v2/content',{
     method:'POST',headers:{Origin:'https://uyenuong-shop.pages.dev','Content-Type':'application/json'},
     body:JSON.stringify({kind,slug,sha:null,confirm_write:true,data})
    }),env:{GITHUB_CONTENT_TOKEN:'mock-token'}});
    assert.equal(response.status,400,`${kind}: ${html}`);
    assert.match((await response.json()).message,/style|script|onclick|URL/i);
   }
  }
  assert.equal(mock.writes.length,0);
 }finally{mock.restore();console.error=originalError;}
});

test('Rich editor normalization review stays explicit and emitted module is bundled',()=>{
 const admin=fs.readFileSync(path.join(root,'v2/assets/js/admin.js'),'utf8');
 const routes=['admin/articles/edit/index.html','admin/products/edit/index.html'];
 const outputs=buildV2(root,{check:true}).outputs;
 assert.match(admin,/prepareSave:\(\)=>\{const result=reviewNormalization/);
 assert.match(admin,/function reviewNormalization\(/);
 assert.match(admin,/normalizeDialog\.showModal\(\)/);
 assert.match(admin,/pending\.nextMode\)switchMode\(pending\.nextMode,pending\.html,\{dirty:true\}\)/);
 assert.match(admin,/visual\.textContent=value/);
 assert.match(outputs.get('assets/js/admin.js'),/from '\/assets\/js\/safe-html\.mjs'/);
 assert.equal(outputs.get('assets/js/safe-html.mjs'),fs.readFileSync(path.join(root,'v2/scripts/safe-html.mjs'),'utf8'));
 for(const route of routes)assert.match(outputs.get(route),/type="module" src="\/assets\/js\/admin\.js"/);
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
