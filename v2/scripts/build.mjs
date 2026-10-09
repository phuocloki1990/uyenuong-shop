import {imagePathsFromHtml} from './safe-html.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadV2Content } from './schema.mjs';
import { renderHome, renderProductPage, renderGuideHub, renderCategoryHub, renderArticlePage, renderContact, renderCart, renderCheckout } from './render-public.mjs';
import { renderAdminDashboard, renderAdminProducts, renderAdminProductEditor, renderAdminMedia, renderAdminArticles, renderAdminArticleEditor, renderAdminCategories, renderAdminOrders, renderAdminSettings } from './render-admin.mjs';
import { browserCatalogSource, serverCatalogSource } from './catalog.mjs';
import { collectRedirects, indexablePaths, renderHeaders, renderRedirects, renderRobots } from './seo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '../..');

function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function write(file, content) { ensureDir(file); fs.writeFileSync(file, content); }

function collectOutputs(root = repoRoot) {
  const { site, products, articles, categories } = loadV2Content(root);
  const outputs = new Map();
  outputs.set('index.html', renderHome(site, products, articles));
  for (const product of products.filter(p => p.status === 'published')) outputs.set(`${product.slug}/index.html`, renderProductPage(site, product, products, articles));
  outputs.set('cam-nang/index.html', renderGuideHub(site, articles));
  for (const article of articles.filter(a => a.status === 'published')) outputs.set(`cam-nang/${article.slug}/index.html`, renderArticlePage(site, article, articles, products));
  for (const category of categories.filter(c => c.status === 'published' && c.public_hub)) outputs.set(`cam-nang/${category.slug}/index.html`, renderCategoryHub(site, category, articles));
  outputs.set('lien-he/index.html', renderContact(site));
  outputs.set('gio-hang/index.html', renderCart(site));
  outputs.set('dat-hang/index.html', renderCheckout(site));
  outputs.set('admin/index.html', renderAdminDashboard({ products, articles }));
  outputs.set('admin/products/index.html', renderAdminProducts({ products }));
  outputs.set('admin/products/edit/index.html', renderAdminProductEditor({ products, articles }));
  outputs.set('admin/media/index.html', renderAdminMedia({ products, articles }));
  outputs.set('admin/articles/index.html', renderAdminArticles({ articles }));
  outputs.set('admin/articles/edit/index.html', renderAdminArticleEditor({ products, articles, categories }));
  outputs.set('admin/categories/index.html', renderAdminCategories({ categories }));
  outputs.set('admin/orders/index.html', renderAdminOrders());
  outputs.set('admin/settings/index.html', renderAdminSettings({ site }));
  outputs.set('assets/css/site.css', fs.readFileSync(path.join(root, 'v2/assets/css/site.css'), 'utf8'));
  outputs.set('assets/css/admin.css', fs.readFileSync(path.join(root, 'v2/assets/css/admin.css'), 'utf8'));
  outputs.set('assets/js/admin.js', fs.readFileSync(path.join(root, 'v2/assets/js/admin.js'), 'utf8'));
  outputs.set('assets/js/product-catalog.js', browserCatalogSource(products));
  outputs.set('assets/js/site.js', fs.readFileSync(path.join(root, 'v2/assets/js/site.js'), 'utf8'));
  const imagePaths = new Set(['/assets/images/logo.jpg','/assets/images/logo-header.jpg']);
  for (const product of products) {
    imagePaths.add(product.main_image);
    for (const imagePath of product.gallery) imagePaths.add(imagePath);
    for (const imagePath of imagePathsFromHtml(product.content_html)) imagePaths.add(imagePath);
  }
  for (const article of articles) {
    imagePaths.add(article.cover.src);
    for (const imagePath of imagePathsFromHtml(article.content_html)) imagePaths.add(imagePath);
  }
  for (const publicPath of imagePaths) {
    const relative = publicPath.replace(/^\//, '');
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) throw new Error(`V2 image không tồn tại: ${publicPath}`);
    outputs.set(relative, fs.readFileSync(source));
  }
  const canonical = site.canonical_domain.replace(/\/$/,'');
  const sitemapPaths = indexablePaths({ products, articles, categories });
  const redirects = collectRedirects(root, { products, articles, categories });
  outputs.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map(p=>`  <url><loc>${canonical}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
  outputs.set('robots.txt', renderRobots(canonical));
  outputs.set('_redirects', renderRedirects(redirects));
  outputs.set('_headers', renderHeaders({ preview: process.env.V2_DEPLOY_TARGET === 'preview' }));
  return { outputs, site, products, articles, categories, redirects, sitemapPaths, serverCatalog: serverCatalogSource(products) };
}

export function buildV2(root = repoRoot, { check = false, outDir = 'v2-preview' } = {}) {
  const result = collectOutputs(root);
  if (check) return { ...result, written: 0, outDir: path.join(root, outDir) };

  const outputRoot = path.join(root, outDir);
  const tempRoot = `${outputRoot}.tmp-${process.pid}`;
  const backupRoot = `${outputRoot}.bak-${process.pid}`;
  const catalogPath = path.join(root, 'functions/_generated/v2-product-catalog.mjs');
  const catalogTemp = `${catalogPath}.tmp-${process.pid}`;
  const catalogBackup = `${catalogPath}.bak-${process.pid}`;

  fs.rmSync(tempRoot, { recursive:true, force:true });
  fs.rmSync(backupRoot, { recursive:true, force:true });
  fs.rmSync(catalogTemp, { force:true });
  fs.rmSync(catalogBackup, { force:true });

  try {
    for (const [relative, content] of result.outputs) write(path.join(tempRoot, relative), content);
    write(catalogTemp, result.serverCatalog);

    if (fs.existsSync(outputRoot)) fs.renameSync(outputRoot, backupRoot);
    fs.renameSync(tempRoot, outputRoot);
    if (fs.existsSync(catalogPath)) fs.renameSync(catalogPath, catalogBackup);
    fs.renameSync(catalogTemp, catalogPath);

    fs.rmSync(backupRoot, { recursive:true, force:true });
    fs.rmSync(catalogBackup, { force:true });
  } catch (error) {
    fs.rmSync(tempRoot, { recursive:true, force:true });
    fs.rmSync(catalogTemp, { force:true });
    if (!fs.existsSync(outputRoot) && fs.existsSync(backupRoot)) fs.renameSync(backupRoot, outputRoot);
    else fs.rmSync(backupRoot, { recursive:true, force:true });
    if (!fs.existsSync(catalogPath) && fs.existsSync(catalogBackup)) fs.renameSync(catalogBackup, catalogPath);
    else fs.rmSync(catalogBackup, { force:true });
    throw error;
  }

  return { ...result, written: result.outputs.size + 1, outDir: outputRoot };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const result = buildV2(repoRoot, { check });
  console.log(check ? `V2 kiểm tra đạt: ${result.products.length} sản phẩm, ${result.articles.length} bài viết; ${result.outputs.size} output dự kiến.` : `V2 build đạt: ${result.products.length} sản phẩm, ${result.articles.length} bài viết; đã ghi ${result.written} output vào ${path.relative(repoRoot, result.outDir)}.`);
}
