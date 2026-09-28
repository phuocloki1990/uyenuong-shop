const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const nav = [
  ['home','Trang chủ','/'],
  ['banh-phu-the','Bánh phu thê','/banh-phu-the/'],
  ['mam-qua-cuoi','Mâm quả cưới','/mam-qua-cuoi/'],
  ['banh-phuc-linh','Bánh phục linh','/banh-phuc-linh/'],
  ['cam-nang','Cẩm nang','/cam-nang/'],
  ['lien-he','Liên hệ','/lien-he/']
];

function header(site, active = '') {
  const links = nav.map(([key,label,href]) => `<a${key===active?' aria-current="page" class="active"':''} href="${href}">${label}</a>`).join('');
  return `<header class="site-header">
    <div class="shell header-row">
      <a class="brand" href="/" aria-label="${html(site.name)} – Trang chủ">
        <img src="/assets/images/logo.jpg" alt="" width="42" height="42">
        <span><strong>${html(site.name)}</strong><small>${html(site.brand_line)}</small></span>
      </a>
      <nav class="desktop-nav" aria-label="Điều hướng chính">${links}</nav>
      <div class="header-actions">
        <a class="hotline" href="tel:${html(site.hotline)}"><small>Hotline tư vấn</small><strong>${html(site.hotline_display)}</strong></a>
        <a class="cart-link" href="/gio-hang/" aria-label="Giỏ hàng">Giỏ <span data-cart-count>0</span></a>
        <a class="btn btn-primary btn-small desktop-zalo" href="${html(site.zalo)}" target="_blank" rel="noopener">Chat Zalo</a>
        <button class="menu-toggle" type="button" aria-label="Mở menu" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span><span></span></button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-menu" aria-label="Điều hướng điện thoại" hidden>${links}<div class="mobile-nav-contact"><a href="tel:${html(site.hotline)}">${html(site.hotline_display)}</a><a href="${html(site.zalo)}" target="_blank" rel="noopener">Chat Zalo</a></div></nav>
  </header>`;
}

function footer(site) {
  const fanpages = site.fanpages.map(p => `<li><a href="${html(p.url)}" target="_blank" rel="noopener">${html(p.label)}</a></li>`).join('');
  return `<footer class="site-footer">
    <div class="shell footer-grid">
      <div><strong class="footer-brand">${html(site.name)}</strong><p>Bánh phu thê, mâm quả cưới và bánh phục linh tại TP.HCM.</p></div>
      <div><h2>Liên hệ Shop</h2><p>${html(site.address)}</p><a href="tel:${html(site.hotline)}">${html(site.hotline_display)}</a><a href="${html(site.zalo)}" target="_blank" rel="noopener">Nhắn Zalo cho Shop</a></div>
      <div><h2>Kênh chính thức</h2><ul>${fanpages}</ul></div>
      <div><h2>Điều hướng</h2><ul><li><a href="/cam-nang/">Cẩm nang</a></li><li><a href="/gio-hang/">Giỏ hàng</a></li><li><a href="/dat-hang/">Đặt hàng</a></li><li><a href="/lien-he/">Liên hệ</a></li></ul></div>
    </div>
    <div class="shell footer-bottom">© 2026 ${html(site.name)}.</div>
  </footer>`;
}

function floating(site) {
  return `<div class="floating-contact" aria-label="Liên hệ nhanh"><a href="tel:${html(site.hotline)}">Gọi Shop</a><a class="zalo" href="${html(site.zalo)}" target="_blank" rel="noopener">Zalo</a></div>`;
}

export function renderShell({ site, title, description, canonicalPath, active='', body, robots='index,follow', bodyClass='' }) {
  const canonical = `${site.canonical_domain.replace(/\/$/,'')}${canonicalPath}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><meta name="description" content="${html(description)}"><meta name="robots" content="${html(robots)}"><link rel="canonical" href="${html(canonical)}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/css/site.css"></head><body class="${html(bodyClass)}">${header(site,active)}<main>${body}</main>${footer(site)}${floating(site)}<script src="/assets/js/product-catalog.js" defer></script><script src="/assets/js/site.js" defer></script></body></html>`;
}

