import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildV2, repoRoot } from './build.mjs';
import { loadV2Content, validateProductSlugForCreate } from './schema.mjs';
import { renderHome, renderProductPage, renderArticlePage } from './render-public.mjs';

const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');

test('V2 content has exactly the three approved products and no legacy variants', () => {
  const { products, articles } = loadV2Content(repoRoot);
  assert.deepEqual(products.map(p => p.id).sort(), ['banh-phu-the','banh-phuc-linh','mam-qua-cuoi']);
  const source = [...products, ...articles].map(p => JSON.stringify(p)).join('\n');
  for (const legacy of ['Huế','Miền Bắc','Gói 4 mâm','Gói 6 mâm','Gói 8 mâm','Song Hỷ','Rồng Phụng']) assert.equal(source.includes(legacy), false, legacy);
});

test('approved product business rules are encoded in V2 data', () => {
  const { products } = loadV2Content(repoRoot);
  const byId = Object.fromEntries(products.map(p => [p.id,p]));
  const phuthe = byId['banh-phu-the'];
  assert.deepEqual(phuthe.option_groups[0].options.map(x=>x.label), ['Hộp giấy','Lá dừa']);
  assert.equal(phuthe.quantity.min_value, 20);
  assert.equal(phuthe.quantity.default_value, 20);
  assert.match(phuthe.quantity.hint, /65.*105/);
  assert.ok(phuthe.info_blocks.some(block => block.title === 'Trọng lượng' && /53g\/bánh/.test(block.description)));
  const phuclinh = byId['banh-phuc-linh'];
  assert.deepEqual(phuclinh.option_groups[0].options.map(x=>x.label), ['2 vị','5 vị']);
  assert.equal(phuclinh.quantity.default_value, 30);
  assert.equal(phuclinh.price.mode, 'hybrid');
  assert.deepEqual(phuclinh.price.rules.map(x=>[x.option_id,x.quantity,x.amount]), [['2-vi',30,180000],['2-vi',50,230000]]);
  const tray = byId['mam-qua-cuoi'];
  assert.equal(tray.quantity.enabled, false);
  assert.equal(tray.quantity.derived_from, 'selected_components');
  assert.equal(tray.receive_date.carry_to_checkout, true);
  assert.equal(tray.receive_date.checkout_is_final, true);
  assert.equal(tray.components.length, 14);
  assert.equal(tray.components.some(item => /Bánh đậu xanh/i.test(item.label)), false, 'Không tự thêm Bánh đậu xanh vào danh sách mâm quả');
  assert.equal(tray.components.filter(x => x.default_selected).length, 0, 'Mâm quả phải mặc định 0 mâm');
});

test('system route slugs are reserved for future products', () => {
  for (const slug of ['cam-nang','lien-he','gio-hang','dat-hang','admin','api','assets']) assert.throws(() => validateProductSlugForCreate(slug, []));
  assert.equal(validateProductSlugForCreate('banh-moi', ['banh-phu-the']), 'banh-moi');
  assert.throws(() => validateProductSlugForCreate('banh-phu-the', ['banh-phu-the']));
});



