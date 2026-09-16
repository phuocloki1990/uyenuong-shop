import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Run from the repository root: node scripts/build.mjs [--check].
// No dependencies. Source content is never modified.
const OWNER = '<!-- UYENUONG_CMS_GENERATED_V1 -->';
const MANIFEST = '.cms-build-manifest.json';
const START = '# BEGIN UYENUONG CMS REDIRECTS';
const END = '# END UYENUONG CMS REDIRECTS';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const money = value => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
const route = (kind, slug) => `/${{ products: 'san-pham', articles: 'cam-nang', categories: 'chuyen-muc' }[kind]}/${slug}.html`;

export function quoteProduct(product, choices, quantity) {
  const q = product.quantity;
  if (!Number.isInteger(quantity) || quantity < q.min || (quantity - q.min) % q.step !== 0) return null;
  if (!product.option_groups.every(g => g.values.includes(choices[g.key]))) return null;
  if (product.price_mode === 'contact') return null;
  if (product.price_mode === 'fixed') return product.base_price * quantity;
  const matches = product.price_rules.filter(rule => Object.entries(rule.when).every(([key, value]) => key === 'qty' ? quantity === value : choices[key] === value));
  if (matches.length !== 1) return null;
  return matches[0].price; // Total for this exact configuration, never a per-piece price.
}