function productImage(product, eager=false) {
  const images = [product.main_image, ...product.gallery.filter(src => src !== product.main_image)];
  return `<div class="product-gallery"><div class="main-image"><img src="${html(product.main_image)}" alt="${html(product.name)}"${eager?' fetchpriority="high"':''}></div>${images.length>1?`<div class="thumb-row">${images.map((src,i)=>`<button type="button" class="thumb${i===0?' active':''}" data-gallery-src="${html(src)}" aria-label="Xem ảnh ${i+1} của ${html(product.name)}" aria-pressed="${i===0?'true':'false'}"><img src="${html(src)}" alt=""></button>`).join('')}</div>`:''}</div>`;
}

function optionGroup(group) {
  const hasDefault = group.options.some(option => option.default);
  return `<fieldset class="option-group" data-option-group data-group-label="${html(group.name)}"><legend>${html(group.name)}</legend><div class="choice-grid">${group.options.map((option,index)=>`<label class="choice"><input type="radio" name="${html(group.id)}" value="${html(option.id)}"${option.default||(!hasDefault&&index===0)?' checked':''} data-option-label="${html(option.label)}" data-custom="${option.allow_custom_text?'true':'false'}"><span>${html(option.label)}</span></label>`).join('')}</div>${group.options.some(o=>o.allow_custom_text)?`<input class="custom-option-input" type="text" name="${html(group.id)}_custom" placeholder="${html(group.options.find(o=>o.allow_custom_text)?.custom_placeholder||'Ghi rõ lựa chọn…')}" aria-label="Ghi rõ ${html(group.name)}" hidden>`:''}</fieldset>`;
}

function quantityControl(product) {
  const q = product.quantity;
  if (!q?.enabled) return '';
  return `<div class="field-row quantity-field" data-quantity-field data-unit="${html(q.unit||'')}"><label for="quantity">${html(q.label||'Số lượng')}</label><div class="quantity-input"><button type="button" data-qty-change="-1" aria-label="Giảm số lượng">−</button><input id="quantity" name="quantity" type="number" min="${q.min_value}" step="${q.step}" value="${q.default_value}" inputmode="numeric"><button type="button" data-qty-change="1" aria-label="Tăng số lượng">+</button><span>${html(q.unit||'')}</span></div></div>`;
}

function simpleConfigurator(product) {
  return quantityControl(product);
}

function variantConfigurator(product) {
  return `${product.option_groups.map(optionGroup).join('')}${quantityControl(product)}`;
}

function componentSubOption(item) {
  if (!item.sub_option) return '';
  const hasDefault = item.sub_option.options.some(option => option.default);
  return `<div class="sub-option" data-component-sub-option>${item.sub_option.options.map((option,index)=>`<label><input type="radio" name="${html(item.id)}_${html(item.sub_option.id)}" value="${html(option.id)}" data-option-label="${html(option.label)}"${option.default||(!hasDefault&&index===0)?' checked':''} disabled> ${html(option.label)}</label>`).join('')}</div>`;
}

function compositeConfigurator(product) {
  const checked = product.components.filter(c=>c.default_selected).length;
  return `<fieldset class="option-group composite"><legend>Chọn thành phần mâm <span class="count-pill" data-derived-count>${checked} mâm</span></legend><p class="helper">Mỗi lễ vật được chọn tương ứng 1 mâm.</p><div class="component-grid">${product.components.map(item=>`<div class="component-item${item.sub_option?' component-item-wide':''}"><label><input type="checkbox" name="component" value="${html(item.id)}" data-component-label="${html(item.label)}"${item.default_selected?' checked':''}><span>${html(item.label)}</span></label>${componentSubOption(item)}${item.allow_custom_text?`<input class="custom-component-input" name="${html(item.id)}_custom" placeholder="${html(item.custom_placeholder)}" aria-label="Ghi rõ ${html(item.label)}" hidden disabled>`:''}</div>`).join('')}</div></fieldset>`;
}

