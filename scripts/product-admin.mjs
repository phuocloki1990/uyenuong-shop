// Shared, pure product CMS rules: also exercised by Node tests.
import { validateProduct, PRODUCT_SLUG } from './product-validation.mjs';

export const PRODUCT_FIELDS = new Set([
  'id','name','slug','category','status','featured','featured_order','card_highlights',
  'image','image_alt','short_description','lead','price_mode','price_text',
  'base_price','quantity','option_groups','price_rules','details','features','faq',
  'related_products','related_articles','redirect_from','seo'
]);
export const FILE_SLUG = PRODUCT_SLUG;
export const imagePattern = /^\/assets\/images\/(?:uploads\/)?[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp)$/i;
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function checkProductPayload(input, existing = null) {
  if (!isObject(input)) return { valid:false, errors:[{field:'product',message:'Dữ liệu sản phẩm không hợp lệ.'}] };
  const errors = [];
  for (const key of Object.keys(input)) if (!PRODUCT_FIELDS.has(key)) errors.push({field:key,message:'Trường dữ liệu không được phép.'});
  if (existing && input.id !== existing.id) errors.push({field:'id',message:'Mã sản phẩm không thể thay đổi sau khi tạo.'});
  if (typeof input.id === 'string' && input.id.length > 80) errors.push({field:'id',message:'Mã sản phẩm tối đa 80 ký tự.'});
  if (typeof input.slug === 'string' && input.slug.length > 100) errors.push({field:'slug',message:'Đường dẫn tối đa 100 ký tự.'});
  if (typeof input.image !== 'string' || (input.image && !imagePattern.test(input.image))) {
    errors.push({field:'image',message:'Chỉ chọn file JPG, PNG hoặc WebP trong thư viện.'});
  }
  if (input.redirect_from !== undefined && (!Array.isArray(input.redirect_from) || (existing && !existing.redirect_from?.every(x => input.redirect_from.includes(x))))) {
    errors.push({field:'redirect_from',message:'Không được xóa đường dẫn chuyển hướng đã lưu.'});
  }
  const result = validateProduct(input);
  errors.push(...result.errors);
  const p = result.product;
  if (existing && existing.slug !== p.slug && existing.status !== 'draft') {
    const oldUrl = `/san-pham/${existing.slug}.html`;
    p.redirect_from = [...new Set([...(p.redirect_from || []),oldUrl])];
  }
  if (!Number.isSafeInteger(p.featured_order) || p.featured_order < 0) errors.push({field:'featured_order',message:'Thứ tự phải là số nguyên không âm.'});
  if (p.base_price !== undefined && !Number.isSafeInteger(p.base_price)) errors.push({field:'base_price',message:'Đơn giá phải là số nguyên VNĐ.'});
  for (const [index,rule] of (Array.isArray(p.price_rules)?p.price_rules:[]).entries()) if (!Number.isSafeInteger(rule?.price)) errors.push({field:`price_rules.${index}.price`,message:'Tổng giá phải là số nguyên VNĐ.'});
  if (p.status === 'published' && !p.image_alt?.trim()) errors.push({field:'image_alt',message:'Hãy mô tả ảnh trước khi xuất bản.'});
  if (p.status === 'published' && !p.seo?.title?.trim()) errors.push({field:'seo.title',message:'Hãy nhập tiêu đề SEO trước khi xuất bản.'});
  if (p.status === 'published' && !p.seo?.description?.trim()) errors.push({field:'seo.description',message:'Hãy nhập mô tả SEO trước khi xuất bản.'});
  if (p.price_mode === 'hybrid' && p.status === 'published' && !p.price_rules.length) {
    // An empty hybrid price list is allowed by the builder, but will quote by contact.
  }
  if (errors.length) return {valid:false, errors};
  return {valid:true, errors:[], product:p, changed:!same(existing,p)};
}

export function checkProductReferences(product, existing, products, categories, articles) {
  const errors = [];
  const others = products.filter(x => x.filename !== existing?.filename);
  if (others.some(x => x.data?.id === product.id)) errors.push({field:'id',message:'Mã sản phẩm đã tồn tại.'});
  if (others.some(x => x.data?.slug === product.slug)) errors.push({field:'slug',message:'Đường dẫn đã được sản phẩm khác sử dụng.'});
  if (others.some(x => x.data?.redirect_from?.includes(`/san-pham/${product.slug}.html`))) errors.push({field:'slug',message:'Đường dẫn này đã là URL chuyển hướng của sản phẩm khác.'});
  const cat = categories.find(x => x.slug === product.category);
  if (!cat || cat.status !== 'published' || cat.slug.endsWith('-bai-viet') || cat.slug === 'cam-nang-cuoi') {
    errors.push({field:'category',message:'Hãy chọn chuyên mục sản phẩm đang hoạt động.'});
  }
  for (const slug of product.related_products || []) {
    if (!products.some(x => x.data?.slug === slug && x.data?.status === 'published')) errors.push({field:'related_products',message:`Sản phẩm liên quan không tồn tại hoặc chưa xuất bản: ${slug}`});
  }
  for (const slug of product.related_articles || []) {
    if (!articles.some(x => x.slug === slug)) errors.push({field:'related_articles',message:`Bài viết liên quan không tồn tại: ${slug}`});
  }
  if (existing && existing.data.slug !== product.slug) {
    const oldSlug = existing.data.slug;
    const affected = others.filter(x => (x.data?.related_products || []).includes(oldSlug));
    if (affected.length || articles.some(x => (x.data?.related_products || []).includes(oldSlug))) {
      errors.push({field:'slug',message:'URL cũ đang được nội dung khác sử dụng làm sản phẩm liên quan. Hãy đổi liên kết ở nội dung liên quan trước khi đổi URL.'});
    }
  }
  return errors;
}

export function productTemplate() {
  return {
    id:'', name:'', slug:'', category:'', status:'draft', featured:false, featured_order:99,
    card_highlights:[], image:'', image_alt:'', short_description:'', lead:'',
    price_mode:'contact',price_text:'Giá liên hệ',
    quantity:{label:'Số lượng',unit:'cái',min:1,default:1,step:1,hint:''},
    option_groups:[],price_rules:[],details:[],features:[],faq:[],
    related_products:[],related_articles:[],redirect_from:[],
    seo:{title:'',description:'',focus_keyword:'',secondary_keywords:[]}
  };
}
