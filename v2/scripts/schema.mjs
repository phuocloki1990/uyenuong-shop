import {validateContentHtml} from './safe-html.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const SYSTEM_RESERVED_SLUGS = new Set([
  'cam-nang', 'lien-he', 'gio-hang', 'dat-hang', 'admin', 'api', 'assets'
]);

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statusValues = new Set(['draft', 'published', 'hidden']);
const typeValues = new Set(['simple', 'variant', 'composite']);
const priceModes = new Set(['contact', 'fixed', 'hybrid']);
const articleBlockTypes = new Set(['paragraph', 'h2', 'h3', 'list', 'image', 'callout']);

function fail(message) {
  const error = new Error(message);
  error.name = 'V2ContentError';
  throw error;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field}: bắt buộc`);
  return value.trim();
}

function optionalString(value, field) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') fail(`${field}: phải là chuỗi`);
  return value.trim();
}

function validateSlug(value, field) {
  const slug = requiredString(value, field);
  if (!slugPattern.test(slug)) fail(`${field}: slug không hợp lệ`);
  return slug;
}

function validatePreviousSlugs(value, currentSlug, field, { reserved = false } = {}) {
  if (!Array.isArray(value)) fail(`${field}: phải là mảng`);
  const seen = new Set();
  return value.map((item, index) => {
    const slug = validateSlug(item, `${field}[${index}]`);
    if (slug === currentSlug) fail(`${field}: không được chứa slug hiện tại`);
    if (reserved && SYSTEM_RESERVED_SLUGS.has(slug)) fail(`${field}: chứa slug hệ thống ${slug}`);
    if (seen.has(slug)) fail(`${field}: trùng slug ${slug}`);
    seen.add(slug);
    return slug;
  });
}

function stableIdFromFilename(filename, field) {
  const stem = String(filename).replace(/\.json$/i, '');
  return validateSlug(stem, field);
}

function validateImagePath(value, field) {
  const imagePath = requiredString(value, field);
  if (!imagePath.startsWith('/assets/images/') || imagePath.includes('..')) fail(`${field}: phải nằm trong /assets/images/`);
  return imagePath;
}

function validatePrice(price, file) {
  if (!isObject(price)) fail(`${file}.price: bắt buộc`);
  if (!priceModes.has(price.mode)) fail(`${file}.price.mode: không hợp lệ`);
  requiredString(price.display_text, `${file}.price.display_text`);
  if (price.mode === 'fixed') {
    if (!Number.isFinite(price.amount) || price.amount < 0) fail(`${file}.price.amount: không hợp lệ`);
  }
  if (price.mode === 'hybrid') {
    if (!Array.isArray(price.rules) || price.rules.length < 1) fail(`${file}.price.rules: hybrid cần ít nhất 1 quy tắc giá`);
    for (const [i, rule] of price.rules.entries()) {
      if (!isObject(rule)) fail(`${file}.price.rules[${i}]: không hợp lệ`);
      requiredString(rule.label, `${file}.price.rules[${i}].label`);
      validateSlug(rule.option_group, `${file}.price.rules[${i}].option_group`);
      validateSlug(rule.option_id, `${file}.price.rules[${i}].option_id`);
      if (!Number.isInteger(rule.quantity) || rule.quantity < 1) fail(`${file}.price.rules[${i}].quantity: phải là số nguyên >= 1`);
      if (!Number.isFinite(rule.amount) || rule.amount < 0) fail(`${file}.price.rules[${i}].amount: không hợp lệ`);
    }
  }
}

function validateQuantity(quantity, file, type) {
  if (!isObject(quantity)) fail(`${file}.quantity: bắt buộc`);
  if (typeof quantity.enabled !== 'boolean') fail(`${file}.quantity.enabled: phải là boolean`);
  if (type === 'composite') {
    if (quantity.enabled) fail(`${file}.quantity: composite không dùng quantity độc lập`);
    if (quantity.derived_from !== 'selected_components') fail(`${file}.quantity.derived_from: phải là selected_components`);
    return;
  }
  if (!quantity.enabled) return;
  for (const key of ['default_value', 'min_value', 'step']) {
    if (!Number.isInteger(quantity[key]) || quantity[key] < 1) fail(`${file}.quantity.${key}: phải là số nguyên >= 1`);
  }
  if (quantity.default_value < quantity.min_value) fail(`${file}.quantity.default_value: nhỏ hơn min_value`);
  if (quantity.hint != null) optionalString(quantity.hint, `${file}.quantity.hint`);
}

function validateOptionGroup(group, file) {
  if (!isObject(group)) fail(`${file}: option group không hợp lệ`);
  validateSlug(group.id, `${file}.id`);
  requiredString(group.name, `${file}.name`);
  if (group.type !== 'single_select') fail(`${file}.type: hiện chỉ hỗ trợ single_select ở V2 Core`);
  if (!Array.isArray(group.options) || group.options.length < 1) fail(`${file}.options: cần ít nhất 1 lựa chọn`);
  const ids = new Set();
  let defaults = 0;
  for (const [i, option] of group.options.entries()) {
    if (!isObject(option)) fail(`${file}.options[${i}]: không hợp lệ`);
    const id = validateSlug(option.id, `${file}.options[${i}].id`);
    if (ids.has(id)) fail(`${file}: trùng option id ${id}`);
    ids.add(id);
    requiredString(option.label, `${file}.options[${i}].label`);
    if (option.default === true) defaults += 1;
    if (option.allow_custom_text === true) requiredString(option.custom_placeholder, `${file}.options[${i}].custom_placeholder`);
  }
  if (defaults > 1) fail(`${file}: chỉ được có tối đa 1 option mặc định`);
}

function validateProduct(product, filename) {
  const file = `products/${filename}`;
  if (!isObject(product)) fail(`${file}: JSON phải là object`);
  const storageId = stableIdFromFilename(filename, `${file}.filename`);
  const id = validateSlug(product.id, `${file}.id`);
  const slug = validateSlug(product.slug, `${file}.slug`);
  if (id !== storageId) fail(`${file}.id: phải ổn định và trùng tên file`);
  const previousSlugs = validatePreviousSlugs(product.previous_slugs ?? [], slug, `${file}.previous_slugs`, { reserved:true });
  requiredString(product.name, `${file}.name`);
  if (!statusValues.has(product.status)) fail(`${file}.status: không hợp lệ`);
  if (!typeValues.has(product.type)) fail(`${file}.type: không hợp lệ`);
  validateImagePath(product.main_image, `${file}.main_image`);
  if (product.content_html != null) validateContentHtml(product.content_html, `${file}.content_html`, {allowEmpty:true});
  if (product.seo?.focus_keyword != null) optionalString(product.seo.focus_keyword, `${file}.seo.focus_keyword`);
  if (!Array.isArray(product.gallery)) fail(`${file}.gallery: phải là mảng`);
  product.gallery.forEach((imagePath, i) => validateImagePath(imagePath, `${file}.gallery[${i}]`));
  requiredString(product.short_description, `${file}.short_description`);
  validatePrice(product.price, file);
  validateQuantity(product.quantity, file, product.type);
  if (!isObject(product.note) || typeof product.note.enabled !== 'boolean') fail(`${file}.note: không hợp lệ`);
  if (!Array.isArray(product.info_blocks)) fail(`${file}.info_blocks: phải là mảng`);
  for (const [i, block] of product.info_blocks.entries()) {
    if (!isObject(block)) fail(`${file}.info_blocks[${i}]: không hợp lệ`);
    requiredString(block.title, `${file}.info_blocks[${i}].title`);
    requiredString(block.description, `${file}.info_blocks[${i}].description`);
  }
  if (!Array.isArray(product.related_products) || !Array.isArray(product.related_articles)) fail(`${file}: related_* phải là mảng`);
  if (!isObject(product.seo)) fail(`${file}.seo: bắt buộc`);
  requiredString(product.seo.title, `${file}.seo.title`);
  requiredString(product.seo.description, `${file}.seo.description`);

  if (product.type === 'variant') {
    if (!Array.isArray(product.option_groups) || product.option_groups.length < 1) fail(`${file}.option_groups: variant cần option group`);
    product.option_groups.forEach((group, i) => validateOptionGroup(group, `${file}.option_groups[${i}]`));
    if (product.price.mode === 'hybrid') {
      const groups = new Map(product.option_groups.map(group => [group.id, group]));
      for (const [i, rule] of product.price.rules.entries()) {
        const group = groups.get(rule.option_group);
        if (!group) fail(`${file}.price.rules[${i}].option_group: không tồn tại`);
        if (!group.options.some(option => option.id === rule.option_id)) fail(`${file}.price.rules[${i}].option_id: không tồn tại`);
        if (product.quantity?.enabled && rule.quantity < product.quantity.min_value) fail(`${file}.price.rules[${i}].quantity: nhỏ hơn số lượng tối thiểu`);
      }
    }
  }
  if (product.type !== 'variant' && product.price.mode === 'hybrid') fail(`${file}.price.mode: hybrid hiện chỉ hỗ trợ variant`);
  if (product.type === 'simple' && product.option_groups?.length) fail(`${file}: simple không dùng option_groups`);
  if (product.type === 'composite') {
    if (!Array.isArray(product.components) || product.components.length < 1) fail(`${file}.components: composite cần lễ vật`);
    const ids = new Set();
    for (const [i, item] of product.components.entries()) {
      if (!isObject(item)) fail(`${file}.components[${i}]: không hợp lệ`);
      const componentId = validateSlug(item.id, `${file}.components[${i}].id`);
      if (ids.has(componentId)) fail(`${file}: trùng component id ${componentId}`);
      ids.add(componentId);
      requiredString(item.label, `${file}.components[${i}].label`);
      if (item.sub_option) validateOptionGroup(item.sub_option, `${file}.components[${i}].sub_option`);
      if (item.allow_custom_text === true) requiredString(item.custom_placeholder, `${file}.components[${i}].custom_placeholder`);
    }
    if (!isObject(product.receive_date) || product.receive_date.enabled !== true || product.receive_date.carry_to_checkout !== true || product.receive_date.checkout_is_final !== true) {
      fail(`${file}.receive_date: phải bật carry_to_checkout và checkout_is_final`);
    }
  }
  return { ...product, id, slug, previous_slugs:previousSlugs, _storage_key:storageId };
}

function validateCategory(category, filename) {
  const file = `categories/${filename}`;
  if (!isObject(category)) fail(`${file}: JSON phải là object`);
  const storageId = stableIdFromFilename(filename, `${file}.filename`);
  const id = validateSlug(category.id, `${file}.id`);
  const slug = validateSlug(category.slug, `${file}.slug`);
  if (id !== storageId) fail(`${file}.id: phải ổn định và trùng tên file`);
  const previousSlugs = validatePreviousSlugs(category.previous_slugs ?? [], slug, `${file}.previous_slugs`);
  requiredString(category.name, `${file}.name`);
  if (!statusValues.has(category.status)) fail(`${file}.status: không hợp lệ`);
  optionalString(category.description, `${file}.description`);
  if (typeof category.public_hub !== 'boolean') fail(`${file}.public_hub: phải là boolean`);
  return { ...category, id, slug, previous_slugs:previousSlugs, _storage_key:storageId };
}

function validateArticleBlock(block, file, index) {
  const field = `${file}.blocks[${index}]`;
  if (!isObject(block)) fail(`${field}: không hợp lệ`);
  if (!articleBlockTypes.has(block.type)) fail(`${field}.type: không hỗ trợ`);
  if (['paragraph', 'h2', 'h3', 'callout'].includes(block.type)) requiredString(block.text, `${field}.text`);
  if (block.type === 'list') {
    if (!Array.isArray(block.items) || block.items.length < 1) fail(`${field}.items: cần ít nhất 1 mục`);
    block.items.forEach((item, i) => requiredString(item, `${field}.items[${i}]`));
  }
  if (block.type === 'image') {
    validateImagePath(block.src, `${field}.src`);
    requiredString(block.alt, `${field}.alt`);
    optionalString(block.caption, `${field}.caption`);
  }
}

function validateArticle(article, filename) {
  const file = `articles/${filename}`;
  if (!isObject(article)) fail(`${file}: JSON phải là object`);
  const storageId = stableIdFromFilename(filename, `${file}.filename`);
  const id = validateSlug(article.id, `${file}.id`);
  const slug = validateSlug(article.slug, `${file}.slug`);
  if (id !== storageId) fail(`${file}.id: phải ổn định và trùng tên file`);
  const previousSlugs = validatePreviousSlugs(article.previous_slugs ?? [], slug, `${file}.previous_slugs`);
  requiredString(article.title, `${file}.title`);
  const category = validateSlug(article.category, `${file}.category`);
  if (!statusValues.has(article.status)) fail(`${file}.status: không hợp lệ`);
  if (typeof article.featured !== 'boolean') fail(`${file}.featured: phải là boolean`);
  if (!Number.isInteger(article.featured_order) || article.featured_order < 0) fail(`${file}.featured_order: phải là số nguyên >= 0`);
  if (!isObject(article.cover)) fail(`${file}.cover: bắt buộc`);
  validateImagePath(article.cover.src, `${file}.cover.src`);
  requiredString(article.cover.alt, `${file}.cover.alt`);
  requiredString(article.excerpt, `${file}.excerpt`);
  validateContentHtml(article.content_html, `${file}.content_html`);
  if (!Array.isArray(article.related_products) || !Array.isArray(article.related_articles)) fail(`${file}: related_* phải là mảng`);
  article.related_products.forEach((productId, i) => validateSlug(productId, `${file}.related_products[${i}]`));
  article.related_articles.forEach((articleId, i) => validateSlug(articleId, `${file}.related_articles[${i}]`));
  if (!isObject(article.seo)) fail(`${file}.seo: bắt buộc`);
  requiredString(article.seo.title, `${file}.seo.title`);
  requiredString(article.seo.description, `${file}.seo.description`);
  return { ...article, id, slug, category, previous_slugs:previousSlugs, _storage_key:storageId };
}

function validateSite(site) {
  if (!isObject(site)) fail('settings/site.json: JSON phải là object');
  for (const field of ['name','brand_line','canonical_domain','address','hotline','hotline_display','zalo']) requiredString(site[field], `settings/site.json.${field}`);
  if (!/^https:\/\//.test(site.canonical_domain)) fail('settings/site.json.canonical_domain: phải dùng https');
  if (!Array.isArray(site.fanpages)) fail('settings/site.json.fanpages: phải là mảng');
  for (const [i, page] of site.fanpages.entries()) {
    requiredString(page.label, `settings/site.json.fanpages[${i}].label`);
    requiredString(page.url, `settings/site.json.fanpages[${i}].url`);
  }
  const validLink = href => typeof href==='string' && ((href.startsWith('/') && !href.startsWith('//') && !href.includes('..')) || /^https:\/\/[^\s<>"']+$/i.test(href));
  if (!isObject(site.header)||!Array.isArray(site.header.menu)||!site.header.menu.length) fail('settings/site.json.header.menu: bắt buộc');
  validateImagePath(site.header.logo,'settings/site.json.header.logo');
  site.header.menu.forEach((item,i)=>{requiredString(item.label,`header.menu[${i}].label`);if(!validLink(item.href))fail(`header.menu[${i}].href: URL không hợp lệ`);if(typeof item.visible!=='boolean')fail('header menu visible không hợp lệ');});
  if (!isObject(site.footer)||!Array.isArray(site.footer.columns)||!site.footer.columns.length) fail('settings/site.json.footer.columns: bắt buộc');
  requiredString(site.footer.about,'footer.about');requiredString(site.footer.copyright,'footer.copyright');
  site.footer.columns.forEach((col,i)=>{if(!['about','contact','channels','links'].includes(col.type))fail(`footer.columns[${i}].type không hợp lệ`);requiredString(col.title,`footer.columns[${i}].title`);if(typeof col.visible!=='boolean')fail('footer visible không hợp lệ');if(col.type==='links'){if(!Array.isArray(col.items))fail('footer links phải là mảng');col.items.forEach((link,j)=>{requiredString(link.label,`footer.columns[${i}].items[${j}].label`);if(!validLink(link.url))fail('footer link URL không hợp lệ');});}});
  for(const [i,page] of site.fanpages.entries()){if(page.text!=null)optionalString(page.text,`fanpages[${i}].text`);if(page.visible!=null&&typeof page.visible!=='boolean')fail('fanpages.visible không hợp lệ');}
  if(site.media_meta!=null){if(!isObject(site.media_meta))fail('media_meta không hợp lệ');for(const [image,item] of Object.entries(site.media_meta)){if(!/^\/assets\/images\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(image)||image.includes('..')||!isObject(item)||typeof item.alt!=='string'||item.alt.length>200||typeof item.caption!=='string'||item.caption.length>300)fail('media_meta chứa dữ liệu không hợp lệ');}}
  if (!isObject(site.seo)) fail('settings/site.json.seo: bắt buộc');
  requiredString(site.seo.title, 'settings/site.json.seo.title');
  requiredString(site.seo.description, 'settings/site.json.seo.description');
  return site;
}

export function loadV2Content(repoRoot) {
  const v2Root = path.join(repoRoot, 'v2');
  const site = validateSite(JSON.parse(fs.readFileSync(path.join(v2Root, 'content/settings/site.json'), 'utf8')));

  const productDir = path.join(v2Root, 'content/products');
  const productFiles = fs.readdirSync(productDir).filter(name => name.endsWith('.json')).sort();
  const products = productFiles.map(name => validateProduct(JSON.parse(fs.readFileSync(path.join(productDir, name), 'utf8')), name));
  const productIds = new Set();
  const productSlugs = new Set();
  const productRedirectSlugs = new Set();
  for (const product of products) {
    if (productIds.has(product.id)) fail(`Trùng product id: ${product.id}`);
    if (productSlugs.has(product.slug) || productRedirectSlugs.has(product.slug)) fail(`Trùng product slug: ${product.slug}`);
    if (SYSTEM_RESERVED_SLUGS.has(product.slug)) fail(`Slug hệ thống không được dùng cho sản phẩm: ${product.slug}`);
    productIds.add(product.id);
    productSlugs.add(product.slug);
    for (const previous of product.previous_slugs) {
      if (productSlugs.has(previous) || productRedirectSlugs.has(previous)) fail(`Trùng product redirect slug: ${previous}`);
      productRedirectSlugs.add(previous);
    }
  }
  for (const product of products) {
    for (const related of product.related_products) if (!productIds.has(related)) fail(`${product.id}: related product không tồn tại: ${related}`);
  }

  const categoryDir = path.join(v2Root, 'content/categories');
  const categoryFiles = fs.readdirSync(categoryDir).filter(name => name.endsWith('.json')).sort();
  const categories = categoryFiles.map(name => validateCategory(JSON.parse(fs.readFileSync(path.join(categoryDir, name), 'utf8')), name));
  const categoryIds = new Set();
  const publicCategorySlugs = new Set();
  const categoryRedirectSlugs = new Set();
  for (const category of categories) {
    if (categoryIds.has(category.id)) fail(`Trùng category id: ${category.id}`);
    categoryIds.add(category.id);
    if (category.public_hub) {
      if (publicCategorySlugs.has(category.slug) || categoryRedirectSlugs.has(category.slug)) fail(`Trùng category slug: ${category.slug}`);
      publicCategorySlugs.add(category.slug);
      for (const previous of category.previous_slugs) {
        if (publicCategorySlugs.has(previous) || categoryRedirectSlugs.has(previous)) fail(`Trùng category redirect slug: ${previous}`);
        categoryRedirectSlugs.add(previous);
      }
    }
  }

  const articleDir = path.join(v2Root, 'content/articles');
  const articleFiles = fs.readdirSync(articleDir).filter(name => name.endsWith('.json')).sort();
  const articles = articleFiles.map(name => validateArticle(JSON.parse(fs.readFileSync(path.join(articleDir, name), 'utf8')), name));
  const articleIds = new Set();
  const articleSlugs = new Set();
  const articleRedirectSlugs = new Set();
  for (const article of articles) {
    if (articleIds.has(article.id)) fail(`Trùng article id: ${article.id}`);
    if (articleSlugs.has(article.slug) || articleRedirectSlugs.has(article.slug)) fail(`Trùng article slug: ${article.slug}`);
    if (publicCategorySlugs.has(article.slug)) fail(`Article slug trùng category hub: ${article.slug}`);
    if (categoryRedirectSlugs.has(article.slug)) fail(`Article slug trùng redirect category: ${article.slug}`);
    articleIds.add(article.id);
    articleSlugs.add(article.slug);
    for (const previous of article.previous_slugs) {
      if (articleSlugs.has(previous) || articleRedirectSlugs.has(previous) || publicCategorySlugs.has(previous) || categoryRedirectSlugs.has(previous)) fail(`Trùng article redirect slug: ${previous}`);
      articleRedirectSlugs.add(previous);
    }
    if (!categoryIds.has(article.category)) fail(`${article.slug}: category không tồn tại: ${article.category}`);
    for (const productId of article.related_products) if (!productIds.has(productId)) fail(`${article.slug}: related product không tồn tại: ${productId}`);
  }
  for (const article of articles) {
    for (const relatedId of article.related_articles) {
      if (relatedId === article.id) fail(`${article.slug}: không được tự related chính nó`);
      if (!articleIds.has(relatedId)) fail(`${article.slug}: related article không tồn tại: ${relatedId}`);
    }
  }

  return { site, products, articles, categories };
}

export function validateProductSlugForCreate(slug, existingSlugs = []) {
  const value = validateSlug(slug, 'slug');
  if (SYSTEM_RESERVED_SLUGS.has(value)) fail(`Slug hệ thống không được dùng: ${value}`);
  if (existingSlugs.includes(value)) fail(`Slug đã tồn tại: ${value}`);
  return value;
}
