import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLivePreviewQa } from './live-preview-qa.mjs';

const headers = values => new Headers(values);
const response = (status, body='', h={}) => new Response(body,{status,headers:h});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'uu-live-preview-'));
  fs.mkdirSync(path.join(root,'v2-preview'),{recursive:true});
  fs.writeFileSync(path.join(root,'v2-preview/_redirects'),'/legacy.html /banh-phu-the/ 301\n');
  return root;
}

test('live Preview QA checks noindex, public routes, Access and permanent redirects', async () => {
  const root = fixture();
  const fetchImpl = async input => {
    const url = new URL(input);
    const common={'X-Robots-Tag':'noindex'};
    if(url.pathname==='/') return response(200,'home',common);
    if(url.pathname==='/sitemap.xml') return response(200,'<urlset><url><loc>https://shopuyenuong.vn/banh-phu-the/</loc></url></urlset>');
    if(url.pathname==='/banh-phu-the/') return response(200,'product',common);
    if(url.pathname==='/robots.txt') return response(200,'User-agent: *');
    if(url.pathname==='/gio-hang/'||url.pathname==='/dat-hang/') return response(200,'page',common);
    if(url.pathname==='/admin/'||url.pathname==='/admin/api/v2/content') return response(302,'',{Location:'https://access.example/login'});
    if(url.pathname==='/api/v2/orders') return response(405,'',common);
    if(url.pathname==='/legacy.html') return response(301,'',{Location:'/banh-phu-the/'});
    return response(404);
  };
  try {
    const report=await runLivePreviewQa({baseUrl:'https://preview.example/',fetchImpl,repoRoot:root});
    assert.equal(report.ok,true,report.issues.join('\n'));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('live Preview QA refuses Production hosts', async () => {
  await assert.rejects(runLivePreviewQa({baseUrl:'https://shopuyenuong.vn'}),/Production/);
});
