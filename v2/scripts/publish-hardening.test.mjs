import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildV2, repoRoot } from './build.mjs';
import { loadV2Content } from './schema.mjs';
import { uploadMedia, listMedia, getPublishStatus } from '../../functions/_shared/v2-admin-github.js';

const copyFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uu-v2-publish-'));
  fs.cpSync(path.join(repoRoot, 'v2'), path.join(root, 'v2'), { recursive:true });
  fs.mkdirSync(path.join(root, 'assets'), { recursive:true });
  fs.cpSync(path.join(repoRoot, 'assets/images'), path.join(root, 'assets/images'), { recursive:true });
  return root;
};

test('Product D publishes end-to-end from V2 content into page, sitemap and both trusted catalogs', () => {
  const root = copyFixture();
  try {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'v2/content/products/banh-phu-the.json'), 'utf8'));
    const product = {
      ...source,
      id:'banh-moi', slug:'banh-moi', name:'Bánh mới', status:'published', type:'simple',
      short_description:'Sản phẩm mới được tạo từ Admin.', option_groups:[], gallery:[],
      related_products:[], related_articles:[],
      seo:{title:'Bánh mới | Shop Uyên Ương',description:'Sản phẩm mới được tạo từ dữ liệu Admin.'}
    };
    fs.writeFileSync(path.join(root, 'v2/content/products/banh-moi.json'), `${JSON.stringify(product,null,2)}\n`);
    const result = buildV2(root);
    const page = fs.readFileSync(path.join(root, 'v2-preview/banh-moi/index.html'), 'utf8');
    const home = fs.readFileSync(path.join(root, 'v2-preview/index.html'), 'utf8');
    const sitemap = fs.readFileSync(path.join(root, 'v2-preview/sitemap.xml'), 'utf8');
    const browserCatalog = fs.readFileSync(path.join(root, 'v2-preview/assets/js/product-catalog.js'), 'utf8');
    const serverCatalog = fs.readFileSync(path.join(root, 'functions/_generated/v2-product-catalog.mjs'), 'utf8');
    assert.match(page, /Bánh mới/);
    assert.match(sitemap, /\/banh-moi\//);
    assert.match(browserCatalog, /banh-moi/);
    assert.match(serverCatalog, /banh-moi/);
    assert.doesNotMatch(home, />Bánh mới</);
    assert.equal(result.products.length, 4);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('V2 build leaves no temporary or backup output after a successful atomic publish', () => {
  const root = copyFixture();
  try {
    buildV2(root);
    const leftovers = fs.readdirSync(root).filter(name => name.startsWith('v2-preview.tmp-') || name.startsWith('v2-preview.bak-'));
    const generated = path.join(root,'functions/_generated');
    const generatedLeftovers = fs.existsSync(generated) ? fs.readdirSync(generated).filter(name => name.includes('.tmp-') || name.includes('.bak-')) : [];
    assert.deepEqual(leftovers, []);
    assert.deepEqual(generatedLeftovers, []);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('duplicate media upload is rejected before a second file is written', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ type:'file', sha:'a'.repeat(40) });
  const file = { name:'Bánh Phu Thê 01.JPG', size:4, arrayBuffer:async()=>Uint8Array.from([0xff,0xd8,0xff,0x00]).buffer };
  try {
    await assert.rejects(
      uploadMedia({token:'t',branch:'preview-v2'},{group:'products',file}),
      error => error.status===409 && error.existing_url==='/assets/images/products/banh-phu-the-01.jpg'
    );
  } finally { globalThis.fetch = original; }
});

test('media usage scan fails closed instead of silently reporting unsafe zero usage', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({message:'upstream error'},{status:500});
  try {
    await assert.rejects(listMedia({token:'t',branch:'preview-v2'}), error => error.status===502);
  } finally { globalThis.fetch = original; }
});

test('publish status reports waiting, success and failed states without exposing infrastructure wording to Admin', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({workflow_runs:[]});
    assert.equal((await getPublishStatus({token:'t',branch:'preview-v2'},{commitSha:'v1'})).state,'pending');
    globalThis.fetch = async () => Response.json({workflow_runs:[{head_sha:'v2',status:'completed',conclusion:'success',updated_at:'2026-09-28T00:00:00Z'}]});
    assert.equal((await getPublishStatus({token:'t',branch:'preview-v2'},{commitSha:'v2'})).state,'success');
    globalThis.fetch = async () => Response.json({workflow_runs:[{head_sha:'v3',status:'completed',conclusion:'failure',updated_at:'2026-09-28T00:00:00Z'}]});
    assert.equal((await getPublishStatus({token:'t',branch:'preview-v2'},{commitSha:'v3'})).state,'failed');
  } finally { globalThis.fetch = original; }
});

test('V2 workflow validates, builds, tests on Node 24, then commits generated preview', () => {
  const workflow = fs.readFileSync(path.join(repoRoot,'.github/workflows/rebuild-v2-preview.yml'),'utf8');
  assert.match(workflow,/node-version:\s*'24'/);
  assert.match(workflow,/branches:\s*\n\s*- v2-preview/);
  assert.match(workflow,/v2\/scripts\/publish-hardening\.test\.mjs/);
  assert.match(workflow,/Validate V2 content before generating files/);
  assert.match(workflow,/Build V2 preview and trusted catalog/);
  assert.match(workflow,/Prepare cutover manifest/);
  assert.match(workflow,/node v2\/scripts\/prepare-cutover\.mjs/);
  assert.match(workflow,/Run V1 and V2 tests against generated output/);
  assert.match(workflow,/v2\/scripts\/seo-cutover\.test\.mjs/);
  assert.match(workflow,/node v2\/scripts\/build\.mjs --check/);
});

test('V2 content now references managed Media folders instead of legacy root image paths', () => {
  const { products, articles } = loadV2Content(repoRoot);
  for (const product of products) assert.match(product.main_image,/^\/assets\/images\/products\//);
  for (const article of articles) assert.match(article.cover.src,/^\/assets\/images\/articles\//);
});

test('Admin Media client has mobile image optimization and local duplicate prevention before upload', () => {
  const source = fs.readFileSync(path.join(repoRoot,'v2/assets/js/admin.js'),'utf8');
  assert.match(source,/optimizeImageFile/);
  assert.match(source,/image\/webp/);
  assert.match(source,/900000/);
  assert.match(source,/duplicateFor/);
  assert.match(source,/Tên ảnh .* đã có trong nhóm này/);
});