function receiveDateField(product) {
  if (!product.receive_date?.enabled) return '';
  return `<div class="field-row"><label for="receive-date">${html(product.receive_date.label)}</label><input id="receive-date" name="receive_date" type="date"><small>Ngày này sẽ được mang sang bước Đặt hàng; khách có thể sửa lại ở bước cuối.</small></div>`;
}

function noteField(product) {
  if (!product.note.enabled) return '';
  return `<div class="field-row"><label for="note">${html(product.note.label)}</label><textarea id="note" name="note" placeholder="${html(product.note.placeholder||'')}"></textarea></div>`;
}

function initialSummary(product) {
  if (product.type === 'composite') return 'Chưa chọn lễ vật';
  const details = [];
  for (const group of product.option_groups || []) {
    const selected = group.options.find(option => option.default) || group.options[0];
    if (selected) details.push(`${group.name}: ${selected.label}`);
  }
  if (product.quantity?.enabled) details.push(`Số lượng: ${product.quantity.default_value}${product.quantity.unit ? ` ${product.quantity.unit}` : ''}`);
  return details.join(' · ') || 'Sẵn sàng để chọn';
}

function productSummary(product) {
  return `<div class="product-summary" data-product-summary><div><strong>${html(product.name)}</strong><p data-summary-detail aria-live="polite">${html(initialSummary(product))}</p></div><div class="summary-price"><small>Báo giá</small><strong>${html(product.price.display_text)}</strong></div></div>`;
}

function infoBlocks(product) {
  if (!product.info_blocks.length) return '';
  return `<section class="section info-section"><div class="shell"><div class="section-head compact"><h2>Thông tin về ${html(product.name.toLowerCase())}</h2></div><div class="info-grid">${product.info_blocks.map((block,index)=>`<article><span>${String(index+1).padStart(2,'0')}</span><div><h3>${html(block.title)}</h3><p>${html(block.description)}</p></div></article>`).join('')}</div></div></section>`;
}

function relatedProducts(product, products = []) {
  const byId = new Map(products.filter(item => item.status === 'published').map(item => [item.id,item]));
  const related = product.related_products.map(id => byId.get(id)).filter(Boolean).filter(item => item.id !== product.id);
  if (!related.length) return '';
  return `<section class="section related-section"><div class="shell"><div class="section-head compact"><h2>Sản phẩm liên quan</h2></div><div class="related-grid">${related.map(item=>`<article class="related-product"><a class="related-image" href="/${html(item.slug)}/"><img src="${html(item.main_image)}" alt="${html(item.name)}"></a><div class="related-body"><h3><a href="/${html(item.slug)}/">${html(item.name)}</a></h3><p>${html(item.short_description)}</p><div><strong>${html(item.price.display_text)}</strong><a href="/${html(item.slug)}/">Xem sản phẩm →</a></div></div></article>`).join('')}</div></div></section>`;
}

function publishedArticles(articles = []) {
  return articles.filter(article => article.status === 'published').sort((a,b) => (a.featured_order - b.featured_order) || a.title.localeCompare(b.title, 'vi'));
}

function articleCard(article, variant = '') {
  return `<article class="guide-card ${html(variant)}"><a class="guide-image" href="/cam-nang/${html(article.slug)}/"><img src="${html(article.cover.src)}" alt="${html(article.cover.alt)}"></a><div class="guide-body"><h3><a href="/cam-nang/${html(article.slug)}/">${html(article.title)}</a></h3><p>${html(article.excerpt)}</p><a class="guide-link" href="/cam-nang/${html(article.slug)}/">Đọc tiếp →</a></div></article>`;
}

function productRelatedArticles(product, articles = []) {
  const related = publishedArticles(articles).filter(article => article.related_products.includes(product.id)).slice(0,3);
  if (!related.length) return '';
  return `<section class="section guide-related-section"><div class="shell"><div class="section-head compact split-head"><h2>Cẩm nang cưới hỏi</h2><a href="/cam-nang/">Xem tất cả →</a></div><div class="guide-related-grid">${related.map(article => articleCard(article,'compact')).join('')}</div></div></section>`;
}

