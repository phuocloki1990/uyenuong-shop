import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContentBranch, ContentBranchConfigurationError } from './content-branch.mjs';

const req = hostname => new Request(`https://${hostname}/admin/api/content`);

test('production content always reads and writes main on the deployed production hostname', () => {
  assert.equal(resolveContentBranch(req('uyenuong-shop.pages.dev'), {}), 'main');
  assert.equal(resolveContentBranch(req('uyenuong-shop.pages.dev'), { GITHUB_CONTENT_BRANCH:'admin-products-final' }), 'main');
});

test('preview content only reads/writes its explicitly configured branch', () => {
  assert.equal(resolveContentBranch(req('preview123.uyenuong-shop.pages.dev'), { GITHUB_CONTENT_BRANCH:'admin-products-final' }), 'admin-products-final');
  for (const env of [{}, {GITHUB_CONTENT_BRANCH:'main'}, {GITHUB_CONTENT_BRANCH:'../../main'}]) {
    assert.throws(() => resolveContentBranch(req('preview123.uyenuong-shop.pages.dev'), env), ContentBranchConfigurationError);
  }
});

test('every content endpoint resolves the branch instead of hardcoding main', async () => {
  const {readFileSync} = await import('node:fs');
  const {fileURLToPath} = await import('node:url');
  const {join,dirname} = await import('node:path');
  const base=dirname(fileURLToPath(import.meta.url));
  for(const name of ['index.js','item.js','save.js']) {
    const code=readFileSync(join(base,'../functions/admin/api/content',name),'utf8');
    assert.match(code,/resolveContentBranch\(request, env\)/);
    assert.doesNotMatch(code, /const (?:BRANCH|GITHUB_BRANCH) = 'main'/);
  }
});

// Exercise all three endpoints with a mocked GitHub API; no real GitHub writes.
const envPreview = { GITHUB_CONTENT_TOKEN:'test-token', GITHUB_CONTENT_BRANCH:'admin-products-final' };
const host = 'preview123.uyenuong-shop.pages.dev';
const sha = 'a'.repeat(40);
const jsonFile = () => ({ type:'file', encoding:'base64', sha, content:btoa(JSON.stringify({name:'Old',seo:{}})) });

async function withFakeFetch(fake, run) {
  const old = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await run(); } finally { globalThis.fetch = old; }
}

test('preview content list and item request their own branch', async () => {
  const { onRequestGet:list } = await import('../functions/admin/api/content/index.js');
  const { onRequestGet:item } = await import('../functions/admin/api/content/item.js');
  const requests=[];
  await withFakeFetch(async url => {
    requests.push(String(url));
    return Response.json(String(url).includes('/content/products?') ? [] : jsonFile());
  }, async () => {
    const listing=await list({request:new Request(`https://${host}/admin/api/content?kind=products`),env:envPreview});
    const detail=await item({request:new Request(`https://${host}/admin/api/content/item?kind=products&slug=banh-phu-the-hue`),env:envPreview});
    assert.equal(listing.status,200);
    assert.equal(detail.status,200);
    assert.equal((await detail.json()).data.name,'Old');
  });
  assert.equal(requests.length,2);
  for(const url of requests) assert.equal(new URL(url).searchParams.get('ref'),'admin-products-final');
});

test('preview content save reads AND writes preview branch, not main', async () => {
  const {onRequestPost:save}=await import('../functions/admin/api/content/save.js');
  const captured=[];
  await withFakeFetch(async (url,options={}) => {
    const method=options.method||'GET';
    captured.push({url:String(url),method, body:options.body});
    return Response.json(method==='GET' ? jsonFile(): {content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}});
  }, async () => {
    const url=`https://${host}/admin/api/content/save`;
    const response=await save({env:envPreview,request:new Request(url,{
      method:'POST', headers:{Origin:`https://${host}`,'Content-Type':'application/json'},
      body:JSON.stringify({kind:'products',filename:'banh-phu-the-hue.json',sha,changes:{name:'New'},confirm_write:true})
    })});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).saved,true);
  });
  assert.equal(captured.length,2);
  assert.equal(new URL(captured[0].url).searchParams.get('ref'),'admin-products-final');
  assert.equal(JSON.parse(captured[1].body).branch,'admin-products-final');
});

test('preview content save refuses missing branch before any GitHub access', async () => {
  const {onRequestPost:save}=await import('../functions/admin/api/content/save.js');
  let calls=0;
  await withFakeFetch(async ()=>{calls++;throw Error('Unexpected GitHub request')}, async () => {
    const url=`https://${host}/admin/api/content/save`;
    const response=await save({env:{GITHUB_CONTENT_TOKEN:'test-token'},request:new Request(url,{
      method:'POST',headers:{Origin:`https://${host}`,'Content-Type':'application/json'},
      body:JSON.stringify({kind:'products',filename:'banh-phu-the-hue.json',sha,changes:{name:'New'},confirm_write:true})
    })});
    assert.equal(response.status,503);
  });
  assert.equal(calls,0);
});