test('simple Product D can render without a product-specific template', () => {
  const { site } = loadV2Content(repoRoot);
  const product = {
    id:'banh-moi', name:'Bánh mới', slug:'banh-moi', status:'published', type:'simple',
    main_image:'/assets/images/products/banh-phu-the.jpg', gallery:[], short_description:'Sản phẩm mẫu.',
    price:{mode:'contact',display_text:'Giá liên hệ'},
    quantity:{enabled:true,label:'Số lượng',default_value:1,min_value:1,step:1,unit:'bánh'},
    note:{enabled:true,label:'Ghi chú',placeholder:'Yêu cầu thêm…'}, info_blocks:[], related_products:[], related_articles:[],
    seo:{title:'Bánh mới',description:'Sản phẩm mẫu.'}
  };
  const output = renderProductPage(site, product);
  assert.match(output, /Bánh mới/);
  assert.match(output, /type="number"/);
  assert.doesNotMatch(output, /option-group/);
});
test('V2 check renders all canonical routes in memory and does not write', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uu-v2-check-'));
  const out = path.relative(repoRoot, temp);
  try {
    const result = buildV2(repoRoot, { check:true, outDir:out });
    const keys = [...result.outputs.keys()];
    for (const expected of ['index.html','banh-phu-the/index.html','mam-qua-cuoi/index.html','banh-phuc-linh/index.html','cam-nang/index.html','cam-nang/mam-qua-cuoi-thuong-co-nhung-gi/index.html','cam-nang/nen-chuan-bi-so-luong-banh-phu-the-bao-nhieu/index.html','cam-nang/kinh-nghiem-chon-mam-qua-cuoi-cho-gia-dinh/index.html','lien-he/index.html','gio-hang/index.html','dat-hang/index.html','admin/index.html','admin/products/index.html','admin/products/edit/index.html','admin/media/index.html','admin/articles/index.html','admin/articles/edit/index.html','admin/categories/index.html','admin/orders/index.html','admin/settings/index.html']) assert.ok(keys.includes(expected), expected);
    assert.equal(fs.readdirSync(temp).length, 0);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

test('generated public links use clean URLs and cart/order are noindex', () => {
  const result = buildV2(repoRoot, { check:true });
  for (const [file, content] of result.outputs) {
    if (!file.endsWith('.html')) continue;
    assert.equal(/href="\/[^"]+\.html/.test(content), false, file);
    if (!file.startsWith('admin/')) {
      assert.match(content, /class="site-header"/);
      assert.match(content, /class="site-footer"/);
      assert.match(content, /class="floating-contact"/);
    }
  }
  assert.match(result.outputs.get('gio-hang/index.html'), /name="robots" content="noindex,follow"/);
  assert.match(result.outputs.get('dat-hang/index.html'), /name="robots" content="noindex,follow"/);
});

test('sitemap contains only indexable canonical V2 URLs', () => {
  const xml = buildV2(repoRoot, { check:true }).outputs.get('sitemap.xml');
  for (const url of ['https://shopuyenuong.vn/','https://shopuyenuong.vn/banh-phu-the/','https://shopuyenuong.vn/mam-qua-cuoi/','https://shopuyenuong.vn/banh-phuc-linh/','https://shopuyenuong.vn/cam-nang/','https://shopuyenuong.vn/cam-nang/mam-qua-cuoi-thuong-co-nhung-gi/','https://shopuyenuong.vn/cam-nang/nen-chuan-bi-so-luong-banh-phu-the-bao-nhieu/','https://shopuyenuong.vn/cam-nang/kinh-nghiem-chon-mam-qua-cuoi-cho-gia-dinh/','https://shopuyenuong.vn/lien-he/']) assert.match(xml, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(xml, /gio-hang|dat-hang|\.html/);
});

test('source shell keeps the locked direct navigation and accessibility basics', () => {
  const render = read('v2/scripts/render-public.mjs');
  for (const text of ['Trang chủ','Bánh phu thê','Mâm quả cưới','Bánh phục linh','Cẩm nang','Liên hệ']) assert.match(render, new RegExp(text));
  const css = read('v2/assets/css/site.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width:980px\)/);
  assert.match(css, /@media \(max-width:640px\)/);
});

test('release CSS keeps cart/order single-column after final fidelity rules and exposes focus/overflow safeguards', () => {
  const css = read('v2/assets/css/site.css');
  const desktopCart = css.lastIndexOf('.cart-layout{grid-template-columns:minmax(0,2.15fr)');
  const mobileFix = css.lastIndexOf('.cart-layout,.order-grid{grid-template-columns:minmax(0,1fr)}');
  assert.ok(desktopCart >= 0, 'desktop cart fidelity rule missing');
  assert.ok(mobileFix > desktopCart, 'mobile cart/order override must come after desktop fidelity rules');
  assert.match(css, /html,body\{overflow-x:clip\}/);
  assert.match(css, /:focus-visible/);
  const adminCss = read('v2/assets/css/admin.css');
  assert.match(adminCss, /html,body\{overflow-x:clip\}/);
  assert.match(adminCss, /:focus-visible/);
});

test('Product Detail Engine renders dynamic summary hooks and related products from shared data', () => {
  const { site, products } = loadV2Content(repoRoot);
  const byId = Object.fromEntries(products.map(product => [product.id, product]));
  const phuthe = renderProductPage(site, byId['banh-phu-the'], products);
  assert.match(phuthe, /data-product-summary/);
  assert.match(phuthe, /Quy cách đóng gói: Hộp giấy/);
  assert.match(phuthe, /Số lượng: 20 bánh/);
  assert.match(phuthe, /65 hoặc 105 bánh/);
  assert.match(phuthe, /Sản phẩm liên quan/);
  assert.match(phuthe, /Mâm quả cưới/);
  assert.match(phuthe, /Bánh phục linh/);

  const mamqua = renderProductPage(site, byId['mam-qua-cuoi'], products);
  assert.match(mamqua, /data-derived-count>0 mâm/);
  assert.match(mamqua, /Chưa chọn lễ vật/);
  assert.match(mamqua, /Ngày này sẽ được mang sang bước Đặt hàng/);
  assert.doesNotMatch(mamqua, /name="quantity"/);

  const phuclinh = renderProductPage(site, byId['banh-phuc-linh'], products);
  assert.match(phuclinh, /Số vị/);
  assert.match(phuclinh, />2 vị</);
  assert.match(phuclinh, />5 vị</);
  assert.match(phuclinh, /Số lượng: 30 bánh/);
  assert.match(phuclinh, /data-summary-price/);
  assert.match(phuclinh, /data-product-price/);
  assert.doesNotMatch(phuclinh, /data-custom="true"/);
});

test('Product Detail Engine keeps Product D out of locked Home navigation/content by default', () => {
  const { site, products } = loadV2Content(repoRoot);
  const extra = {
    id:'banh-moi', name:'Bánh mới', slug:'banh-moi', status:'published', type:'simple',
    main_image:'/assets/images/products/banh-phu-the.jpg', gallery:[], short_description:'Sản phẩm mẫu.',
    price:{mode:'contact',display_text:'Giá liên hệ'},
    quantity:{enabled:true,label:'Số lượng',default_value:1,min_value:1,step:1,unit:'bánh'},
    note:{enabled:true,label:'Ghi chú',placeholder:'Yêu cầu thêm…'}, info_blocks:[], related_products:[], related_articles:[],
    seo:{title:'Bánh mới',description:'Sản phẩm mẫu.'}
  };
  const source = renderHome(site, [...products, extra]);
  assert.doesNotMatch(source, />Bánh mới</);
});

test('V2 builder copies product images from data instead of a hard-coded product image list', () => {
  const result = buildV2(repoRoot, { check:true });
  const { products } = loadV2Content(repoRoot);
  for (const product of products) {
    assert.ok(result.outputs.has(product.main_image.replace(/^\//,'')), product.main_image);
    for (const imagePath of product.gallery) assert.ok(result.outputs.has(imagePath.replace(/^\//,'')), imagePath);
  }
});


test('Phase II.3 loads one general category and three published articles with block content', () => {
  const { articles, categories } = loadV2Content(repoRoot);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].public_hub, false);
  assert.deepEqual(articles.map(a => a.slug).sort(), [
    'kinh-nghiem-chon-mam-qua-cuoi-cho-gia-dinh',
    'mam-qua-cuoi-thuong-co-nhung-gi',
    'nen-chuan-bi-so-luong-banh-phu-the-bao-nhieu'
  ]);
  for (const article of articles) {
    assert.equal(article.status, 'published');
    assert.ok(article.blocks.some(block => block.type === 'h2'));
    assert.ok(article.related_products.length >= 1);
  }
});

test('Home V2 includes locked content sections without fake customer proof', () => {
  const { site, products, articles } = loadV2Content(repoRoot);
  const home = renderHome(site, products, articles);
  for (const text of ['Bánh phu thê &amp; mâm quả cưới tại TP.HCM','Cách đặt hàng','Cẩm nang cưới hỏi','Câu hỏi thường gặp','Cần Shop tư vấn trước khi đặt?']) assert.match(home, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for (const cls of ['editorial-product feature-primary','editorial-product feature-reverse','editorial-product feature-strip']) assert.match(home, new RegExp(cls));
  assert.doesNotMatch(home, /Khách đã nhận hàng|đánh giá khách hàng|testimonial/i);
  assert.match(home, /\/cam-nang\/mam-qua-cuoi-thuong-co-nhung-gi\//);
});

test('Article renderer uses flat clean article URLs and structured blocks', () => {
  const { site, products, articles } = loadV2Content(repoRoot);
  const article = articles.find(item => item.slug === 'mam-qua-cuoi-thuong-co-nhung-gi');
  const output = renderArticlePage(site, article, articles, products);
  assert.match(output, /Trang chủ/);
  assert.match(output, /Cẩm nang/);
  assert.match(output, /Các lễ vật thường được lựa chọn/);
  assert.match(output, /article-callout/);
  assert.match(output, /Sản phẩm liên quan/);
  assert.match(output, /Bài viết liên quan/);
  assert.match(output, /canonical" href="https:\/\/shopuyenuong\.vn\/cam-nang\/mam-qua-cuoi-thuong-co-nhung-gi\/"/);
  assert.doesNotMatch(output, /\.html/);
});

test('Product pages discover related Cẩm nang from article data without editing product JSON', () => {
  const { site, products, articles } = loadV2Content(repoRoot);
  const product = products.find(item => item.id === 'mam-qua-cuoi');
  const output = renderProductPage(site, product, products, articles);
  assert.match(output, /Cẩm nang cưới hỏi/);
  assert.match(output, /Mâm quả cưới thường có những gì\?/);
  assert.match(output, /Kinh nghiệm chọn mâm quả cưới cho gia đình/);
});

test('Contact is production-facing and exposes only real contact channels while backend integration is deferred', () => {
  const result = buildV2(repoRoot, { check:true });
  const contact = result.outputs.get('lien-he/index.html');
  assert.doesNotMatch(contact, /<form|data-preview-form|Bản Preview|chưa gửi form|chưa cài đặt|chưa cấu hình/i);
  assert.match(contact, /Liên hệ nhanh/);
  assert.doesNotMatch(contact, /class="cta-row contact-actions"/, 'Không lặp lại cùng CTA ở cả hai cột Liên hệ');
  assert.match(contact, /Nhắn Zalo cho Shop/);
  assert.match(contact, /Gọi 0868 157 858/);
  assert.match(contact, /Mâm quả cưới HCM/);
  assert.match(contact, /Bánh phục linh HCM/);
  assert.match(contact, /Zalo tư vấn trực tiếp/);
});

test('builder copies article cover and inline images from content data', () => {
  const result = buildV2(repoRoot, { check:true });
  const { articles } = loadV2Content(repoRoot);
  for (const article of articles) {
    assert.ok(result.outputs.has(article.cover.src.replace(/^\//,'')), article.cover.src);
    for (const block of article.blocks) if (block.type === 'image') assert.ok(result.outputs.has(block.src.replace(/^\//,'')), block.src);
  }
});


test('future Cẩm nang category hub is generated only when public_hub is enabled', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'uu-v2-category-'));
  try {
    fs.cpSync(path.join(repoRoot, 'v2'), path.join(temp, 'v2'), { recursive:true });
    fs.mkdirSync(path.join(temp, 'assets'), { recursive:true });
    fs.cpSync(path.join(repoRoot, 'assets/images'), path.join(temp, 'assets/images'), { recursive:true });
    const categoryPath = path.join(temp, 'v2/content/categories/cam-nang-cuoi-hoi.json');
    const category = JSON.parse(fs.readFileSync(categoryPath, 'utf8'));
    category.public_hub = true;
    fs.writeFileSync(categoryPath, JSON.stringify(category, null, 2));
    const result = buildV2(temp, { check:true });
    assert.ok(result.outputs.has('cam-nang/cam-nang-cuoi-hoi/index.html'));
    assert.match(result.outputs.get('sitemap.xml'), /\/cam-nang\/cam-nang-cuoi-hoi\//);
  } finally { fs.rmSync(temp, { recursive:true, force:true }); }
});

test('Phase II.4 build emits the browser catalog and committed server trusted catalog from the same products', () => {
  const result = buildV2(repoRoot, { check:true });
  const browser = result.outputs.get('assets/js/product-catalog.js');
  assert.match(browser, /UYEN_UONG_PRODUCTS/);
  for (const id of ['banh-phu-the','mam-qua-cuoi','banh-phuc-linh']) assert.match(browser, new RegExp(id));
  for (const legacy of ['phu-the-hue','phu-the-bac','Gói 4 mâm','Gói 6 mâm']) assert.doesNotMatch(browser, new RegExp(legacy));
  const committed = fs.readFileSync(path.join(repoRoot, 'functions/_generated/v2-product-catalog.mjs'), 'utf8');
  assert.equal(committed, result.serverCatalog);
});

test('product pages now add to the real V2 cart instead of preview-only cart', () => {
  const { site, products, articles } = loadV2Content(repoRoot);
  for (const product of products) {
    const output = renderProductPage(site, product, products, articles);
    assert.match(output, /data-add-to-cart/);
    assert.match(output, /data-cart-action-note/);
    assert.doesNotMatch(output, /data-preview-cart|lựa chọn chưa được lưu vào giỏ hàng/);
  }
});

test('cart and checkout render the locked filled-empty-success-rate-limit hooks', () => {
  const result = buildV2(repoRoot, { check:true });
  const cart = result.outputs.get('gio-hang/index.html');
  const checkout = result.outputs.get('dat-hang/index.html');
  for (const hook of ['data-cart-page','data-cart-list','data-cart-empty','data-cart-summary','data-cart-line-count']) assert.match(cart, new RegExp(hook));
  for (const text of ['Giỏ hàng đang trống','Tiếp tục đặt hàng','Chọn thêm sản phẩm','Shop sẽ xác nhận']) assert.match(cart, new RegExp(text));
  for (const hook of ['data-checkout-default','data-checkout-items','data-order-form','data-order-success','data-order-rate-limit','data-return-order']) assert.match(checkout, new RegExp(hook));
  for (const text of ['Yêu cầu đã ghi nhận','Chưa thể gửi yêu cầu','Đã nhận quá nhiều đơn hàng. Vui lòng thử lại sau.','Shop khuyến nghị đặt trước 3–5 ngày.']) assert.match(checkout, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const checkoutMain = checkout.match(/<main>([\s\S]*?)<\/main>/)?.[1] || checkout;
  assert.doesNotMatch(checkoutMain, /Thanh toán|cước vận chuyển|giờ hoàng đạo|x 1 bộ/i);
});

test('checkout and quick-add expose the approved user-facing validation and pricing hooks', () => {
  const result = buildV2(repoRoot, { check:true });
  const checkout = result.outputs.get('dat-hang/index.html');
  const home = result.outputs.get('index.html');
  assert.match(checkout, /data-order-phone/);
  assert.match(checkout, /data-order-date/);
  assert.match(checkout, /Nhập số điện thoại Việt Nam/);
  assert.match(home, /data-quick-price/);
  assert.doesNotMatch(checkout, /Bản Preview|chưa cài đặt|chưa cấu hình/i);
});

test('commerce client sends only product id, quantity and configuration to V2 trusted order API', () => {
  const source = read('v2/assets/js/site.js');
  assert.match(source, /fetch\('\/api\/v2\/orders'/);
  assert.match(source, /items: cart\.map\(item => \(\{ product_id: item\.product_id, quantity: item\.quantity, configuration: item\.configuration \}\)\)/);
  assert.match(source, /configuration\?\.receive_date/);
  assert.match(source, /uyen_uong_order_request_v2/);
  assert.doesNotMatch(source, /price_text:\s*item|name:\s*item/);
});


test('DATA/UI FINAL keeps locked header, real footer, product information and responsive safeguards', () => {
  const { site, products, articles } = loadV2Content(repoRoot);
  const home = renderHome(site, products, articles);
  const product = renderProductPage(site, products.find(item => item.id === 'banh-phu-the'), products, articles);
  const css = read('v2/assets/css/site.css');
  const client = read('v2/assets/js/site.js');
  assert.match(home, /logo-header\.jpg/);
  assert.match(home, /Liên hệ đặt hàng/);
  assert.match(home, /Kênh chính thức/);
  assert.doesNotMatch(home, /Chính sách cửa hàng/);
  assert.doesNotMatch(home, /<h2>Sản phẩm<\/h2>/);
  assert.match(product, /product-info-card/);
  assert.match(product, /Trọng lượng/);
  assert.match(product, /53g\/bánh/);
  assert.match(product, /Thời gian chuẩn bị/);
  assert.doesNotMatch(product, /class="thumb(?: active)?"/, 'Sản phẩm chỉ có một ảnh không được hiện thumbnail lặp');
  assert.match(css, /@media\(max-width:1023px\)/);
  assert.match(css, /@media\(max-width:360px\)/);
  assert.match(css, /\.home-guide-layout,\.guide-hub-layout,\.guide-related-layout\{align-items:start\}/);
  assert.match(css, /\.footer-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.cart-item-actions \.cart-edit:not\(\[open\]\)\{width:auto\}/);
  assert.match(css, /\.product-info-card \.info-grid\{display:grid;grid-template-columns:repeat\(2/);
  assert.doesNotMatch(client, /data-preview-form|Bản Preview|chưa cài đặt|chưa cấu hình/i);
  assert.match(client, /quickReturnFocus/);
  assert.match(client, /event\.key !== 'Tab'/);
  assert.match(client, /data-quick-price/);
  assert.match(client, /isValidVietnamPhone/);
  assert.match(client, /dateInput\.min = today/);
});