export function build(root = process.cwd(), { check = false } = {}) {
  root = path.resolve(root);
  const warnings = new Set();
  const warn = message => warnings.add(message);
  const disk = relative => {
    const resolved = path.resolve(root, relative);
    if (resolved === root || !resolved.startsWith(root + path.sep)) fail(`Đường dẫn ngoài repo: ${relative}`);
    // Refuse symlinks/junctions in any output/input path.
    let current = root;
    for (const part of path.relative(root, resolved).split(path.sep)) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail(`Không hỗ trợ symlink: ${relative}`);
    }
    return resolved;
  };
  const read = relative => {
    try { return JSON.parse(fs.readFileSync(disk(relative), 'utf8').replace(/^\uFEFF/, '')); }
    catch (e) { fail(`${relative}: ${e.message}`); }
  };
  function textField(x, key, label, required = true) {
    if (x[key] === undefined && !required) return;
    if (typeof x[key] !== 'string' || (required && !x[key].trim())) fail(`${label}: ${key} phải là chuỗi${required ? ' không rỗng' : ''}`);
  }
  function strings(x, key, label) {
    if (x[key] === undefined) x[key] = [];
    if (!Array.isArray(x[key]) || x[key].some(v => !nonempty(v))) fail(`${label}: ${key} phải là danh sách chuỗi không rỗng`);
    if (new Set(x[key]).size !== x[key].length) fail(`${label}: ${key} có giá trị trùng`);
  }
  function list(x, key, label) {
    if (x[key] === undefined) x[key] = [];
    if (!Array.isArray(x[key]) || x[key].some(v => !object(v))) fail(`${label}: ${key} phải là danh sách object`);
  }
  function url(value, label, local = false) {
    if (local && /^\/assets\/[A-Za-z0-9_./-]+$/.test(value) && !value.split('/').includes('..')) {
      if (!fs.existsSync(disk(value.slice(1)))) warn(`${label}: chưa tìm thấy ảnh ${value}`);
      return;
    }
    try { const u = new URL(value); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw 0; }
    catch { fail(`${label}: URL không hợp lệ`); }
  }
  function rich(value, label) {
    if (typeof value !== 'string') fail(`${label}: phải là HTML dạng chuỗi`);
    // CMS supports text-only rich content. Reject unsupported HTML instead of pretending to sanitize it.
    const tags = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ul', 'ol', 'li', 'blockquote', 'a', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div']);
    const tokens = value.match(/<[^>]*>/g) || [];
    for (const token of tokens) {
      const match = token.match(/^<\/?([a-z][a-z0-9]*)([\s\S]*?)\/?>$/i);
      if (!match || !tags.has(match[1].toLowerCase())) fail(`${label}: HTML không hỗ trợ: ${token}`);
      let attrs = match[2].trim();
      while (attrs) {
        const attr = attrs.match(/^([a-z][a-z0-9-]*)\s*=\s*("[^"]*"|'[^']*')\s*/i);
        if (!attr) fail(`${label}: thuộc tính HTML phải có dấu nháy`);
        const key = attr[1].toLowerCase(), val = attr[2].slice(1, -1);
        if (!['href', 'title', 'colspan', 'rowspan'].includes(key) || (key === 'href' && match[1].toLowerCase() !== 'a')) fail(`${label}: thuộc tính HTML không hỗ trợ: ${key}`);
        if (key === 'href' && !/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(val)) fail(`${label}: liên kết HTML không an toàn`);
        if (key === 'href' && /[\u0000-\u0020\\&]/.test(val)) fail(`${label}: hãy dùng URL không mã hóa entity/ký tự điều khiển`);
        attrs = attrs.slice(attr[0].length);
      }
    }
    if (value.replace(/<[^>]*>/g, '').includes('<')) fail(`${label}: HTML chưa đóng thẻ`);
    return value;
  }
  const site = read('content/settings/site.json');
  if (!object(site)) fail('site.json phải là object');
  for (const key of ['site_name', 'site_url', 'phone', 'phone_display', 'zalo_url', 'logo']) textField(site, key, 'site.json');
  url(site.site_url, 'site_url');
  const origin = new URL(site.site_url);
  if (origin.pathname !== '/' || origin.search || origin.hash) fail('site_url phải là origin, không có đường dẫn/query/hash');
  site.site_url = origin.origin;
  if (!/^\+?\d{8,15}$/.test(site.phone)) fail('phone phải là số điện thoại, không có dấu cách');
  if (site.phone_display.replace(/\D/g, '') !== site.phone.replace(/\D/g, '')) fail('phone_display không khớp phone');
  for (const key of ['zalo_url', 'facebook_main', 'facebook_phuclinh']) if (site[key]) url(site[key], key);
  url(site.logo, 'logo', true);
  if (!object(site.address)) fail('site.address phải là object');
  for (const [key, value] of Object.entries(site.address)) if (typeof value !== 'string') fail(`address.${key} phải là chuỗi`);
  if (site.seo === undefined) site.seo = {};
  if (!object(site.seo)) fail('site.seo phải là object');
  for (const key of ['title_suffix', 'default_description', 'default_og_image']) textField(site.seo, key, 'site.seo', false);
  if (site.seo.default_og_image) url(site.seo.default_og_image, 'default_og_image', true);
  const absolute = value => new URL(value, site.site_url + '/').href;
  const data = {};
  for (const kind of ['products', 'articles', 'categories']) {
    const dir = disk(`content/${kind}`);
    data[kind] = fs.readdirSync(dir).sort().filter(f => f.endsWith('.json')).map(file => {
      const label = `content/${kind}/${file}`, x = read(label);
      if (!object(x)) fail(`${label}: cần object JSON`);
      const fields = kind === 'products' ? ['id', 'name', 'slug', 'category', 'status', 'image', 'short_description', 'lead', 'price_mode', 'price_text'] : kind === 'articles' ? ['title', 'slug', 'category', 'status', 'thumbnail', 'excerpt', 'body'] : ['title', 'slug', 'status'];
      fields.forEach(key => textField(x, key, label));
      if (!slugPattern.test(x.slug)) fail(`${label}: slug không hợp lệ`);
      if (!['published', 'draft', 'hidden'].includes(x.status)) fail(`${label}: status không hợp lệ`);
      for (const key of ['image_alt', 'description', 'parent', 'intro']) textField(x, key, label, false);
      if (x.featured === undefined) x.featured = false;
      if (typeof x.featured !== 'boolean') fail(`${label}: featured phải là boolean`);
      if (x.featured_order === undefined) x.featured_order = 99;
      if (!Number.isFinite(x.featured_order)) fail(`${label}: featured_order phải là số`);
      if (x.seo === undefined) x.seo = {};
      if (!object(x.seo)) fail(`${label}: seo phải là object`);
      for (const key of ['title', 'description', 'focus_keyword']) textField(x.seo, key, label + '.seo', false);
      strings(x.seo, 'secondary_keywords', label + '.seo');
      if ((x.seo.title?.length || 0) > 70 || (x.seo.description?.length || 0) > 180) warn(`${label}: SEO dài hơn giới hạn gợi ý 70/180`);
      for (const key of ['related_products', 'related_articles', 'redirect_from']) strings(x, key, label);
      for (const key of ['related_products', 'related_articles']) if (x[key].length > 6) fail(`${label}: ${key} tối đa 6`);
      for (const key of ['image', 'thumbnail']) if (x[key]) url(x[key], label + ':' + key, true);
      if (kind === 'articles') {
        rich(x.body, label + ':body');
        for (const key of ['published_at', 'updated_at']) {
          if (x[key] === undefined || x[key] === '') continue;
          if (typeof x[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(x[key]) || !Number.isFinite(Date.parse(x[key])) || new Date(x[key].slice(0, 10)).toISOString().slice(0, 10) !== x[key].slice(0, 10)) fail(`${label}: ${key} không phải ngày ISO hợp lệ`);
        }
        if (x.updated_at && x.published_at && Date.parse(x.updated_at) < Date.parse(x.published_at)) fail(`${label}: updated_at trước published_at`);
        if (!x.published_at) warn(`${label}: chưa có ngày đăng; bỏ datePublished và không đoán ngày`);
      }
      if (kind === 'categories' && x.intro) rich(x.intro, label + ':intro');
      if (kind === 'products') {
        if (!/^[a-zA-Z0-9_-]+$/.test(x.id)) fail(`${label}: id không hợp lệ`);
        if (!['contact', 'fixed', 'hybrid'].includes(x.price_mode)) fail(`${label}: price_mode không hợp lệ`);
        if (x.base_price !== undefined && (!Number.isFinite(x.base_price) || x.base_price <= 0)) fail(`${label}: base_price phải là số dương`);
        if (x.price_mode === 'fixed' && x.base_price === undefined) fail(`${label}: fixed cần base_price (đơn giá)`);
        if (!object(x.quantity)) fail(`${label}: cần quantity, không tự đoán đơn vị hoặc số lượng`);
        const q = x.quantity;
        for (const key of ['label', 'unit']) textField(q, key, label + ':quantity');
        textField(q, 'hint', label + ':quantity', false);
        if (!['min', 'default', 'step'].every(key => Number.isSafeInteger(q[key]) && q[key] > 0) || q.default < q.min || (q.default - q.min) % q.step) fail(`${label}: quantity không hợp lệ`);
        for (const key of ['option_groups', 'price_rules', 'details', 'faq']) list(x, key, label);
        strings(x, 'features', label);
        strings(x, 'card_highlights', label);
        if (x.card_highlights.length > 2) fail(`${label}: card_highlights tối đa 2`);
        const optionKeys = new Set();
        for (const g of x.option_groups) {
          for (const key of ['key', 'label']) textField(g, key, label + ':option_groups');
          if (!/^[a-z][a-z0-9_]*$/.test(g.key) || ['qty', '__proto__', 'constructor', 'prototype'].includes(g.key) || optionKeys.has(g.key)) fail(`${label}: key lựa chọn trùng/không hợp lệ`);
          optionKeys.add(g.key); strings(g, 'values', label + ':' + g.key);
          if (!g.values.length) fail(`${label}: lựa chọn rỗng`);
        }
        for (const d of x.details) for (const key of ['label', 'value']) textField(d, key, label + ':details');
        for (const f of x.faq) for (const key of ['question', 'answer']) textField(f, key, label + ':faq');
        for (const r of x.price_rules) {
          textField(r, 'label', label + ':price_rules');
          if (!object(r.when) || !Object.keys(r.when).length || !Number.isFinite(r.price) || r.price <= 0) fail(`${label}: price rule không hợp lệ`);
          if (!Number.isSafeInteger(r.when.qty) || r.when.qty < q.min || (r.when.qty - q.min) % q.step) fail(`${label}: rule cần qty chính xác hợp lệ`);
          for (const [key, value] of Object.entries(r.when)) if (key !== 'qty' && !x.option_groups.find(g => g.key === key)?.values.includes(value)) fail(`${label}: điều kiện giá ${key} không khớp lựa chọn`);
        }
        for (let i = 0; i < x.price_rules.length; i++) for (let j = i + 1; j < x.price_rules.length; j++) {
          const a = x.price_rules[i].when, b = x.price_rules[j].when;
          if (Object.keys(a).every(k => !(k in b) || a[k] === b[k])) fail(`${label}: hai price_rules chồng điều kiện`);
        }
        if (x.price_mode !== 'hybrid' && x.price_rules.length) fail(`${label}: price_rules chỉ dùng cho hybrid`);
        if (x.price_mode === 'hybrid' && !x.price_rules.length) warn(`${label}: hybrid chưa có giá, sẽ hiển thị liên hệ`);
        if (!x.card_highlights.length) { x.card_highlights = x.details.slice(0, 2).map(d => d.value); warn(`${label}: dùng details làm card_highlights tạm thời`); }
      }
      return { ...x, _kind: kind, _file: label, _url: route(kind, x.slug) };
    });
    for (const key of kind === 'products' ? ['id', 'slug'] : ['slug']) {
      const seen = new Set();
      for (const x of data[kind]) { if (seen.has(x[key])) fail(`${kind}: trùng ${key} ${x[key]}`); seen.add(x[key]); }
    }
  }
  const maps = Object.fromEntries(Object.entries(data).map(([kind, items]) => [kind, new Map(items.map(x => [x.slug, x]))]));
  const all = Object.values(data).flat();
  const ancestors = category => {
    const result = [], seen = new Set();
    let slug = category;
    while (slug) {
      if (seen.has(slug)) fail(`Category có vòng lặp: ${slug}`);
      seen.add(slug);
      const c = maps.categories.get(slug);
      if (!c) fail(`Category không tồn tại: ${slug}`);
      result.unshift(c); slug = c.parent;
    }
    return result;
  };
  for (const x of all) {
    ancestors(x._kind === 'categories' ? x.slug : x.category);
    for (const kind of ['products', 'articles']) for (const slug of x[`related_${kind}`]) {
      if (!maps[kind].has(slug)) fail(`${x._file}: related_${kind} không tồn tại: ${slug}`);
      if (x._kind === kind && x.slug === slug) fail(`${x._file}: tự liên kết chính mình`);
    }
  }
  const live = x => x.status === 'published' && ancestors(x._kind === 'categories' ? x.slug : x.category).every(c => c.status === 'published');
  for (const x of all) if (x.status === 'published' && !live(x)) warn(`${x._file}: bị ẩn vì chuyên mục/cha không published`);
  const published = Object.fromEntries(Object.entries(data).map(([k, items]) => [k, items.filter(live)]));
  const ordered = items => [...items].sort((a, b) => a.featured_order - b.featured_order || a.slug.localeCompare(b.slug));
  const suffix = site.seo.title_suffix ?? ` | ${site.site_name}`;
  const title = x => x.seo?.title || ((x.name || x.title).endsWith(suffix) ? (x.name || x.title) : (x.name || x.title) + suffix);
  const description = x => x.seo?.description || x.short_description || x.excerpt || x.description || site.seo.default_description || '';
  const image = x => x.image || x.thumbnail || site.seo.default_og_image || site.logo;
  const org = { '@type': 'Organization', '@id': absolute('/#organization'), name: site.site_name, url: site.site_url + '/', logo: absolute(site.logo), telephone: site.phone, address: { '@type': 'PostalAddress', streetAddress: [site.address.street, site.address.ward].filter(Boolean).join(', '), addressLocality: [site.address.district, site.address.city].filter(Boolean).join(', '), addressCountry: site.address.country || 'VN' }, sameAs: [site.facebook_main, site.facebook_phuclinh].filter(Boolean) };
  const crumbs = x => [{ name: 'Trang chủ', url: '/' }, ...ancestors(x._kind === 'categories' ? x.parent : x.category).map(c => ({ name: c.title, url: c._url })), { name: x.name || x.title, url: x._url }];
  const breadcrumb = x => `<div class="breadcrumb">${crumbs(x).map((c, i, a) => i === a.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${esc(c.url)}">${esc(c.name)}</a><span>›</span>`).join('')}</div>`;
  function metadata(x) {
    const graph = [org, { '@type': 'BreadcrumbList', itemListElement: crumbs(x).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absolute(c.url) })) }];
    if (x._kind === 'products') {
      const p = { '@type': 'Product', name: x.name, description: description(x), image: absolute(image(x)), sku: x.id, url: absolute(x._url) };
      if (x.price_mode === 'fixed') p.offers = { '@type': 'Offer', price: x.base_price, priceCurrency: 'VND', url: absolute(x._url), seller: { '@id': org['@id'] } };
      // Hybrid prices are bundle totals. Do not label them as a generic unit Offer.
      graph.push(p);
    } else if (x._kind === 'articles') {
      graph.push({ '@type': 'Article', headline: x.title, description: description(x), image: absolute(image(x)), mainEntityOfPage: absolute(x._url), publisher: { '@id': org['@id'] }, ...(x.published_at ? { datePublished: x.published_at } : {}), ...(x.updated_at ? { dateModified: x.updated_at } : {}) });
    } else graph.push({ '@type': 'CollectionPage', name: x.title, url: absolute(x._url), description: description(x) });
    return `<title>${esc(title(x))}</title><meta name="description" content="${esc(description(x))}"><link rel="canonical" href="${esc(absolute(x._url))}"><meta name="robots" content="index,follow"><meta property="og:title" content="${esc(title(x))}"><meta property="og:description" content="${esc(description(x))}"><meta property="og:url" content="${esc(absolute(x._url))}"><meta property="og:image" content="${esc(absolute(image(x)))}"><meta property="og:type" content="${x._kind === 'articles' ? 'article' : 'website'}"><meta property="og:site_name" content="${esc(site.site_name)}"><meta property="og:locale" content="vi_VN"><script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
  }
  const topCats = published.categories.filter(c => !c.parent);
  function header() {
    return `<header class="site-header"><div class="container nav"><a class="brand" href="/"><img src="${esc(site.logo)}" alt="${esc(site.site_name)}"><span class="brand-name">${esc(site.brand_name || site.site_name)}</span></a><button class="menu-btn" type="button" aria-label="Mở menu" onclick="toggleMenu()">☰</button><nav class="nav-links" id="mobileMenu" aria-label="Điều hướng chính"><a href="/">Trang chủ</a>${topCats.map(c => `<a href="${c._url}">${esc(c.title)}</a>`).join('')}<a href="/index.html#lien-he">Liên hệ</a><a class="cart-link" href="/gio-hang.html">Giỏ hàng <span class="cart-badge" data-cart-count>0</span></a><a class="nav-order" href="/dat-hang.html">Đặt hàng</a></nav></div></header>`;
  }
  const contact = () => `<div class="contact-panel"><div><h2>Cần Shop tư vấn thêm?</h2><p>Liên hệ để xác nhận quy cách, số lượng và giá theo nhu cầu.</p></div><div class="contact-actions"><a class="btn btn-secondary" href="tel:${esc(site.phone)}">Gọi ${esc(site.phone_display)}</a><a class="btn btn-primary" href="${esc(site.zalo_url)}">Chat Zalo</a></div></div>`;
  function footer() {
    return `<footer class="site-footer"><div class="container"><div class="footer-grid"><div><div class="footer-brand"><img src="${esc(site.logo)}" alt="${esc(site.site_name)}"><div><div class="brand-name">${esc(site.brand_name || site.site_name)}</div><p>${esc(site.tagline || '')}</p></div></div><div class="footer-meta"><p>${esc(['street', 'ward', 'district', 'city'].map(k => site.address[k]).filter(Boolean).join(', '))}</p><p>Điện thoại/Zalo: ${esc(site.phone_display)}</p>${['facebook_main', 'facebook_phuclinh'].filter(k => site[k]).map(k => `<p><a href="${esc(site[k])}" target="_blank" rel="noopener">${k === 'facebook_main' ? 'Facebook Shop Uyên Ương' : 'Facebook Bánh phục linh'}</a></p>`).join('')}</div></div><div><div class="footer-title">Chuyên mục</div><div class="footer-links">${topCats.map(c => `<a href="${c._url}">${esc(c.title)}</a>`).join('')}</div></div><div><div class="footer-title">Hỗ trợ</div><div class="footer-links"><a href="/dat-hang.html">Đặt hàng</a><a href="/gio-hang.html">Giỏ hàng</a></div></div></div><div class="footer-bottom">© ${esc(site.site_name)}</div></div></footer><div class="mobile-actions"><a href="tel:${esc(site.phone)}">Gọi</a><a class="primary" href="${esc(site.zalo_url)}">Zalo</a><a href="/dat-hang.html">Đặt hàng</a></div><script src="/assets/js/cms-catalog.js"></script><script src="/assets/js/app.js"></script>`;
  }
  function productCard(p) {
    return `<article class="product-card"><a href="${p._url}"><img src="${esc(p.image)}" alt="${esc(p.image_alt || p.name)}" loading="lazy" decoding="async"></a><div class="product-body"><h3>${esc(p.name)}</h3><div class="spec">${esc(p.card_highlights.join(' • '))}</div><div class="meta-line">${esc(p.price_text)}${p.quantity.min > 1 ? ` • Nhận từ ${p.quantity.min} ${esc(p.quantity.unit)}` : ''}</div><div class="product-actions"><a class="btn btn-primary btn-block" href="${p._url}">Xem chi tiết</a></div></div></article>`;
  }
  const articleCard = a => `<article class="article-card"><img src="${esc(a.thumbnail)}" alt="${esc(a.image_alt || a.title)}" loading="lazy" decoding="async"><div><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><a href="${a._url}">Xem bài viết →</a></div></article>`;
  const categoryToProduct = { 'banh-cuoi-bai-viet': 'banh-cuoi-hoi', 'mam-qua-cuoi-bai-viet': 'mam-qua-cuoi' };
  function related(x) {
    const sections = [];
    for (const kind of ['products', 'articles']) {
      let items;
      if (x[`related_${kind}`].length) items = x[`related_${kind}`].map(s => maps[kind].get(s)).filter(live);
      else {
        let categories = [x.category];
        if (kind === 'products' && x._kind === 'articles') categories = [categoryToProduct[x.category]].filter(Boolean);
        if (kind === 'articles' && x._kind === 'products') categories = Object.keys(categoryToProduct).filter(k => categoryToProduct[k] === x.category);
        items = ordered(published[kind].filter(y => categories.includes(y.category) && y._url !== x._url));
      }
      if (items.length) sections.push(`<section class="section-sm"><h2>${kind === 'products' ? 'Sản phẩm liên quan' : 'Bài viết liên quan'}</h2><div class="${kind === 'products' ? 'featured-grid' : 'guides-grid'}">${items.slice(0, 6).map(kind === 'products' ? productCard : articleCard).join('')}</div></section>`);
    }
    return sections.join('');
  }
  function page(x, body) {
    return `<!doctype html>\n${OWNER}\n<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata(x)}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Be+Vietnam+Pro:wght@400;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/style.css"></head><body>${header()}<main><div class="container">${breadcrumb(x)}${body}</div></main>${footer()}</body></html>\n`;
  }
  function productPage(p) {
    const q = p.quantity;
    const payload = Object.fromEntries(Object.entries(p).filter(([key]) => !key.startsWith('_')));
    const options = p.option_groups.map(g => `<div class="field"><label for="${esc(g.key)}">${esc(g.label)}</label><select required id="${esc(g.key)}" name="${esc(g.key)}"><option value="">-- Chọn --</option>${g.values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>`).join('');
    return page(p, `<section class="product-detail"><div class="product-gallery"><div class="product-main-image"><img id="mainProductImage" src="${esc(p.image)}" alt="${esc(p.image_alt || p.name)}" decoding="async" fetchpriority="high"></div></div><div class="product-info-panel"><div class="eyebrow">${esc(site.site_name)}</div><h1>${esc(p.name)}</h1><p class="lead">${esc(p.lead)}</p><div class="detail-price">${esc(p.price_text)}</div>${p.details.length ? `<dl class="detail-list">${p.details.map(d => `<div><dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd></div>`).join('')}</dl>` : ''}<form class="purchase-box" id="product-purchase" data-product="${esc(p.id)}" onsubmit="return false"><h2>Chọn sản phẩm để gửi yêu cầu</h2>${options}<div class="field"><label for="product-qty">${esc(q.label)}</label><div class="qty-wrap"><button type="button" data-qty-minus>−</button><input required id="product-qty" name="qty" type="number" min="${q.min}" step="${q.step}" value="${q.default}"><button type="button" data-qty-plus>+</button></div>${q.hint ? `<small>${esc(q.hint)}</small>` : ''}</div>${p.price_mode === 'hybrid' ? '<div id="product-price-hint" class="notice"></div>' : ''}<div class="purchase-actions"><button type="button" class="btn btn-secondary" data-add-cart>Thêm vào giỏ</button><button type="button" class="btn btn-primary" data-buy-now>Đặt ngay</button></div><p class="purchase-hint">Khách gửi yêu cầu trước, Shop liên hệ xác nhận thông tin và giá.</p></form><script type="application/json" id="product-data">${json(payload)}</script></div></section>${p.price_rules.length ? `<section class="content-section"><div class="content-card"><h2>Giá theo quy cách</h2><ul>${p.price_rules.map(r => `<li>${esc(r.label)}: ${money(r.price)} / quy cách</li>`).join('')}</ul><p>Quy cách khác: liên hệ Shop. Giá trên là tổng giá cho quy cách ghi rõ.</p></div></section>` : ''}${p.features.length ? `<section class="content-section"><div class="content-card"><h2>Điểm cần biết trước khi đặt</h2><ul class="feature-list">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></section>` : ''}${p.faq.length ? `<section class="content-section"><div class="content-card"><h2>Thông tin thường được khách hỏi</h2><div class="faq-list">${p.faq.map(f => `<div class="faq-item"><h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p></div>`).join('')}</div></div></section>` : ''}${related(p)}${contact()}`);
  }
  function articlePage(a) {
    return page(a, `<div class="article-layout"><div class="article-hero"><img src="${esc(a.thumbnail)}" alt="${esc(a.image_alt || a.title)}" decoding="async" fetchpriority="high"></div><article class="article-content"><div class="eyebrow">${esc(maps.categories.get(a.category).title)}</div><h1>${esc(a.title)}</h1>${a.published_at ? `<p>Ngày đăng: <time datetime="${esc(a.published_at)}">${esc(a.published_at.slice(0, 10))}</time></p>` : ''}<p>${esc(a.excerpt)}</p>${a.body}</article></div>${related(a)}${contact()}`);
  }
  function categoryPage(c) {
    const belongs = x => ancestors(x.category).some(a => a.slug === c.slug);
    const children = published.categories.filter(x => x.parent === c.slug);
    const products = ordered(published.products.filter(belongs)), articles = ordered(published.articles.filter(belongs));
    return page(c, `<section class="content-section"><h1>${esc(c.title)}</h1>${c.description ? `<p class="lead">${esc(c.description)}</p>` : ''}${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.image_alt || c.title)}" decoding="async">` : ''}${c.intro || ''}${children.length ? `<ul>${children.map(x => `<li><a href="${x._url}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}</section>${products.length ? `<section class="section-sm"><h2>Sản phẩm</h2><div class="featured-grid">${products.map(productCard).join('')}</div></section>` : ''}${articles.length ? `<section class="section-sm"><h2>Bài viết</h2><div class="guides-grid">${articles.map(articleCard).join('')}</div></section>` : ''}${!products.length && !articles.length && !children.length ? '<p>Nội dung đang được cập nhật.</p>' : ''}${contact()}`);
  }

  // Prepare everything before touching output. Validation failures leave existing files intact.
  const outputs = new Map();
  for (const [kind, render] of [['products', productPage], ['articles', articlePage], ['categories', categoryPage]]) for (const x of published[kind]) outputs.set(x._url.slice(1), render(x));
  const catalog = Object.fromEntries(published.products.map(p => [p.id, Object.fromEntries(Object.entries(p).filter(([key]) => !key.startsWith('_')))]));
  outputs.set('assets/js/cms-catalog.js', `// ${OWNER}\nwindow.UUCMS = { products: ${json(catalog)}, quote: ${quoteProduct.toString()} };\n`);
  const indexFile = disk('index.html');
  if (!fs.existsSync(indexFile)) fail('Thiếu index.html gốc có CMS_PRODUCTS/CMS_ARTICLES markers');
  function between(input, start, end, body) {
    if (input.split(start).length !== 2 || input.split(end).length !== 2 || input.indexOf(end) < input.indexOf(start)) fail(`Marker thiếu, trùng hoặc sai thứ tự: ${start}`);
    return input.slice(0, input.indexOf(start) + start.length) + '\n' + body + '\n' + input.slice(input.indexOf(end));
  }
  let home = fs.readFileSync(indexFile, 'utf8');
  home = between(home, '<!-- CMS_PRODUCTS_START -->', '<!-- CMS_PRODUCTS_END -->', `<div class="featured-grid" id="banh-cuoi-hoi">${ordered(published.products.filter(p => p.featured)).slice(0, 8).map(productCard).join('')}</div>`);
  home = between(home, '<!-- CMS_ARTICLES_START -->', '<!-- CMS_ARTICLES_END -->', `<div class="guides-grid">${ordered(published.articles.filter(a => a.featured)).slice(0, 6).map(articleCard).join('')}</div>`);
  const homeMetaStart = '<!-- CMS_HOME_SEO_START -->', homeMetaEnd = '<!-- CMS_HOME_SEO_END -->';
  if (home.includes(homeMetaStart)) {
    home = between(home, homeMetaStart, homeMetaEnd, metadata({ _kind: 'home', _url: '/', title: site.site_name, seo: { title: site.site_name, description: site.seo.default_description } }));
  } else warn('index.html: chưa có CMS_HOME_SEO markers; giữ nguyên SEO và phần nội dung thủ công của trang chủ');
  for (const [name, render] of [['HEADER', header], ['FOOTER', footer], ['NEEDS', () => topCats.filter(c => c.slug !== 'cam-nang-cuoi').map(c => `<a class="need-card" href="${c._url}">${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.image_alt || c.title)}" loading="lazy">` : ''}<div><h3>${esc(c.title)}</h3><p>${esc(c.description || '')}</p><span class="need-link">Xem thêm →</span></div></a>`).join('')], ['CONTACT', () => `<section class="section-sm" id="lien-he"><div class="container">${contact()}</div></section>`]]) {
    if (home.includes(`<!-- CMS_${name}_START -->`)) home = between(home, `<!-- CMS_${name}_START -->`, `<!-- CMS_${name}_END -->`, render());
  }
  home = home.replace(/data-cms-zalo href="[^"]*"/g, `data-cms-zalo href="${esc(site.zalo_url)}"`);
  home = home.replace(/<a data-cms-category="([a-z0-9-]+)"[^>]*>[\s\S]*?<\/a>/g, (_, slug) => {
    const c = maps.categories.get(slug);
    return `<a data-cms-category="${slug}" class="head-link" href="${c && live(c) ? c._url : '/index.html#lien-he'}">${c && live(c) ? 'Xem chuyên mục →' : 'Liên hệ Shop →'}</a>`;
  });

  const currentPaths = new Set([...outputs.keys(), 'index.html']);
  const aliases = new Map();
  const reserved = /^\/(?:admin(?:\/|$)|api(?:\/|$)|assets(?:\/|$)|css(?:\/|$)|content(?:\/|$)|scripts(?:\/|$)|(?:index|dat-hang|gio-hang)\.html$|(?:sitemap\.xml|robots\.txt|_redirects|_headers)$)/i;
  for (const x of all) {
    if (!live(x) && x.redirect_from.length) { warn(`${x._file}: không tạo redirect tới nội dung ẩn`); continue; }
    for (const from of x.redirect_from) {
      if (!/^\/[a-z0-9/-]+\.html$/.test(from) || from.includes('//') || from.split('/').includes('..') || reserved.test(from)) fail(`${x._file}: redirect_from phải là đường dẫn .html nội bộ, không thuộc trang hệ thống: ${from}`);
      if (currentPaths.has(from.slice(1))) fail(`Redirect đè trang đang hoạt động: ${from}`);
      if (aliases.has(from)) fail(`Redirect trùng nguồn: ${from}`);
      aliases.set(from, x._url);
    }
  }
  const redirectFile = disk('_redirects');
  const oldRedirects = fs.existsSync(redirectFile) ? fs.readFileSync(redirectFile, 'utf8') : '';
  let unmanaged = oldRedirects;
  if (oldRedirects.includes(START) || oldRedirects.includes(END)) unmanaged = between(oldRedirects, START, END, '').replace(START + '\n\n' + END, '');
  for (const line of unmanaged.split(/\r?\n/)) {
    const trimmed = line.trim(); if (!trimmed || trimmed.startsWith('#')) continue;
    const from = trimmed.split(/\s+/)[0];
    const pattern = new RegExp('^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:[A-Za-z][A-Za-z0-9_]*/g, '[^/]+') + '$');
    if ([...aliases.keys(), ...[...currentPaths].map(p => '/' + p), '/'].some(p => pattern.test(p))) fail(`Rule _redirects thủ công xung đột URL CMS: ${line}`);
  }
  const redirects = `${unmanaged.trimEnd()}${unmanaged.trim() ? '\n\n' : ''}${START}\n${[...aliases].sort().map(([from, to]) => `${from} ${to} 301`).join('\n')}\n${END}\n`;
  const sitemapItems = [{ _url: '/' }, ...Object.values(published).flat()];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapItems.map(x => `<url><loc>${esc(absolute(x._url))}</loc>${x._kind === 'articles' && (x.updated_at || x.published_at) ? `<lastmod>${esc(x.updated_at || x.published_at)}</lastmod>` : ''}</url>`).join('')}</urlset>\n`;

  const legacy = fs.existsSync(disk('scripts/cms-legacy-pages.json')) ? read('scripts/cms-legacy-pages.json') : {};
  if (!object(legacy)) fail('Legacy migration map không hợp lệ');
  const previous = fs.existsSync(disk(MANIFEST)) ? read(MANIFEST) : { version: 1, pages: legacy };
  if (previous.version !== 1 || !object(previous.pages)) fail('Manifest CMS không hợp lệ');
  const isPagePath = p => p === 'assets/js/cms-catalog.js' || /^(san-pham|cam-nang|chuyen-muc)\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(p);
  for (const [relative, digest] of Object.entries(previous.pages)) if (!isPagePath(relative) || !/^[a-f0-9]{64}$/.test(digest)) fail('Manifest có đường dẫn/hash không hợp lệ');
  const originalContent = new Map();
  function inspect(relative) {
    const p = disk(relative);
    const value = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    originalContent.set(relative, value); return value;
  }
  for (const relative of new Set([...Object.keys(previous.pages), ...outputs.keys()])) {
    const value = inspect(relative);
    if (value === null) continue;
    if (!(relative in previous.pages)) fail(`Không ghi đè HTML chưa thuộc manifest: ${relative}. Cần xác nhận/migrate file builder cũ trước.`);
    if ((!value.includes(OWNER) && hash(value) !== legacy[relative]) || hash(value) !== previous.pages[relative]) fail(`File generated đã bị sửa ngoài CMS: ${relative}`);
  }
  for (const from of aliases.keys()) {
    const relative = from.slice(1);
    if (fs.existsSync(disk(relative)) && !(relative in previous.pages)) fail(`Redirect đè file thủ công: ${from}`);
  }
  // Report untracked legacy pages, never delete them by directory or guessed slug.
  for (const dir of ['san-pham', 'cam-nang', 'chuyen-muc']) if (fs.existsSync(disk(dir))) {
    for (const filename of fs.readdirSync(disk(dir))) if (filename.endsWith('.html') && !(`${dir}/${filename}` in previous.pages) && !outputs.has(`${dir}/${filename}`)) warn(`HTML ngoài manifest cần rà migration: ${dir}/${filename}`);
  }
  const removals = Object.keys(previous.pages).filter(p => !outputs.has(p));
  const summary = { products: published.products.length, articles: published.articles.length, categories: published.categories.length, redirects: aliases.size, removed: removals, warnings: [...warnings] };
  if (check) return summary;
  const changes = new Map(outputs);
  changes.set('index.html', home); changes.set('_redirects', redirects); changes.set('sitemap.xml', sitemap);
  changes.set(MANIFEST, JSON.stringify({ version: 1, pages: Object.fromEntries([...outputs].map(([p, body]) => [p, hash(body)])) }, null, 2) + '\n');
  for (const p of removals) changes.set(p, null);
  for (const p of changes.keys()) if (!originalContent.has(p)) inspect(p);
  // Roll back file contents if a write fails. Run a single build process at a time.
  const touched = [];
  try {
    for (const [relative, value] of changes) {
      const filename = disk(relative); touched.push(relative);
      if (value === null) { if (fs.existsSync(filename)) fs.unlinkSync(filename); }
      else { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, value, 'utf8'); }
    }
  } catch (error) {
    for (const relative of touched.reverse()) {
      const old = originalContent.get(relative), filename = disk(relative);
      if (old === null) { if (fs.existsSync(filename)) fs.unlinkSync(filename); }
      else fs.writeFileSync(filename, old, 'utf8');
    }
    throw error;
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = process.argv.slice(2);
    if (flags.some(f => f !== '--check')) fail('Cách dùng: node scripts/build.mjs [--check]');
    const result = build(process.cwd(), { check: flags.includes('--check') });
    for (const warning of result.warnings) console.warn('CẢNH BÁO:', warning);
    console.log(`${flags.includes('--check') ? 'Kiểm tra đạt' : 'Đã build'}: ${result.products} sản phẩm, ${result.articles} bài viết, ${result.categories} chuyên mục; ${result.redirects} redirect; xóa ${result.removed.length} trang generated cũ.`);
  } catch (error) { console.error('BUILD DỪNG:', error.message); process.exitCode = 1; }
}
