import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { productTemplate, checkProductPayload, checkProductReferences } from './product-admin.mjs';
import { onRequestPost } from '../functions/admin/api/products/save.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>JSON.parse(fs.readFileSync(path.join(ROOT,relative),'utf8'));
const item=read('content/products/banh-phu-the-hue.json');
const draft=()=>({...productTemplate(),id:'newcake',name:'Bánh mới',slug:'banh-moi',category:'banh-cuoi-hoi'});
const base64=s=>Buffer.from(s,'utf8').toString('base64');
const unbase64=s=>Buffer.from(s,'base64').toString('utf8');
function mockGithub(t){
  const previous=globalThis.fetch;
  const commits=[];
  const files=new Map();
  for(const branch of ['main','admin-products-final'])for(const kind of ['products','articles','categories']){
    for(const name of fs.readdirSync(path.join(ROOT,'content',kind)).filter(x=>x.endsWith('.json'))){
      files.set(`${branch}/content/${kind}/${name}`,{content:fs.readFileSync(path.join(ROOT,'content',kind,name),'utf8'),sha:'a'.repeat(40)});
    }
  }
  const ghPath=url=>{const u=new URL(url);assert.equal(u.hostname,'api.github.com');const relative=decodeURI(u.pathname.split('/contents/')[1]||'');return {relative,branch:u.searchParams.get('ref')||'admin-products-final'};};
  globalThis.fetch=async(url,options={})=>{
    const {relative,branch}=ghPath(url),method=options.method||'GET';
    if(method==='GET'){
      if(relative.startsWith('assets/images/'))return Response.json({type:'file',path:relative});
      const key=branch+'/'+relative;
      if(files.has(key)){const f=files.get(key);return Response.json({type:'file',encoding:'base64',content:base64(f.content),sha:f.sha,path:relative});}
      const children=[...files.keys()].filter(k=>k.startsWith(branch+'/'+relative+'/')&&!k.slice((branch+'/'+relative+'/').length).includes('/'));
      if(children.length)return Response.json(children.map(k=>({name:k.split('/').at(-1),path:k.slice(branch.length+1),type:'file'})));
      return Response.json({message:'Not Found'},{status:404});
    }
    if(method==='PUT'){
      const input=JSON.parse(options.body),key=branch+'/'+relative;
      if(files.has(key)&&!input.sha)return Response.json({message:'already exists'},{status:422});
      if(!files.has(key)&&input.sha)return Response.json({message:'missing'},{status:409});
      if(files.has(key)&&input.sha!==files.get(key).sha)return Response.json({message:'conflict'},{status:409});
      const sha=String(commits.length+1).padStart(40,'b');files.set(key,{content:unbase64(input.content),sha});commits.push({branch,relative,body:JSON.parse(unbase64(input.content))});
      return Response.json({content:{sha},commit:{sha}});
    }
    throw Error(method+' '+url);
  };
  t.after(()=>{globalThis.fetch=previous;});
  return {files,commits};
}
function req(product,{mode='create',filename,sha,dry_run=false,confirm_write=true,origin='https://preview.uyenuong-shop.pages.dev'}={}){
  const data={mode,product,...(filename?{filename}:{}),...(sha?{sha}:{}),dry_run,confirm_write};
  return {request:new Request(origin+'/admin/api/products/save',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify(data)}),env:{GITHUB_CONTENT_TOKEN:'test',GITHUB_CONTENT_BRANCH:'admin-products-final'}};
}
const errors=x=>(x.errors||[]).map(e=>e.field).join(',');
test('new incomplete draft is valid, published product requires copy, image, SEO',()=>{
  assert.equal(checkProductPayload(draft()).valid,true);
  const product={...draft(),status:'published'};
  const check=checkProductPayload(product);
  assert.equal(check.valid,false);
  assert.match(errors(check),/image/);
  assert.match(errors(check),/short_description/);
  assert.match(errors(check),/seo.title/);
});
test('product ID is immutable, category and price changes are permitted',()=>{
  const changed=structuredClone(item);changed.id='different';changed.price_mode='fixed';changed.base_price=6000;changed.price_text='6.000đ/cái';
  assert.match(errors(checkProductPayload(changed,item)),/id/);
  changed.id=item.id;changed.category='banh-phuc-linh';
  assert.equal(checkProductPayload(changed,item).valid,true);
});
test('slug change automatically keeps previous URL in redirect list',()=>{
  const changed=structuredClone(item);changed.slug='banh-phu-the-hue-moi';
  const check=checkProductPayload(changed,item);
  assert.equal(check.valid,true);
  assert.ok(check.product.redirect_from.includes('/san-pham/'+item.slug+'.html'));
});
test('invalid images and deleting historical redirects are rejected',()=>{
  const p=structuredClone(item);p.image='https://example.com/evil.jpg';
  assert.match(errors(checkProductPayload(p,item)),/image/);
  const old={...item,redirect_from:['/san-pham/old.html']};p.image=item.image;p.redirect_from=[];
  assert.match(errors(checkProductPayload(p,old)),/redirect_from/);
});
test('reference safety checks duplicate id, slug, invalid category and stale relations',()=>{
  const a={filename:'a.json',data:item};
  let out=checkProductReferences({...draft(),id:item.id,slug:item.slug,category:'missing'},null,[a],[],[]);
  assert.match(errors({errors:out}),/id/);
  assert.match(errors({errors:out}),/slug/);
  assert.match(errors({errors:out}),/category/);
});
test('draft file builds without a public product page or order-catalog entry',t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'uu-admin-draft-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  for(const entry of ['content','index.html'])fs.cpSync(path.join(ROOT,entry),path.join(temp,entry),{recursive:true});
  fs.writeFileSync(path.join(temp,'content/products/banh-moi.json'),JSON.stringify(draft(),null,2));
  const result=build(temp);
  assert.equal(result.products,4);
  assert.equal(fs.existsSync(path.join(temp,'san-pham/banh-moi.html')),false);
  assert.doesNotMatch(fs.readFileSync(path.join(temp,'scripts/generated/product-catalog.mjs'),'utf8'),/newcake/);
});
test('API creates draft only on preview branch and returns persisted SHA',async t=>{
  const gh=mockGithub(t);
  const response=await onRequestPost(req(draft()));const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.saved,true);assert.equal(body.created,true);
  assert.equal(body.filename,'banh-moi.json');assert.equal(gh.commits.length,1);
  assert.equal(gh.commits[0].branch,'admin-products-final');
  assert.equal(gh.commits[0].body.status,'draft');
  assert.equal(gh.files.has('main/content/products/banh-moi.json'),false);
});
test('API dry-run validates but never writes',async t=>{
  const gh=mockGithub(t),response=await onRequestPost(req(draft(),{dry_run:true}));
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).saved,false);assert.equal(gh.commits.length,0);
});
test('API refuses duplicate created file and does not overwrite it',async t=>{
  const gh=mockGithub(t),first=await onRequestPost(req(draft()));assert.equal(first.status,200);
  const second=await onRequestPost(req(draft()));assert.equal(second.status,409);
  assert.equal(gh.commits.length,1);
});
test('API updates current file with SHA; blocks stale writes',async t=>{
  const gh=mockGithub(t),changed=structuredClone(item);changed.price_mode='fixed';changed.base_price=9000;changed.price_text='9.000đ/cái';
  const args={mode:'update',filename:'banh-phu-the-hue.json',sha:'a'.repeat(40)};
  const first=await onRequestPost(req(changed,args));assert.equal(first.status,200,JSON.stringify(await first.clone().json()));
  const result=await first.json();assert.equal(result.saved,true);assert.equal(gh.commits[0].body.base_price,9000);
  const second=await onRequestPost(req(changed,args));assert.equal(second.status,409);
  assert.equal(gh.commits.length,1);
});
test('API checks category and linked content before creating file',async t=>{
  const gh=mockGithub(t),p={...draft(),related_products:['no-such-product']};
  const r=await onRequestPost(req(p));assert.equal(r.status,400);
  assert.match(errors(await r.json()),/related_products/);assert.equal(gh.commits.length,0);
});
test('API refuses invalid origin before requesting Github',async t=>{
  const gh=mockGithub(t);const context=req(draft());context.request=new Request('https://preview.uyenuong-shop.pages.dev/admin/api/products/save',{method:'POST',headers:{Origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({mode:'create',product:draft(),confirm_write:true})});
  const response=await onRequestPost(context);assert.equal(response.status,403);assert.equal(gh.commits.length,0);
});
test('new published product enters pages and trusted catalog; hiding removes both',t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'uu-admin-live-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  for(const entry of ['content','index.html'])fs.cpSync(path.join(ROOT,entry),path.join(temp,entry),{recursive:true});
  const newcomer={...structuredClone(item),id:'newcake',name:'Bánh mới',slug:'banh-moi',featured:false};
  const file=path.join(temp,'content/products/banh-moi.json');fs.writeFileSync(file,JSON.stringify(newcomer,null,2));
  assert.equal(build(temp).products,5);
  assert.equal(fs.existsSync(path.join(temp,'san-pham/banh-moi.html')),true);
  assert.match(fs.readFileSync(path.join(temp,'scripts/generated/product-catalog.mjs'),'utf8'),/newcake/);
  newcomer.status='hidden';fs.writeFileSync(file,JSON.stringify(newcomer,null,2));
  assert.equal(build(temp).products,4);
  assert.equal(fs.existsSync(path.join(temp,'san-pham/banh-moi.html')),false);
  assert.doesNotMatch(fs.readFileSync(path.join(temp,'scripts/generated/product-catalog.mjs'),'utf8'),/newcake/);
});
test('API URL edit persists redirect automatically without renaming JSON identity',async t=>{
  const gh=mockGithub(t),changed={...structuredClone(item),slug:'banh-phu-the-hue-moi'};
  const response=await onRequestPost(req(changed,{mode:'update',filename:'banh-phu-the-hue.json',sha:'a'.repeat(40)}));
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(gh.commits[0].relative,'content/products/banh-phu-the-hue.json');
  assert.ok(gh.commits[0].body.redirect_from.includes('/san-pham/banh-phu-the-hue-tphcm.html'));
});
test('API rejects published draft without completed product and does not create GitHub files',async t=>{
  const gh=mockGithub(t),product={...draft(),status:'published'};
  const response=await onRequestPost(req(product));assert.equal(response.status,400);
  assert.equal(gh.commits.length,0);assert.match(errors(await response.json()),/image/);
});