function renderArticleBlock(block) {
  if (block.type === 'paragraph') return `<p>${html(block.text)}</p>`;
  if (block.type === 'h2') return `<h2>${html(block.text)}</h2>`;
  if (block.type === 'h3') return `<h3>${html(block.text)}</h3>`;
  if (block.type === 'list') return `<ul>${block.items.map(item=>`<li>${html(item)}</li>`).join('')}</ul>`;
  if (block.type === 'callout') return `<aside class="article-callout">${html(block.text)}</aside>`;
  if (block.type === 'image') return `<figure><img src="${html(block.src)}" alt="${html(block.alt)}">${block.caption?`<figcaption>${html(block.caption)}</figcaption>`:''}</figure>`;
  return '';
}

function articleRelatedProducts(article, products = []) {
  const byId = new Map(products.filter(product => product.status === 'published').map(product => [product.id,product]));
  const related = article.related_products.map(id => byId.get(id)).filter(Boolean).slice(0,3);
  if (!related.length) return '';
  return `<section class="article-related"><h2>Sản phẩm liên quan</h2><div class="article-product-links">${related.map(product=>`<a href="/${html(product.slug)}/"><img src="${html(product.main_image)}" alt=""><span><strong>${html(product.name)}</strong><small>${html(product.price.display_text)}</small></span></a>`).join('')}</div></section>`;
}

function articleRelatedArticles(article, articles = []) {
  const byId = new Map(publishedArticles(articles).map(item => [item.id,item]));
  const related = article.related_articles.map(id => byId.get(id)).filter(Boolean).slice(0,3);
  if (!related.length) return '';
  return `<section class="article-related"><h2>Bài viết liên quan</h2><div class="article-related-list">${related.map(item=>`<a href="/cam-nang/${html(item.slug)}/"><strong>${html(item.title)}</strong><span>Đọc tiếp →</span></a>`).join('')}</div></section>`;
}

