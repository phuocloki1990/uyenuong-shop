const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const nav = [
  ['home','Trang chủ','/'],
  ['banh-phu-the','Bánh phu thê','/banh-phu-the/'],
  ['mam-qua-cuoi','Mâm quả cưới','/mam-qua-cuoi/'],
  ['banh-phuc-linh','Bánh phục linh','/banh-phuc-linh/'],
  ['cam-nang','Cẩm nang','/cam-nang/'],
  ['lien-he','Liên hệ','/lien-he/']
];

const icon = name => {
  const paths = {
    bag:'<path d="M6.5 8.5h11l1 11h-13l1-11Z"/><path d="M9 9V6.8a3 3 0 0 1 6 0V9"/>',
    chat:'<path d="M5 5.5h14v10H9l-4 3v-13Z"/><path d="M8.5 9.5h7M8.5 12h5"/>',
    phone:'<path d="M7.2 4.8 9 8.4 7.5 10c1 2 2.5 3.5 4.5 4.5L13.6 13l3.6 1.8-.6 3c-.2 1-1.2 1.7-2.2 1.5C8.5 18.2 3.8 13.5 2.7 7.6c-.2-1 .5-2 1.5-2.2l3-.6Z"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
    home:'<path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4v-9Z"/>',
    pin:'<path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||''}</svg>`;
};

function header(site, active = '') {
  const links = nav.map(([key,label,href]) => `<a${key===active?' aria-current="page" class="active"':''} href="${href}">${label}</a>`).join('');
  return `<header class="site-header">
    <div class="shell header-row">
      <a class="brand" href="/" aria-label="${html(site.name)} – Trang chủ">
        <img src="/assets/images/logo-header.jpg" alt="${html(site.name)}" width="48" height="38">
        <span><strong>${html(site.name)}</strong><small>${html(site.brand_line)}</small></span>
      </a>
      <nav class="desktop-nav" aria-label="Điều hướng chính">${links}</nav>
      <div class="header-actions">
        <a class="hotline" href="tel:${html(site.hotline)}"><small>Hotline tư vấn</small><strong>${html(site.hotline_display)}</strong></a>
        <a class="cart-link" href="/gio-hang/" aria-label="Xem giỏ hàng">${icon('bag')}<span data-cart-count aria-live="polite" aria-atomic="true">0</span></a>
        <a class="btn btn-primary btn-small desktop-zalo" href="${html(site.zalo)}" target="_blank" rel="noopener">${icon('chat')}Chat Zalo</a>
        <button class="menu-toggle" type="button" aria-label="Mở menu" aria-expanded="false" aria-controls="mobile-menu">${icon('menu')}</button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-menu" aria-label="Điều hướng điện thoại" hidden>${links}<div class="mobile-nav-contact"><a href="tel:${html(site.hotline)}">${html(site.hotline_display)}</a><a href="${html(site.zalo)}" target="_blank" rel="noopener">Chat Zalo</a></div></nav>
  </header>`;
}

function footer(site) {
  const fanpages = site.fanpages.map(p => `<li><a href="${html(p.url)}" target="_blank" rel="noopener">${html(p.label)}</a></li>`).join('');
  return `<footer class="site-footer" id="thong-tin-shop">
    <div class="shell footer-grid">
      <div class="footer-about"><a class="footer-brand" href="/">${html(site.name)}</a><p>Bánh phu thê, mâm quả cưới và bánh phục linh tại TP.HCM.</p></div>
      <div><h2>Liên hệ đặt hàng</h2><ul><li class="footer-address">${html(site.address)}</li><li>Hotline/Zalo:&nbsp;<a href="tel:${html(site.hotline)}">${html(site.hotline_display)}</a></li></ul></div>
      <div><h2>Kênh chính thức</h2><ul><li><a href="tel:${html(site.hotline)}">Hotline: ${html(site.hotline_display)}</a></li><li><a href="${html(site.zalo)}" target="_blank" rel="noopener">Zalo: ${html(site.hotline_display)}</a></li>${fanpages}</ul></div>
    </div>
    <div class="shell footer-bottom"><span>© 2026 ${html(site.name)}.</span></div>
  </footer>`;
}
function floating(site) {
  return `<div class="floating-contact" aria-label="Liên hệ nhanh"><a href="tel:${html(site.hotline)}">${icon('phone')}<span>Gọi Shop</span></a><a class="zalo" href="${html(site.zalo)}" target="_blank" rel="noopener">${icon('chat')}<span>Zalo</span></a></div>`;
}

const imageDimensions = {
  '/assets/images/logo-header.jpg':[530,450],
  '/assets/images/logo.jpg':[1122,1122],
  '/assets/images/products/banh-phu-the.jpg':[1440,1920],
  '/assets/images/products/banh-phuc-linh.jpg':[752,1020],
  '/assets/images/products/mam-qua-cuoi.jpg':[1183,2560],
  '/assets/images/articles/kinh-nghiem-chon-mam-qua-cuoi-cho-gia-dinh.jpg':[1183,2560],
  '/assets/images/articles/mam-qua-cuoi-thuong-co-nhung-gi.jpg':[1183,2560],
  '/assets/images/articles/nen-chuan-bi-so-luong-banh-phu-the-bao-nhieu.jpg':[1440,1920]
};
const imageSizeAttrs = src => {
  const size = imageDimensions[src];
  return size ? ` width="${size[0]}" height="${size[1]}"` : '';
};
const absoluteUrl = (site, path = '/') => `${site.canonical_domain.replace(/\/$/,'')}${String(path).startsWith('/') ? path : `/${path}`}`;
const jsonLd = value => JSON.stringify(value).replace(/</g,'\\u003c');
const money = amount => `${new Intl.NumberFormat('vi-VN').format(Number(amount || 0))}đ`;

function localBusinessSchema(site) {
  return {
    '@context':'https://schema.org',
    '@type':'LocalBusiness',
    name:site.name,
    url:absoluteUrl(site,'/'),
    image:absoluteUrl(site,'/assets/images/logo.jpg'),
    telephone:site.hotline_display,
    address:site.address,
    sameAs:[site.zalo,...(site.fanpages || []).map(page => page.url)].filter(Boolean)
  };
}

function faqSchema(items) {
  return {
    '@context':'https://schema.org',
    '@type':'FAQPage',
    mainEntity:items.map(([question,answer]) => ({
      '@type':'Question',
      name:question,
      acceptedAnswer:{ '@type':'Answer', text:answer }
    }))
  };
}

export function renderShell({ site, title, description, canonicalPath, active='', body, robots='index,follow', bodyClass='', ogImage='/assets/images/logo.jpg', ogType='website', extraSchemas=[] }) {
  const canonical = absoluteUrl(site, canonicalPath);
  const socialImage = absoluteUrl(site, ogImage);
  const schemas = [localBusinessSchema(site), ...extraSchemas];
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><meta name="description" content="${html(description)}"><meta name="robots" content="${html(robots)}"><link rel="canonical" href="${html(canonical)}"><meta property="og:locale" content="vi_VN"><meta property="og:type" content="${html(ogType)}"><meta property="og:title" content="${html(title)}"><meta property="og:description" content="${html(description)}"><meta property="og:url" content="${html(canonical)}"><meta property="og:image" content="${html(socialImage)}"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/images/logo-header.jpg" type="image/jpeg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/css/site.css">${schemas.map(schema=>`<script type="application/ld+json">${jsonLd(schema)}</script>`).join('')}</head><body class="${html(bodyClass)}">${header(site,active)}<main>${body}</main>${footer(site)}${floating(site)}<script src="/assets/js/product-catalog.js" defer></script><script src="/assets/js/site.js" defer></script></body></html>`;
}

function productImage(product, eager=false) {
  const images = [product.main_image, ...product.gallery.filter(src => src !== product.main_image)];
  const thumbs = images.length > 1 ? `<div class="thumb-row" aria-label="Ảnh ${html(product.name)}">${images.map((src,i)=>`<button type="button" class="thumb${i===0?' active':''}" data-gallery-src="${html(src)}" aria-label="Xem ảnh ${i+1} của ${html(product.name)}" aria-pressed="${i===0?'true':'false'}"><img src="${html(src)}" alt=""${imageSizeAttrs(src)} loading="lazy" decoding="async"></button>`).join('')}</div>` : '';
  return `<div class="product-gallery"><div class="main-image"><img src="${html(product.main_image)}" alt="${html(product.name)}"${imageSizeAttrs(product.main_image)}${eager?' fetchpriority="high"':' loading="lazy"'} decoding="async"></div>${thumbs}</div>`;
}
function optionGroup(group) {
  const hasDefault = group.options.some(option => option.default);
  return `<fieldset class="option-group" data-option-group data-group-label="${html(group.name)}"><legend>${html(group.name)}</legend><div class="choice-grid">${group.options.map((option,index)=>`<label class="choice"><input type="radio" name="${html(group.id)}" value="${html(option.id)}"${option.default||(!hasDefault&&index===0)?' checked':''} data-option-label="${html(option.label)}" data-custom="${option.allow_custom_text?'true':'false'}"><span>${html(option.label)}</span></label>`).join('')}</div>${group.options.some(o=>o.allow_custom_text)?`<input class="custom-option-input" type="text" name="${html(group.id)}_custom" placeholder="${html(group.options.find(o=>o.allow_custom_text)?.custom_placeholder||'Ghi rõ lựa chọn…')}" aria-label="Ghi rõ ${html(group.name)}" hidden>`:''}</fieldset>`;
}

function customerQuantityHint(product) {
  if (product.id === 'banh-phuc-linh') return 'Có thể nhập số lượng mong muốn. Số lượng khác: Shop báo giá khi xác nhận.';
  return product.quantity?.hint || '';
}
function quantityPresets(product) {
  if (product.id !== 'banh-phu-the') return '';
  return `<div class="quantity-presets" aria-label="Chọn nhanh số lượng bánh">${[20,65,105].map(value=>`<button type="button" data-qty-preset="${value}">${value}</button>`).join('')}</div>`;
}
function quantityControl(product) {
  const q = product.quantity;
  if (!q?.enabled) return '';
  const hint = customerQuantityHint(product);
  return `<div class="field-row quantity-field" data-quantity-field data-unit="${html(q.unit||'')}"><label for="quantity">${html(q.label||'Số lượng')}</label><div class="quantity-input"><button type="button" data-qty-change="-1" aria-label="Giảm số lượng">−</button><input id="quantity" name="quantity" type="number" min="${q.min_value}" step="${q.step}" value="${q.default_value}" inputmode="numeric"><button type="button" data-qty-change="1" aria-label="Tăng số lượng">+</button><span>${html(q.unit||'')}</span></div>${quantityPresets(product)}${hint?`<small class="quantity-hint">${html(hint)}</small>`:''}</div>`;
}

function simpleConfigurator(product) { return quantityControl(product); }
function variantConfigurator(product) { return `${product.option_groups.map(optionGroup).join('')}${quantityControl(product)}`; }

function componentSubOption(item) {
  if (!item.sub_option) return '';
  const hasDefault = item.sub_option.options.some(option => option.default);
  return `<div class="sub-option" data-component-sub-option hidden><span>${html(item.sub_option.name)}</span>${item.sub_option.options.map((option,index)=>`<label><input type="radio" name="${html(item.id)}_${html(item.sub_option.id)}" value="${html(option.id)}" data-option-label="${html(option.label)}"${option.default||(!hasDefault&&index===0)?' checked':''} disabled> ${html(option.label)}</label>`).join('')}</div>`;
}

function compositeConfigurator(product) {
  const checked = product.components.filter(c=>c.default_selected).length;
  return `<fieldset class="option-group composite"><legend>Chọn thành phần mâm <span class="count-pill" data-derived-count>${checked} mâm</span></legend><p class="helper">Mỗi lễ vật được chọn tương ứng 1 mâm.</p><div class="component-grid">${product.components.map(item=>`<div class="component-item${item.sub_option?' component-item-wide':''}"><label><input type="checkbox" name="component" value="${html(item.id)}" data-component-label="${html(item.label)}"${item.default_selected?' checked':''}><span>${html(item.label)}</span></label>${componentSubOption(item)}${item.allow_custom_text?`<input class="custom-component-input" name="${html(item.id)}_custom" placeholder="${html(item.custom_placeholder)}" aria-label="Ghi rõ ${html(item.label)}" hidden disabled>`:''}</div>`).join('')}</div></fieldset>`;
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
  return `<div class="product-summary" data-product-summary><div class="product-summary-copy"><strong>${html(product.name)}</strong><p data-summary-detail aria-live="polite">${html(initialSummary(product))}</p></div><div class="summary-price"><span>Giá</span><strong data-summary-price>${html(product.price.display_text)}</strong></div></div>`;
}
function customerInfoBlocks(product) {
  return product.info_blocks.map(block => {
    if (product.id === 'banh-phuc-linh' && block.title === 'Giá theo quy cách') {
      return { ...block, description:'2 vị - 30 bánh: 180.000đ; 2 vị - 50 bánh: 230.000đ. Số lượng khác: Shop báo giá khi xác nhận.' };
    }
    return block;
  });
}
function infoBlocks(product) {
  if (!product.info_blocks.length) return '';
  const blocks = customerInfoBlocks(product);
  if (!blocks.some(block => /thời gian/i.test(block.title))) blocks.push({ title:'Thời gian chuẩn bị', description:'Shop khuyến nghị đặt trước 3–5 ngày.' });
  return `<section class="section product-info-section"><div class="shell"><div class="product-facts"><h2>Thông tin về ${html(product.name.toLowerCase())}</h2><dl>${blocks.map(block=>`<div><dt>${html(block.title)}</dt><dd>${html(block.description)}</dd></div>`).join('')}</dl></div></div></section>`;
}
function relatedProducts(product, products = []) {
  const byId = new Map(products.filter(item => item.status === 'published').map(item => [item.id,item]));
  const related = product.related_products.map(id => byId.get(id)).filter(Boolean).filter(item => item.id !== product.id);
  if (!related.length) return '';
  return `<section class="section related-section"><div class="shell"><div class="section-head compact split-head"><div><span class="eyebrow">Xem thêm</span><h2>Sản phẩm liên quan</h2></div></div><div class="related-grid">${related.map(item=>`<article class="related-product"><a class="related-image" href="/${html(item.slug)}/"><img src="${html(item.main_image)}" alt="${html(item.name)}"${imageSizeAttrs(item.main_image)} loading="lazy" decoding="async"></a><div class="related-body"><h3><a href="/${html(item.slug)}/">${html(item.name)}</a></h3><p>${html(item.short_description)}</p><div><strong>${html(item.price.display_text)}</strong><a href="/${html(item.slug)}/">Xem sản phẩm ${icon('arrow')}</a></div></div></article>`).join('')}</div></div></section>`;
}

function publishedArticles(articles = []) { return articles.filter(article => article.status === 'published').sort((a,b) => (a.featured_order - b.featured_order) || a.title.localeCompare(b.title, 'vi')); }
function articleCard(article, variant = '') {
  return `<article class="guide-card ${html(variant)}"><a class="guide-image" href="/cam-nang/${html(article.slug)}/"><img src="${html(article.cover.src)}" alt="${html(article.cover.alt)}"${imageSizeAttrs(article.cover.src)} loading="lazy" decoding="async"></a><div class="guide-body"><span class="guide-kicker">Cẩm nang cưới hỏi</span><h3><a href="/cam-nang/${html(article.slug)}/">${html(article.title)}</a></h3><p>${html(article.excerpt)}</p><a class="guide-link" href="/cam-nang/${html(article.slug)}/">Đọc bài viết ${icon('arrow')}</a></div></article>`;
}
function productRelatedArticles(product, articles = []) {
  const related = publishedArticles(articles).filter(article => article.related_products.includes(product.id)).slice(0,3);
  if (!related.length) return '';
  return `<section class="section guide-related-section product-guides"><div class="shell"><div class="section-head compact split-head"><div><span class="eyebrow">Tham khảo</span><h2>Cẩm nang cưới hỏi</h2></div><a href="/cam-nang/">Xem tất cả ${icon('arrow')}</a></div><div class="product-guide-grid product-guide-grid-${related.length}">${related.map(article => articleCard(article,'product-guide')).join('')}</div></div></section>`;
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
  return `<section class="article-product-promo" aria-label="Sản phẩm liên quan">${related.map(product=>`<a href="/${html(product.slug)}/"><span class="article-product-icon">${icon('bag')}</span><span><strong>${html(product.name)}</strong><small>${html(product.short_description)} · ${html(product.price.display_text)}</small></span><b>Xem sản phẩm ${icon('arrow')}</b></a>`).join('')}</section>`;
}
function articleRelatedArticles(article, articles = []) {
  const byId = new Map(publishedArticles(articles).map(item => [item.id,item]));
  const related = article.related_articles.map(id => byId.get(id)).filter(Boolean).slice(0,2);
  if (!related.length) return '';
  return `<section class="article-related-guides"><div class="article-related-head"><h2>Bài viết liên quan</h2><a href="/cam-nang/">Xem tất cả cẩm nang</a></div><div class="article-related-grid">${related.map(item=>`<article><a class="article-related-image" href="/cam-nang/${html(item.slug)}/"><img src="${html(item.cover.src)}" alt="${html(item.cover.alt)}"${imageSizeAttrs(item.cover.src)} loading="lazy" decoding="async"></a><h3><a href="/cam-nang/${html(item.slug)}/">${html(item.title)}</a></h3><p>${html(item.excerpt)}</p><a class="guide-link" href="/cam-nang/${html(item.slug)}/">Đọc bài viết ${icon('arrow')}</a></article>`).join('')}</div></section>`;
}

export function renderProductPage(site, product, products = [], articles = []) {
  const configurator = product.type==='composite' ? compositeConfigurator(product) : product.type==='variant' ? variantConfigurator(product) : simpleConfigurator(product);
  const secondaryFields = noteField(product);
  const body = `<div class="shell breadcrumb"><a href="/">${icon('home')}<span>Trang chủ</span></a><span>/</span><span>${html(product.name)}</span></div><section class="section product-top"><div class="shell product-grid">${productImage(product,true)}<div class="product-config"><span class="eyebrow">Sản phẩm Shop Uyên Ương</span><div class="product-title-row"><h1>${html(product.name)}</h1><div class="price" data-product-price>${html(product.price.display_text)}</div></div><p class="lead">${html(product.short_description)}</p><form data-product-form data-product-id="${html(product.id)}" data-product-name="${html(product.name)}" data-product-type="${html(product.type)}">${configurator}${secondaryFields}${productSummary(product)}<div class="cta-row product-actions"><button type="button" class="btn btn-primary product-cart-cta" data-add-to-cart>${icon('bag')}Thêm vào giỏ hàng</button><a class="btn btn-outline" href="${html(site.zalo)}" target="_blank" rel="noopener">${icon('chat')}Liên hệ Shop</a></div><div class="cart-action-note" role="status" aria-live="polite" data-cart-action-note hidden><span data-cart-action-text></span><a class="cart-action-link" href="/gio-hang/">Xem giỏ hàng →</a></div><p class="microcopy">Shop khuyến nghị đặt trước 3–5 ngày. Đơn sẽ được xác nhận trước khi chuẩn bị.</p></form></div></div></section>${infoBlocks(product)}${productRelatedArticles(product,articles)}${relatedProducts(product,products)}`;
  const seoDescription = product.id === 'banh-phuc-linh' ? 'Bánh phục linh tại TP.HCM. Chọn 2 vị hoặc 5 vị và số lượng mong muốn. Quy cách khác được Shop báo giá khi xác nhận.' : product.seo.description;
  return renderShell({site,title:product.seo.title,description:seoDescription,canonicalPath:`/${product.slug}/`,active:product.slug,body,bodyClass:`product-page product-${html(product.type)}`,ogImage:product.main_image});
}

function homeGuideSection(articles = []) {
  const list = publishedArticles(articles).slice(0,3);
  if (!list.length) return '';
  const [featured,...rest] = list;
  return `<section class="section home-guides" id="cam-nang" data-reveal><div class="shell"><div class="home-section-title"><h2>Cẩm nang cưới hỏi</h2><a href="/cam-nang/">Xem tất cả ${icon('arrow')}</a></div><div class="home-guide-editorial"><article class="home-guide-feature"><a class="home-guide-feature-image" href="/cam-nang/${html(featured.slug)}/"><img src="${html(featured.cover.src)}" alt="${html(featured.cover.alt)}"${imageSizeAttrs(featured.cover.src)} loading="lazy" decoding="async"></a><div><h3><a href="/cam-nang/${html(featured.slug)}/">${html(featured.title)}</a></h3><p>${html(featured.excerpt)}</p><a class="guide-link" href="/cam-nang/${html(featured.slug)}/">Đọc bài viết ${icon('arrow')}</a></div></article>${rest.length?`<div class="home-guide-links">${rest.map(article=>`<article><h3><a href="/cam-nang/${html(article.slug)}/">${html(article.title)}</a></h3><p>${html(article.excerpt)}</p><a class="guide-link" href="/cam-nang/${html(article.slug)}/">Đọc bài viết ${icon('arrow')}</a></article>`).join('')}</div>`:''}</div></div></section>`;
}
function homeFacebookSection() {
  return `<section class="section home-facebook" data-facebook-section data-reveal hidden><div class="shell"><div class="home-section-title"><h2>Bài viết mới trên Fanpage</h2><a data-facebook-page-link target="_blank" rel="noopener">Xem Fanpage ${icon('arrow')}</a></div><div class="home-facebook-grid" data-facebook-posts></div></div></section>`;
}

function homeFaqItems() {
  return [
    ['Có cần đặt cọc không?','Sau khi xác nhận đơn, Shop sẽ gửi thông tin đặt cọc 50% giá trị đơn hàng.'],
    ['Shop giao hàng ở đâu?','Shop nhận giao hàng tại TP.HCM qua Grab, be hoặc Xanh SM. Phí giao hàng được tính theo mức phí hiển thị trên ứng dụng tại thời điểm giao.'],
    ['Nên đặt trước bao lâu?','Shop khuyến nghị đặt trước 3–5 ngày để có thời gian chuẩn bị đơn.']
  ];
}
function homeFaq() {
  const items = homeFaqItems();
  return `<section class="section home-faq" data-reveal><div class="shell faq-grid"><div class="faq-intro"><h2>Trước khi đặt</h2><p>Một vài thông tin thường được hỏi trước khi gửi yêu cầu.</p></div><div class="faq-list">${items.map(([q,a])=>`<details><summary><span>${html(q)}</span><b aria-hidden="true">+</b></summary><p>${html(a)}</p></details>`).join('')}</div></div></section>`;
}
function homeQuickModal() {
  return `<div class="quick-modal" data-quick-modal hidden><div class="quick-modal-backdrop" data-quick-close></div><section class="quick-modal-card" role="dialog" aria-modal="true" aria-labelledby="quick-modal-title"><button class="quick-modal-close" type="button" data-quick-close aria-label="Đóng">${icon('close')}</button><span class="eyebrow">Tùy chọn đặt hàng</span><h2 id="quick-modal-title" data-quick-title>Sản phẩm</h2><p class="quick-modal-desc" data-quick-desc></p><p class="quick-modal-price">Giá: <strong data-quick-price>Giá liên hệ</strong></p><form data-quick-form><div data-quick-options></div><div class="field-row quantity-field" data-quick-quantity-field><label for="quick-quantity">Số lượng</label><div class="quantity-input"><button type="button" data-quick-qty="-1" aria-label="Giảm số lượng">−</button><input id="quick-quantity" type="number" min="1" step="1" value="1" inputmode="numeric" data-quick-quantity><button type="button" data-quick-qty="1" aria-label="Tăng số lượng">+</button><span data-quick-unit>bánh</span></div></div><button class="btn btn-primary btn-block" type="submit" data-quick-submit>${icon('bag')}Thêm vào giỏ hàng</button><a class="quick-detail-link" href="/banh-phu-the/" data-quick-detail>Xem trang chi tiết ${icon('arrow')}</a><div class="cart-action-note" data-quick-note role="status" aria-live="polite" hidden><span data-quick-note-text></span><a class="cart-action-link" href="/gio-hang/">Xem giỏ hàng →</a></div></form></section></div>`;
}

function homePrice(product) {
  if (product.price?.mode === 'hybrid' && Array.isArray(product.price.rules) && product.price.rules.length) {
    const rule = [...product.price.rules].sort((a,b)=>Number(a.amount)-Number(b.amount))[0];
    const unit = product.quantity?.unit || 'sản phẩm';
    return `Từ ${money(rule.amount)} / ${rule.quantity} ${unit}`;
  }
  return product.price?.display_text || 'Giá liên hệ';
}
function homeProductCard(product, { primary = false } = {}) {
  if (!product) return '';
  const note = product.id === 'banh-phu-the' ? '<p class="home-product-note">Nhận từ 20 bánh · Hộp giấy hoặc lá dừa</p>' : '';
  return `<article class="home-product-card${primary?' home-product-card-primary':''}"><a class="home-product-card-image" href="/${html(product.slug)}/"><img src="${html(product.main_image)}" alt="${html(product.name)}"${imageSizeAttrs(product.main_image)} loading="lazy" decoding="async"></a><div class="home-product-card-copy"><div class="home-product-title"><h3>${html(product.name)}</h3><span>${html(homePrice(product))}</span></div><p>${html(product.short_description)}</p>${note}<div class="home-product-actions"><a class="btn btn-outline" href="/${html(product.slug)}/">Xem sản phẩm</a><button class="btn btn-primary" type="button" data-home-quick-add="${html(product.id)}">Chọn để đặt</button></div></div></article>`;
}
export function renderHome(site, products, articles = []) {
  const byId = new Map(products.filter(p=>p.status==='published').map(p=>[p.id,p]));
  const phuThe = byId.get('banh-phu-the');
  const mamQua = byId.get('mam-qua-cuoi');
  const phucLinh = byId.get('banh-phuc-linh');
  const heroImage = mamQua?.main_image || '/assets/images/products/mam-qua-cuoi.jpg';
  const body = `<section class="home-hero"><div class="shell home-hero-grid"><div class="home-hero-copy"><h1>Bánh phu thê &amp; mâm quả cưới tại TP.HCM</h1><p>Chọn bánh hoặc mâm quả theo nhu cầu. Shop sẽ liên hệ xác nhận chi tiết trước khi chuẩn bị.</p><div class="home-hero-actions"><a class="home-zalo-link" href="${html(site.zalo)}" target="_blank" rel="noopener">${icon('chat')}Nhắn Zalo</a></div><div class="home-hero-trust" aria-label="Thông tin đặt hàng"><span>${icon('pin')}Phục vụ tại TP.HCM</span><span>${icon('check')}Shop xác nhận đơn trước khi chuẩn bị</span></div></div><figure class="home-hero-media"><img src="${html(heroImage)}" alt="Mâm quả cưới tại Shop Uyên Ương"${imageSizeAttrs(heroImage)} fetchpriority="high" decoding="async"></figure></div></section><section class="section home-product-section" id="san-pham" data-reveal><div class="shell"><div class="home-shop-intro"><h2>Shop đang nhận đặt</h2><p>Chọn sản phẩm phù hợp rồi gửi yêu cầu. Mọi đơn đều được Shop liên hệ xác nhận trước khi chuẩn bị.</p></div><div class="home-catalog">${homeProductCard(phuThe,{primary:true})}${homeProductCard(mamQua)}${homeProductCard(phucLinh)}</div></div></section>${homeFacebookSection()}${homeGuideSection(articles)}${homeFaq()}${homeQuickModal()}`;
  return renderShell({site,title:site.seo.title,description:site.seo.description,canonicalPath:'/',active:'home',body,bodyClass:'home-page',ogImage:heroImage,extraSchemas:[faqSchema(homeFaqItems())]});
}

export function renderGuideHub(site, articles = []) {
  const list = publishedArticles(articles); const [featured,...rest] = list;
  const body = `<div class="shell breadcrumb"><a href="/">${icon('home')}<span>Trang chủ</span></a><span>/</span><span>Cẩm nang</span></div><section class="section guide-hub"><div class="shell"><div class="page-intro guide-hub-intro"><h1>Cẩm nang cưới hỏi</h1><p>Các bài hướng dẫn chuẩn bị bánh, mâm quả và những việc cần lưu ý khi đặt hàng.</p></div>${featured?`<div class="guide-hub-layout">${articleCard(featured,'featured')}${rest.length?`<div class="guide-hub-side">${rest.slice(0,2).map(article=>articleCard(article,'side')).join('')}</div>`:''}</div>${rest.length>2?`<div class="guide-list-more">${rest.slice(2).map(article=>articleCard(article,'compact')).join('')}</div>`:''}`:`<div class="empty-content"><h2>Nội dung đang được chuẩn bị</h2><p>Khi bài viết được xuất bản từ Admin, trang này sẽ hiển thị tự động.</p></div>`}</div></section>`;
  return renderShell({site,title:`Cẩm nang cưới hỏi | ${site.name} TP.HCM`,description:'Cẩm nang cưới hỏi của Shop Uyên Ương tại TP.HCM: chuẩn bị bánh phu thê, mâm quả cưới và các lưu ý khi đặt hàng.',canonicalPath:'/cam-nang/',active:'cam-nang',body,bodyClass:'guide-hub-page'});
}
export function renderCategoryHub(site, category, articles = []) {
  const list = publishedArticles(articles).filter(article => article.category === category.id);
  const body = `<div class="shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><a href="/cam-nang/">Cẩm nang</a><span>/</span><span>${html(category.name)}</span></div><section class="section guide-hub category-hub"><div class="shell"><div class="page-intro"><span class="eyebrow">Chuyên mục</span><h1>${html(category.name)}</h1>${category.description?`<p>${html(category.description)}</p>`:''}</div>${list.length?`<div class="guide-list-more category-list">${list.map(article=>articleCard(article,'compact')).join('')}</div>`:`<div class="empty-content"><h2>Chưa có bài viết</h2><p>Các bài thuộc chuyên mục này sẽ hiển thị khi được xuất bản.</p></div>`}</div></section>`;
  return renderShell({site,title:`${category.name} | ${site.name}`,description:category.description||`Bài viết ${category.name} tại ${site.name}.`,canonicalPath:`/cam-nang/${category.slug}/`,active:'cam-nang',body,bodyClass:'guide-hub-page category-hub-page'});
}
export function renderArticlePage(site, article, articles = [], products = []) {
  const body = `<div class="shell article-shell breadcrumb"><a href="/">Trang chủ</a><span>/</span><a href="/cam-nang/">Cẩm nang</a><span>/</span><span>${html(article.title)}</span></div><article class="article-page"><header class="shell article-shell article-header"><div class="article-heading"><h1>${html(article.title)}</h1><p>${html(article.excerpt)}</p></div><figure class="article-cover"><img src="${html(article.cover.src)}" alt="${html(article.cover.alt)}"${imageSizeAttrs(article.cover.src)} fetchpriority="high" decoding="async"></figure></header><div class="shell article-shell article-layout"><div class="article-content">${article.blocks.map(renderArticleBlock).join('')}${articleRelatedProducts(article,products)}</div></div><div class="shell article-shell article-footer-related">${articleRelatedArticles(article,articles)}</div></article>`;
  return renderShell({site,title:article.seo.title,description:article.seo.description,canonicalPath:`/cam-nang/${article.slug}/`,active:'cam-nang',body,bodyClass:'article-detail-page',ogImage:article.cover.src,ogType:'article'});
}
export function renderContact(site) {
  const fanpages = site.fanpages.map(page=>`<li><a href="${html(page.url)}" target="_blank" rel="noopener">${html(page.label)} ${icon('arrow')}</a></li>`).join('');
  const mapEmbed = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.9862008824894!2d106.67206557573559!3d10.735546659944958!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31752f1036a01371%3A0x53224f1d2d1ad63e!2zU2hvcCBVecOqbiDGr8ahbmcgLSBCw6FuaCBwaHUgdGjDqiAtIELDoW5oIHh1IHjDqiAtIELDoW5oIHN1IHPDqiAtIEThu4tjaCB24bulIE3Dom0gcXXhuqMgY8aw4bubaSBo4buPaSBnacOhIHLhursgVFBIQ00!5e0!3m2!1svi!2s!4v1790837962407!5m2!1svi!2s';
  const mapLink = 'https://maps.app.goo.gl/gTCeVF4iQeLyUUMr8';
  const body = `<div class="shell breadcrumb"><a href="/">${icon('home')}<span>Trang chủ</span></a><span>/</span><span>Liên hệ</span></div><section class="section contact-page-section"><div class="shell"><div class="page-intro contact-page-intro"><h1>Liên hệ Shop Uyên Ương</h1><p>Liên hệ Shop để được hỗ trợ về bánh phu thê, mâm quả cưới và bánh phục linh.</p></div><div class="contact-grid"><div class="contact-info"><h2>Shop Uyên Ương</h2><dl class="contact-list"><div><dt>Địa chỉ</dt><dd>${html(site.address)}</dd></div><div><dt>Hotline / Zalo</dt><dd><a href="tel:${html(site.hotline)}">${html(site.hotline_display)}</a></dd></div></dl><div class="official-channels"><h2>Kênh chính thức</h2><ul>${fanpages}<li><a href="${html(site.zalo)}" target="_blank" rel="noopener">Zalo tư vấn trực tiếp ${icon('arrow')}</a></li></ul></div></div><aside class="contact-help-card" aria-label="Cách liên hệ nhanh"><span class="eyebrow">Liên hệ nhanh</span><h2>Trao đổi trực tiếp với Shop</h2><p>Để được tư vấn đúng sản phẩm, số lượng và ngày nhận, vui lòng nhắn Zalo hoặc gọi trực tiếp cho Shop.</p><div class="contact-help-actions"><a class="btn btn-primary btn-block" href="${html(site.zalo)}" target="_blank" rel="noopener">${icon('chat')}Nhắn Zalo cho Shop</a><a class="btn btn-outline btn-block" href="tel:${html(site.hotline)}">${icon('phone')}Gọi ${html(site.hotline_display)}</a></div><p class="contact-help-note">Có thể gửi hình mẫu hoặc ghi yêu cầu chi tiết qua Zalo để Shop kiểm tra và phản hồi.</p></aside></div><div class="contact-map-section"><div class="contact-map-head"><div><span class="eyebrow">Địa điểm</span><h2>Đường đến Shop Uyên Ương</h2><p>${html(site.address)}</p></div><a class="btn btn-outline" href="${html(mapLink)}" target="_blank" rel="noopener">Mở trên Google Maps ${icon('arrow')}</a></div><div class="contact-map-frame"><iframe title="Bản đồ đến Shop Uyên Ương" src="${html(mapEmbed)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div></div></div></section>`;
  return renderShell({site,title:`Liên hệ ${site.name} | TP.HCM`,description:`Liên hệ ${site.name} tại TP.HCM để được tư vấn bánh phu thê, mâm quả cưới và bánh phục linh.`,canonicalPath:'/lien-he/',active:'lien-he',body,bodyClass:'contact-page'});
}
export function renderCart(site) {
  const body = `<div class="shell breadcrumb"><a href="/">${icon('home')}<span>Trang chủ</span></a><span>/</span><span>Giỏ hàng</span></div><section class="section commerce-page"><div class="shell"><div class="page-intro commerce-page-intro"><h1>Giỏ hàng</h1><p>Kiểm tra sản phẩm và lựa chọn trước khi gửi yêu cầu đặt hàng.</p></div><div class="commerce-status" data-cart-status role="status" aria-live="polite" hidden></div><div class="cart-layout" data-cart-page><div class="cart-main"><div class="cart-items" data-cart-list aria-live="polite"></div><div class="empty-content cart-empty" data-cart-empty hidden><span class="empty-icon">${icon('bag')}</span><h2>Giỏ hàng đang trống</h2><p>Chọn bánh hoặc mâm quả để bắt đầu đặt hàng.</p><a class="btn btn-primary" href="/#san-pham">Xem sản phẩm ${icon('arrow')}</a></div></div><aside class="commerce-summary cart-summary" data-cart-summary hidden><div class="summary-title-row"><h2>Tóm tắt</h2><small><span data-cart-summary-count>0</span> hạng mục</small></div><dl><div><dt>Số sản phẩm</dt><dd><span data-cart-line-count>0</span></dd></div><div><dt>Giá</dt><dd>Shop sẽ xác nhận</dd></div></dl><p>Shop sẽ liên hệ xác nhận giá và thông tin đơn hàng trước khi chuẩn bị.</p><a class="btn btn-primary btn-block" href="/dat-hang/">Tiếp tục đặt hàng ${icon('arrow')}</a><a class="btn btn-outline btn-block" href="/#san-pham">Chọn thêm sản phẩm</a></aside></div></div></section>`;
  return renderShell({site,title:`Giỏ hàng | ${site.name}`,description:'Giỏ hàng Shop Uyên Ương.',canonicalPath:'/gio-hang/',robots:'noindex,follow',body,bodyClass:'cart-page'});
}
export function renderCheckout(site) {
  const body = `<div class="shell breadcrumb"><a href="/">${icon('home')}<span>Trang chủ</span></a><span>/</span><span>Đặt hàng</span></div><section class="section commerce-page checkout-page"><div class="shell"><div data-checkout-default><div class="page-intro commerce-page-intro"><h1>Đặt hàng</h1><p>Điền thông tin nhận hàng. Shop sẽ liên hệ xác nhận trước khi chuẩn bị.</p></div><div class="commerce-status" data-checkout-status role="status" aria-live="polite" hidden></div><div class="order-grid"><div><section class="order-section"><div class="section-title-row"><h2>Sản phẩm đã chọn</h2><a href="/gio-hang/">Sửa trong giỏ hàng</a></div><div class="checkout-items" data-checkout-items></div><div class="empty-inline" data-checkout-empty hidden>Giỏ hàng đang trống. <a href="/#san-pham">Chọn sản phẩm</a> để tiếp tục.</div></section><form class="order-section form-grid" data-order-form novalidate><h2 class="full">Thông tin nhận hàng</h2><p class="form-intro full">Vui lòng cung cấp thông tin để Shop liên hệ xác nhận đơn.</p><label><span>Họ và tên</span><input name="customer_name" autocomplete="name" required maxlength="150" aria-describedby="order-name-error"><small class="field-error" id="order-name-error" data-field-error="customer_name" hidden></small></label><label><span>Số điện thoại</span><input name="phone" inputmode="tel" autocomplete="tel" required maxlength="20" data-order-phone aria-describedby="order-phone-hint order-phone-error"><small class="field-hint" id="order-phone-hint">Ví dụ: 0901234567.</small><small class="field-error" id="order-phone-error" data-field-error="phone" hidden></small></label><label class="full"><span>Địa chỉ nhận hàng</span><input name="address" autocomplete="street-address" required maxlength="600" aria-describedby="order-address-error"><small class="field-error" id="order-address-error" data-field-error="address" hidden></small></label><label><span>Ngày nhận</span><input name="receive_date" type="date" required data-order-date aria-describedby="order-date-hint order-date-error"><small class="field-hint" id="order-date-hint" data-order-date-hint>Shop khuyến nghị đặt trước 3–5 ngày.</small><small class="field-error" id="order-date-error" data-field-error="receive_date" hidden></small></label><label class="full"><span>Ghi chú</span><textarea name="note" maxlength="1000" placeholder="Yêu cầu thêm cho Shop…"></textarea></label><div class="form-error full" data-order-error role="alert" aria-live="assertive" hidden></div><p class="form-assurance full">Chưa thanh toán ở bước này. Shop sẽ liên hệ xác nhận trước khi chuẩn bị đơn.</p><button class="btn btn-primary" type="submit" data-order-submit>Gửi yêu cầu đặt hàng ${icon('arrow')}</button><a class="btn btn-outline" href="/gio-hang/">Quay lại giỏ hàng</a></form><details class="order-section add-more"><summary>Muốn chọn thêm sản phẩm?</summary><div class="add-more-list"><a href="/banh-phu-the/"><span><strong>Bánh phu thê</strong><small>Có hộp giấy và lá dừa.</small></span><b>Chọn →</b></a><a href="/mam-qua-cuoi/"><span><strong>Mâm quả cưới</strong><small>Chọn các lễ vật gia đình cần.</small></span><b>Chọn →</b></a><a href="/banh-phuc-linh/"><span><strong>Bánh phục linh</strong><small>Chọn 2 vị hoặc 5 vị và số lượng khi đặt.</small></span><b>Chọn →</b></a></div></details></div><aside class="commerce-summary order-summary"><h2>Tóm tắt đơn hàng</h2><div class="order-summary-items" data-order-summary-items></div><dl><div><dt>Số sản phẩm</dt><dd><span data-order-line-count>0</span></dd></div><div><dt>Giá đơn hàng</dt><dd class="order-price-status">Shop sẽ xác nhận</dd></div></dl><p>Shop sẽ liên hệ xác nhận giá và thông tin đơn hàng trước khi chuẩn bị.</p></aside></div></div><div class="checkout-state success-state" data-order-success hidden><div class="state-icon" aria-hidden="true">✓</div><span class="eyebrow">Đã gửi thành công</span><h1>Yêu cầu đã ghi nhận</h1><p>Shop sẽ liên hệ lại để xác nhận thông tin đơn hàng.</p><div class="cta-row"><a class="btn btn-primary" href="${html(site.zalo)}" target="_blank" rel="noopener">${icon('chat')}Nhắn Zalo với Shop</a><a class="btn btn-outline" href="/">Về trang chủ</a></div></div><div class="checkout-state rate-limit-state" data-order-rate-limit hidden><div class="state-icon warning" aria-hidden="true">!</div><span class="eyebrow">Tạm thời chưa gửi được</span><h1>Chưa thể gửi yêu cầu</h1><p>Đã nhận quá nhiều đơn hàng. Vui lòng thử lại sau.</p><div class="cta-row"><button class="btn btn-primary" type="button" data-return-order>Quay lại đặt hàng</button><a class="btn btn-outline" href="${html(site.zalo)}" target="_blank" rel="noopener">Nhắn Zalo với Shop</a></div></div></div></section>`;
  return renderShell({site,title:`Đặt hàng | ${site.name}`,description:'Gửi yêu cầu đặt hàng tại Shop Uyên Ương.',canonicalPath:'/dat-hang/',robots:'noindex,follow',body,bodyClass:'checkout-page'});
}
