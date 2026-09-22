import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestGet, onRequestPost } from '../functions/admin/api/media/index.js';
import { onRequestPost as saveContent } from '../functions/admin/api/content/save.js';

const host='preview123.uyenuong-shop.pages.dev';
const origin=`https://${host}`;
const env={GITHUB_CONTENT_TOKEN:'test-only-token',GITHUB_CONTENT_BRANCH:'admin-products-final'};
const fileJpeg=new File([Uint8Array.of(0xff,0xd8,0xff,0,1)],'photo.jpg',{type:'image/jpeg'});
const post=(f=fileJpeg,where=host)=>{
  const body=new FormData();body.set('file',f);
  return new Request(`https://${where}/admin/api/media`,{
    method:'POST',headers:{Origin:`https://${where}`},body
  });
};
async function fakeFetch(fn,body){const old=globalThis.fetch;globalThis.fetch=fn;
  try{return await body();}finally{globalThis.fetch=old;}}

test('media API: preview GET reads both folders on preview branch',async()=>{
  const urls=[];
  const response=await fakeFetch(async url=>{
    urls.push(String(url));return Response.json([{type:'file',name:'photo.jpg',path:'assets/images/photo.jpg',size:5,sha:'f'.repeat(40)}]);
  },()=>onRequestGet({request:new Request(`${origin}/admin/api/media`),env}));
  const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.branch,'admin-products-final');
  assert.equal(data.count,2);assert.equal(urls.length,2);
  for(const url of urls)assert.equal(new URL(url).searchParams.get('ref'),'admin-products-final');
});

test('media API: preview upload writes file ONLY to preview branch',async()=>{
  const calls=[];
  const response=await fakeFetch(async (url,opts)=>{
    calls.push({url:String(url),opts});
    return Response.json({content:{sha:'a'.repeat(40)},commit:{sha:'b'.repeat(40)}});
  },()=>onRequestPost({request:post(),env}));
  const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.branch,'admin-products-final');
  assert.match(data.path,/^\/assets\/images\/uploads\/shop-\d{8}-[0-9a-f-]+\.jpg$/);
  assert.equal(calls.length,1);const payload=JSON.parse(calls[0].opts.body);
  assert.equal(payload.branch,'admin-products-final');
  assert.equal(payload.content,Buffer.from(await fileJpeg.arrayBuffer()).toString('base64'));
});

test('media API: preview refuses missing branch before GitHub write',async()=>{
  let called=0;
  const response=await fakeFetch(async()=>{called++;throw Error('unexpected')},()=>onRequestPost({request:post(),env:{GITHUB_CONTENT_TOKEN:'t'}}));
  assert.equal(response.status,503);assert.equal(called,0);
});

test('media API: invalid origin/type/oversize rejected before GitHub write',async()=>{
  let called=0;
  const cases=[
    new Request(`${origin}/admin/api/media`,{method:'POST',body:new FormData(),headers:{Origin:'https://evil.example'}}),
    post(new File([new Uint8Array([1,2,3,4])],'not-image.jpg',{type:'image/jpeg'})),
    post(new File([new Uint8Array(900001)],'big.jpg',{type:'image/jpeg'}))
  ];
  await fakeFetch(async()=>{called++;throw Error('unexpected')},async()=>{
    const responseCodes=[];
    for(const req of cases)responseCodes.push((await onRequestPost({request:req,env})).status);
    assert.deepEqual(responseCodes,[403,400,413]);
  });
  assert.equal(called,0);
});

test('media API: production upload always targets main',async()=>{
  const calls=[];
  await fakeFetch(async (_url,opts)=>{
    calls.push(JSON.parse(opts.body));return Response.json({content:{sha:'a'},commit:{sha:'b'}});
  },()=>onRequestPost({request:post(fileJpeg,'uyenuong-shop.pages.dev'),env}));
  assert.equal(calls[0].branch,'main');
});

test('product image saving checks image file on preview branch and writes product there',async()=>{
  const sha='a'.repeat(40);const urls=[];let saved;
  const image='/assets/images/uploads/shop-20260922-example.jpg';
  const response=await fakeFetch(async (url,opts={})=>{
    urls.push(String(url));
    if(String(url).includes('/assets/images/uploads/'))return Response.json({type:'file',sha:'i'.repeat(40)});
    if(opts.method==='PUT') {saved=JSON.parse(opts.body);return Response.json({content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}});}
    return Response.json({type:'file',encoding:'base64',sha,content:Buffer.from(JSON.stringify({name:'Bánh',image:'/assets/images/old.jpg',seo:{}}),'utf8').toString('base64')});
  },()=>saveContent({env,request:new Request(`${origin}/admin/api/content/save`,{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({kind:'products',filename:'banh-phu-the-hue.json',sha,changes:{image},confirm_write:true})
  })}));
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(saved.branch,'admin-products-final');
  assert.equal(JSON.parse(Buffer.from(saved.content,'base64').toString()).image,image);
  assert.equal(new URL(urls[0]).searchParams.get('ref'),'admin-products-final');
});

test('product image saving rejects paths outside library before any GitHub access',async()=>{
  let called=0;
  for(const image of ['https://evil.example/a.jpg','/assets/images/../bad.jpg','/assets/images/foo.svg']){
    const resp=await fakeFetch(async()=>{called++;throw Error('unexpected')},()=>saveContent({env,request:new Request(`${origin}/admin/api/content/save`,{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({kind:'products',filename:'banh-phu-the-hue.json',sha:'a'.repeat(40),changes:{image},confirm_write:true})
    })}));
    assert.equal(resp.status,400);
  }
  assert.equal(called,0);
});

test('product Admin UI has upload and image-select actions wired to media API',()=>{
  const html=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../admin/products.html'),'utf8');
  assert.match(html,/id="productImageSelect"/);
  assert.match(html,/id="uploadProductImage"/);
  assert.match(html,/MEDIA_API = '\/admin\/api\/media'/);
  assert.match(html,/fields\.image\.addEventListener\('change'/);
  assert.match(html,/elements\.imageUpload\.addEventListener\('click', uploadImage\)/);
});