export function renderProductPage(site, product, products = [], articles = []) {
  const configurator = product.type==='composite' ? compositeConfigurator(product) : product.type==='variant' ? variantConfigurator(product) : simpleConfigurator(product);
  const secondaryFields = product.type === 'composite' ? `<div class="config-meta-grid">${receiveDateField(product)}${noteField(product)}</div>` : noteField(product);
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><span>${html(product.name)}</span></div><section class="section product-top"><div class="shell product-grid">${productImage(product,true)}<div class="product-config"><h1>${html(product.name)}</h1><div class="price">${html(product.price.display_text)}</div><p class="lead">${html(product.short_description)}</p><form data-product-form data-product-id="${html(product.id)}" data-product-name="${html(product.name)}" data-product-type="${html(product.type)}">${configurator}${secondaryFields}${productSummary(product)}<div class="cta-row"><button type="button" class="btn btn-primary product-cart-cta" data-add-to-cart>Thêm vào giỏ hàng</button><a class="btn btn-outline" href="${html(site.zalo)}" target="_blank" rel="noopener">Liên hệ Shop</a></div><p class="cart-action-note" role="status" aria-live="polite" data-cart-action-note hidden></p><p class="microcopy">Shop khuyến nghị đặt trước 3–5 ngày. Đơn sẽ được xác nhận trước khi chuẩn bị.</p></form></div></div></section>${infoBlocks(product)}${productRelatedArticles(product,articles)}${relatedProducts(product,products)}`;
  return renderShell({site,title:product.seo.title,description:product.seo.description,canonicalPath:`/${product.slug}/`,active:product.slug,body,bodyClass:`product-page product-${html(product.type)}`});
}

function homeGuideSection(articles = []) {
  const list = publishedArticles(articles).slice(0,3);
  if (!list.length) return '';
  const [featured,...rest] = list;
  return `<section class="section home-guides" id="cam-nang"><div class="shell"><div class="section-head split-head"><div><h2>Cẩm nang cưới hỏi</h2><p>Các bài hướng dẫn chuẩn bị bánh và mâm quả.</p></div><a href="/cam-nang/">Xem tất cả →</a></div><div class="home-guide-layout">${articleCard(featured,'featured')}${rest.length?`<div class="home-guide-side">${rest.map(article=>articleCard(article,'side')).join('')}</div>`:''}</div></div></section>`;
}

function homeFaq() {
  const items = [
    ['Có cần đặt cọc không?','Shop sẽ thông báo thông tin đặt cọc khi xác nhận đơn, tùy theo sản phẩm và số lượng.'],
    ['Shop giao hàng ở đâu?','Shop nhận giao hàng tại TP.HCM. Khu vực và chi tiết giao hàng sẽ được xác nhận khi chốt đơn.'],
    ['Nên đặt trước bao lâu?','Shop khuyến nghị đặt trước 3–5 ngày để có thời gian chuẩn bị đơn.'],
    ['Có thể đổi hoặc hủy đơn không?','Nếu cần thay đổi hoặc hủy đơn, vui lòng liên hệ Shop sớm để kiểm tra tình trạng chuẩn bị và được hỗ trợ.']
  ];
  return `<section class="section soft home-faq"><div class="shell faq-grid"><div><h2>Câu hỏi thường gặp</h2><p>Thông tin cần biết trước khi gửi yêu cầu đặt bánh và mâm quả tại Shop Uyên Ương.</p></div><div class="faq-list">${items.map(([q,a],i)=>`<details${i===0?' open':''}><summary>${html(q)}<span aria-hidden="true">⌄</span></summary><p>${html(a)}</p></details>`).join('')}</div></div></section>`;
}

export function renderHome(site, products, articles = []) {
  const featuredIds = ['banh-phu-the','mam-qua-cuoi','banh-phuc-linh'];
  const cards = featuredIds.map(id=>products.find(p=>p.id===id)).filter(Boolean).map((p,i)=>`<article class="product-card ${i===0?'featured':''}"><a class="card-image" href="/${html(p.slug)}/"><img src="${html(p.main_image)}" alt="${html(p.name)}"></a><div class="card-body"><div class="card-title-row"><h2><a href="/${html(p.slug)}/">${html(p.name)}</a></h2><span>${html(p.price.display_text)}</span></div><p>${html(p.short_description)}</p><div class="card-actions"><a href="/${html(p.slug)}/">${i===1?'Chọn mâm quả':'Xem sản phẩm'} →</a></div></div></article>`).join('');
  const body = `<section class="hero"><div class="shell hero-grid"><div class="hero-copy"><h1>Bánh phu thê &amp; mâm quả cưới tại TP.HCM</h1><p>Shop nhận bánh phu thê, mâm quả cưới và bánh phục linh. Chọn sản phẩm trên website, Shop sẽ liên hệ xác nhận chi tiết trước khi chuẩn bị.</p><div class="cta-row"><a class="btn btn-primary" href="#san-pham">Xem sản phẩm</a><a class="btn btn-outline" href="${html(site.zalo)}" target="_blank" rel="noopener">Nhắn Zalo</a></div></div><div class="hero-media"><img src="/assets/images/products/mam-qua-cuoi.jpg" alt="Mâm quả cưới tại Shop Uyên Ương" fetchpriority="high"></div></div></section><div class="home-assurance"><div class="shell"><span>Đặt trước 3–5 ngày</span><i aria-hidden="true">•</i><span>Giao tại TP.HCM</span><i aria-hidden="true">•</i><span>Shop xác nhận trước khi chuẩn bị</span></div></div><section class="section" id="san-pham"><div class="shell"><div class="section-head"><h2>Sản phẩm của Shop</h2><p>Chọn nhóm sản phẩm cần xem.</p></div><div class="home-products">${cards}</div></div></section><section class="section soft"><div class="shell"><div class="section-head centered"><h2>Cách đặt hàng</h2></div><div class="steps"><article><span>01</span><h3>Chọn sản phẩm</h3><p>Xem sản phẩm và chọn các tùy chọn cần thiết.</p></article><article><span>02</span><h3>Gửi yêu cầu</h3><p>Thêm vào giỏ và điền thông tin nhận hàng.</p></article><article><span>03</span><h3>Shop xác nhận</h3><p>Shop liên hệ lại trước khi chuẩn bị.</p></article></div></div></section>${homeGuideSection(articles)}${homeFaq()}<section class="home-final-cta"><div class="shell"><div><h2>Cần Shop hỗ trợ thêm?</h2><p>Liên hệ trực tiếp qua Zalo hoặc điện thoại.</p></div><div class="cta-row"><a class="btn btn-primary" href="${html(site.zalo)}" target="_blank" rel="noopener">Nhắn Zalo</a><a class="btn btn-outline" href="tel:${html(site.hotline)}">Gọi ${html(site.hotline_display)}</a></div></div></section>`;
  return renderShell({site,title:site.seo.title,description:site.seo.description,canonicalPath:'/',active:'home',body,bodyClass:'home-page'});
}

export function renderGuideHub(site, articles = []) {
  const list = publishedArticles(articles);
  const [featured,...rest] = list;
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><span>Cẩm nang</span></div><section class="section guide-hub"><div class="shell"><div class="page-intro"><h1>Cẩm nang</h1><p>Các bài hướng dẫn về bánh phu thê, mâm quả cưới và cách chuẩn bị theo nhu cầu của từng gia đình.</p></div>${featured?`<div class="guide-hub-layout">${articleCard(featured,'featured')}${rest.length?`<div class="guide-hub-side">${rest.slice(0,2).map(article=>articleCard(article,'side')).join('')}</div>`:''}</div>${rest.length>2?`<div class="guide-list-more">${rest.slice(2).map(article=>articleCard(article,'compact')).join('')}</div>`:''}`:`<div class="empty-content"><h2>Nội dung đang được chuẩn bị</h2><p>Khi bài viết được xuất bản từ Admin, trang này sẽ hiển thị tự động.</p></div>`}</div></section>`;
  return renderShell({site,title:`Cẩm nang | ${site.name}`,description:'Cẩm nang của Shop Uyên Ương về bánh phu thê, mâm quả cưới và bánh phục linh.',canonicalPath:'/cam-nang/',active:'cam-nang',body,bodyClass:'guide-hub-page'});
}

export function renderCategoryHub(site, category, articles = []) {
  const list = publishedArticles(articles).filter(article => article.category === category.id);
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><a href="/cam-nang/">Cẩm nang</a><span>/</span><span>${html(category.name)}</span></div><section class="section guide-hub category-hub"><div class="shell"><div class="page-intro"><h1>${html(category.name)}</h1>${category.description?`<p>${html(category.description)}</p>`:''}</div>${list.length?`<div class="guide-list-more category-list">${list.map(article=>articleCard(article,'compact')).join('')}</div>`:`<div class="empty-content"><h2>Chưa có bài viết</h2><p>Các bài thuộc chuyên mục này sẽ hiển thị khi được xuất bản.</p></div>`}</div></section>`;
  return renderShell({site,title:`${category.name} | ${site.name}`,description:category.description||`Bài viết ${category.name} tại ${site.name}.`,canonicalPath:`/cam-nang/${category.slug}/`,active:'cam-nang',body,bodyClass:'guide-hub-page category-hub-page'});
}

export function renderArticlePage(site, article, articles = [], products = []) {
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><a href="/cam-nang/">Cẩm nang</a><span>/</span><span>${html(article.title)}</span></div><article class="article-page"><header class="shell article-header"><div class="article-heading"><h1>${html(article.title)}</h1><p>${html(article.excerpt)}</p></div><figure class="article-cover"><img src="${html(article.cover.src)}" alt="${html(article.cover.alt)}" fetchpriority="high"></figure></header><div class="shell article-layout"><div class="article-content">${article.blocks.map(renderArticleBlock).join('')}</div><aside class="article-side">${articleRelatedProducts(article,products)}</aside></div><div class="shell article-footer-related">${articleRelatedArticles(article,articles)}</div></article>`;
  return renderShell({site,title:article.seo.title,description:article.seo.description,canonicalPath:`/cam-nang/${article.slug}/`,active:'cam-nang',body,bodyClass:'article-detail-page'});
}

export function renderContact(site) {
  const fanpages = site.fanpages.map(page=>`<li><a href="${html(page.url)}" target="_blank" rel="noopener">${html(page.label)} →</a></li>`).join('');
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><span>Liên hệ</span></div><section class="section contact-page-section"><div class="shell"><div class="page-intro"><h1>Liên hệ Shop Uyên Ương</h1><p>Liên hệ Shop để được hỗ trợ về bánh phu thê, mâm quả cưới và bánh phục linh.</p></div><div class="contact-grid"><div class="contact-info"><dl class="contact-list"><div><dt>Địa chỉ</dt><dd>${html(site.address)}</dd></div><div><dt>Hotline / Zalo</dt><dd><a href="tel:${html(site.hotline)}">${html(site.hotline_display)}</a></dd></div></dl><div class="cta-row"><a class="btn btn-primary" href="${html(site.zalo)}" target="_blank" rel="noopener">Nhắn Zalo</a><a class="btn btn-outline" href="tel:${html(site.hotline)}">Gọi ${html(site.hotline_display)}</a></div><div class="official-channels"><h2>Kênh chính thức</h2><ul>${fanpages}<li><a href="${html(site.zalo)}" target="_blank" rel="noopener">Zalo tư vấn trực tiếp →</a></li></ul></div></div><form class="contact-form" data-preview-form><h2>Gửi tin nhắn cho Shop</h2><label>Họ và tên<input name="name" autocomplete="name" required placeholder="Nhập họ và tên"></label><label>Số điện thoại<input name="phone" inputmode="tel" autocomplete="tel" required placeholder="Nhập số điện thoại"></label><label>Nội dung cần hỗ trợ<textarea name="message" required placeholder="Shop cần hỗ trợ nội dung gì?"></textarea></label><button type="submit" class="btn btn-primary">Gửi yêu cầu</button><p class="form-note" hidden data-preview-note>Form liên hệ sẽ được kết nối ở giai đoạn API.</p></form></div></div></section>`;
  return renderShell({site,title:`Liên hệ | ${site.name}`,description:`Liên hệ ${site.name} tại TP.HCM.`,canonicalPath:'/lien-he/',active:'lien-he',body,bodyClass:'contact-page'});
}

export function renderCart(site) {
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><span>Giỏ hàng</span></div><section class="section commerce-page"><div class="shell"><div class="page-intro"><h1>Giỏ hàng</h1><p>Kiểm tra sản phẩm trước khi gửi yêu cầu đặt hàng.</p></div><div class="cart-layout" data-cart-page><div class="cart-main"><div class="cart-items" data-cart-list aria-live="polite"></div><div class="empty-content cart-empty" data-cart-empty hidden><h2>Giỏ hàng đang trống</h2><p>Chọn sản phẩm để bắt đầu đặt hàng.</p><a class="btn btn-primary" href="/">Xem sản phẩm</a></div></div><aside class="commerce-summary cart-summary" data-cart-summary hidden><h2>Tóm tắt</h2><dl><div><dt>Số lượng sản phẩm</dt><dd><span data-cart-line-count>0</span> sản phẩm</dd></div><div><dt>Giá</dt><dd>Shop sẽ xác nhận</dd></div></dl><p>Shop sẽ liên hệ xác nhận giá và thông tin đơn hàng.</p><a class="btn btn-primary btn-block" href="/dat-hang/">Tiếp tục đặt hàng</a><a class="btn btn-outline btn-block" href="/">Chọn thêm sản phẩm</a></aside></div></div></section>`;
  return renderShell({site,title:`Giỏ hàng | ${site.name}`,description:'Giỏ hàng Shop Uyên Ương.',canonicalPath:'/gio-hang/',robots:'noindex,follow',body,bodyClass:'cart-page'});
}

export function renderCheckout(site) {
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><span>Đặt hàng</span></div><section class="section commerce-page checkout-page"><div class="shell"><div data-checkout-default><div class="page-intro"><h1>Đặt hàng</h1><p>Điền thông tin nhận hàng. Shop sẽ liên hệ xác nhận trước khi chuẩn bị.</p></div><div class="order-grid"><div><section class="order-section"><h2>Sản phẩm đã chọn</h2><div class="checkout-items" data-checkout-items></div><div class="empty-inline" data-checkout-empty hidden>Giỏ hàng đang trống. <a href="/">Chọn sản phẩm</a> để tiếp tục.</div></section><section class="order-section add-more"><h2>Chọn thêm</h2><div class="add-more-list"><a href="/banh-phu-the/"><span><strong>Bánh phu thê</strong><small>Có hộp giấy và lá dừa.</small></span><b>+ Thêm</b></a><a href="/mam-qua-cuoi/"><span><strong>Mâm quả cưới</strong><small>Chọn các lễ vật gia đình cần.</small></span><b>Chọn lễ vật →</b></a><a href="/banh-phuc-linh/"><span><strong>Bánh phục linh</strong><small>Chọn vị và số lượng khi đặt.</small></span><b>+ Thêm</b></a></div></section><form class="order-section form-grid" data-order-form novalidate><h2>Thông tin nhận hàng</h2><p class="form-intro full">Vui lòng cung cấp thông tin nhận hàng để Shop liên hệ xác nhận đơn.</p><label>Họ và tên<input name="customer_name" autocomplete="name" required maxlength="150"></label><label>Số điện thoại<input name="phone" inputmode="tel" autocomplete="tel" required maxlength="35"></label><label class="full">Địa chỉ nhận hàng<input name="address" autocomplete="street-address" required maxlength="600"></label><label>Ngày nhận<input name="receive_date" type="date" required><small>Shop khuyến nghị đặt trước 3–5 ngày.</small></label><label class="full">Ghi chú<textarea name="note" maxlength="1000" placeholder="Yêu cầu thêm cho Shop…"></textarea></label><div class="form-error full" data-order-error role="alert" hidden></div><button class="btn btn-primary" type="submit" data-order-submit>Gửi yêu cầu đặt hàng</button><a class="btn btn-outline" href="/gio-hang/">Quay lại giỏ hàng</a></form></div><aside class="commerce-summary order-summary"><h2>Tóm tắt đơn hàng</h2><div class="order-summary-items" data-order-summary-items></div><dl><div><dt>Số sản phẩm</dt><dd><span data-order-line-count>0</span></dd></div><div><dt>Giá đơn hàng</dt><dd>Shop sẽ xác nhận</dd></div></dl><p>Shop sẽ liên hệ xác nhận giá và thông tin đơn hàng trước khi chuẩn bị.</p></aside></div></div><div class="checkout-state success-state" data-order-success hidden><div class="state-icon" aria-hidden="true">✓</div><h1>Yêu cầu đã ghi nhận</h1><p>Shop sẽ liên hệ để xác nhận thông tin đơn hàng.</p><div class="cta-row"><a class="btn btn-primary" href="${html(site.zalo)}" target="_blank" rel="noopener">Nhắn Zalo với Shop</a><a class="btn btn-outline" href="/">Về trang chủ</a></div></div><div class="checkout-state rate-limit-state" data-order-rate-limit hidden><div class="state-icon warning" aria-hidden="true">!</div><h1>Chưa thể gửi yêu cầu</h1><p>Đã nhận quá nhiều đơn hàng. Vui lòng thử lại sau.</p><div class="cta-row"><button class="btn btn-primary" type="button" data-return-order>Quay lại đặt hàng</button><a class="btn btn-outline" href="${html(site.zalo)}" target="_blank" rel="noopener">Nhắn Zalo với Shop</a></div></div></div></section>`;
  return renderShell({site,title:`Đặt hàng | ${site.name}`,description:'Gửi yêu cầu đặt hàng tại Shop Uyên Ương.',canonicalPath:'/dat-hang/',robots:'noindex,follow',body,bodyClass:'checkout-page'});
}
