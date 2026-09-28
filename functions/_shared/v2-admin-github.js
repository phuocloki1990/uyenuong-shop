const OWNER = 'phuocloki1990';
const REPO = 'uyenuong-shop';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA = /^[a-f0-9]{40}$/i;
const BRANCH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const RESERVED = new Set(['cam-nang','lien-he','gio-hang','dat-hang','admin','api','assets']);
const STATUS = new Set(['draft','published','hidden']);
const TYPES = new Set(['simple','variant','composite']);
const CONTENT = {
  products: 'v2/content/products',
  articles: 'v2/content/articles',
  categories: 'v2/content/categories',
  settings: 'v2/content/settings'
};
export const MEDIA_DIRS = {
  products: 'assets/images/products',
  articles: 'assets/images/articles',
  categories: 'assets/images/categories',
  site: 'assets/images/site'
};
const PRODUCTION_HOSTS = new Set(['shopuyenuong.vn','www.shopuyenuong.vn','uyenuong-shop.pages.dev']);
const V2_WORKFLOW = 'rebuild-v2-preview.yml';
const IMAGE_FILE = /\.(?:jpe?g|png|webp)$/i;

const isObj = value => value && typeof value === 'object' && !Array.isArray(value);
const required = (value, field) => { if (typeof value !== 'string' || !value.trim()) throw bad(`${field}: bắt buộc`); return value.trim(); };
const optional = (value, field) => { if (value == null || value === '') return ''; if (typeof value !== 'string') throw bad(`${field}: phải là chuỗi`); return value.trim(); };
const bad = message => Object.assign(new Error(message), { status: 400 });
const validateSlug = (value, field='slug') => { const slug=required(value,field); if(!SLUG.test(slug)) throw bad(`${field}: slug không hợp lệ`); return slug; };
const validateImage = (value, field) => { const p=required(value,field); if(!p.startsWith('/assets/images/')||p.includes('..')) throw bad(`${field}: đường dẫn ảnh không hợp lệ`); return p; };

export function json(data, status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}}); }
export function sameOrigin(request) { const origin=request.headers.get('Origin'); return !origin || origin === new URL(request.url).origin; }

export function getConfig(request, env) {
  if (!env.GITHUB_CONTENT_TOKEN) throw Object.assign(new Error('Chưa cấu hình kết nối nội dung cho Admin.'),{status:503});
  const host = new URL(request.url).hostname.toLowerCase();
  let branch = '';
  if (PRODUCTION_HOSTS.has(host)) branch = 'main';
  else branch = String(env.GITHUB_CONTENT_BRANCH || '').trim();
  if (!BRANCH.test(branch) || (!PRODUCTION_HOSTS.has(host) && branch === 'main')) throw Object.assign(new Error('Chưa cấu hình nhánh Preview an toàn.'),{status:503});
  return { token:env.GITHUB_CONTENT_TOKEN, branch, production:PRODUCTION_HOSTS.has(host) };
}

function headers(token){return{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'User-Agent':'uyenuong-shop-v2-admin','X-GitHub-Api-Version':'2022-11-28'};}
function contentUrl(path){return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;}
function workflowRunsUrl(branch){return `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${V2_WORKFLOW}/runs?branch=${encodeURIComponent(branch)}&per_page=10`;}
export function decodeBase64Utf8(value){const binary=atob(String(value).replace(/\s/g,''));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
export function encodeBase64Utf8(value){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export function encodeBase64Bytes(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}

export function resolveContentPath(kind, slug) {
  if (!Object.hasOwn(CONTENT,kind)) throw bad('Loại nội dung không hợp lệ.');
  if (kind === 'settings') { if (slug !== 'site') throw bad('Cài đặt không hợp lệ.'); return `${CONTENT.settings}/site.json`; }
  return `${CONTENT[kind]}/${validateSlug(slug)}.json`;
}

async function githubJson(url, options, errorMessage) {
  const response = await fetch(url, options); const text = await response.text(); let data=null; try{data=JSON.parse(text)}catch{}
  if (!response.ok) { const error=Object.assign(new Error(data?.message || errorMessage),{status:response.status===404?404:502,github_status:response.status}); throw error; }
  return data;
}

export async function getDocument(config, kind, slug) {
  const path=resolveContentPath(kind,slug);
  const result=await githubJson(`${contentUrl(path)}?ref=${encodeURIComponent(config.branch)}`,{headers:headers(config.token),cache:'no-store'},'Không thể đọc nội dung từ GitHub.');
  if(result.type!=='file'||result.encoding!=='base64'||typeof result.content!=='string'||typeof result.sha!=='string')throw Object.assign(new Error('Phản hồi nội dung không hợp lệ.'),{status:502});
  let data; try{data=JSON.parse(decodeBase64Utf8(result.content))}catch{throw Object.assign(new Error('File JSON không hợp lệ.'),{status:502});}
  return { path, sha:result.sha, data };
}

export async function listDocuments(config, kind) {
  if(!Object.hasOwn(CONTENT,kind))throw bad('Loại nội dung không hợp lệ.');
  const folder=CONTENT[kind];
  const result=await githubJson(`${contentUrl(folder)}?ref=${encodeURIComponent(config.branch)}`,{headers:headers(config.token),cache:'no-store'},'Không thể đọc danh sách nội dung.');
  if(!Array.isArray(result))throw Object.assign(new Error('Danh sách GitHub không hợp lệ.'),{status:502});
  const files=result.filter(x=>x.type==='file'&&x.name.endsWith('.json')).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  const items=[];
  for(const file of files){
    try{const detail=await getDocument(config,kind,kind==='settings'?'site':file.name.replace(/\.json$/,''));items.push({slug:kind==='settings'?'site':file.name.replace(/\.json$/,''),sha:detail.sha,data:detail.data});}
    catch(error){if(error.status!==404)throw error;}
  }
  return items;
}

function validatePreviousSlugs(value,currentSlug,field,{reserved=false}={}){if(!Array.isArray(value))throw bad(`${field}: phải là mảng`);const seen=new Set();return value.map((item,i)=>{const slug=validateSlug(item,`${field}[${i}]`);if(slug===currentSlug)throw bad(`${field}: không được chứa slug hiện tại`);if(reserved&&RESERVED.has(slug))throw bad(`${field}: chứa slug hệ thống`);if(seen.has(slug))throw bad(`${field}: trùng slug ${slug}`);seen.add(slug);return slug;});}
function validateOptionGroup(group, field) {
  if(!isObj(group))throw bad(`${field}: không hợp lệ`); validateSlug(group.id,`${field}.id`);required(group.name,`${field}.name`);if(group.type!=='single_select')throw bad(`${field}.type: chỉ hỗ trợ single_select`);if(!Array.isArray(group.options)||!group.options.length)throw bad(`${field}.options: cần lựa chọn`);let defaults=0;const ids=new Set();group.options.forEach((o,i)=>{if(!isObj(o))throw bad(`${field}.options[${i}]: không hợp lệ`);const id=validateSlug(o.id,`${field}.options[${i}].id`);if(ids.has(id))throw bad(`${field}: trùng option ${id}`);ids.add(id);required(o.label,`${field}.options[${i}].label`);if(o.default===true)defaults++;if(o.allow_custom_text===true)required(o.custom_placeholder,`${field}.options[${i}].custom_placeholder`);});if(defaults>1)throw bad(`${field}: chỉ được có một mặc định`);
}
function validateProduct(data, storageKey='') {
  if(!isObj(data))throw bad('Sản phẩm phải là object.');const slug=validateSlug(data.slug);const id=validateSlug(data.id,'id');if(storageKey&&id!==storageKey)throw bad('ID sản phẩm phải ổn định sau khi tạo.');if(RESERVED.has(slug))throw bad('Slug này được hệ thống sử dụng.');data.previous_slugs=validatePreviousSlugs(data.previous_slugs||[],slug,'previous_slugs',{reserved:true});required(data.name,'name');if(!STATUS.has(data.status))throw bad('status không hợp lệ');if(!TYPES.has(data.type))throw bad('type không hợp lệ');validateImage(data.main_image,'main_image');if(!Array.isArray(data.gallery))throw bad('gallery phải là mảng');data.gallery.forEach((x,i)=>validateImage(x,`gallery[${i}]`));required(data.short_description,'short_description');if(!isObj(data.price)||!['contact','fixed'].includes(data.price.mode))throw bad('price không hợp lệ');required(data.price.display_text,'price.display_text');if(data.price.mode==='fixed'&&(!Number.isFinite(data.price.amount)||data.price.amount<0))throw bad('price.amount không hợp lệ');if(!isObj(data.note)||typeof data.note.enabled!=='boolean')throw bad('note không hợp lệ');if(!Array.isArray(data.info_blocks))throw bad('info_blocks phải là mảng');data.info_blocks.forEach((b,i)=>{required(b?.title,`info_blocks[${i}].title`);required(b?.description,`info_blocks[${i}].description`)});if(!Array.isArray(data.related_products)||!Array.isArray(data.related_articles))throw bad('related_* phải là mảng');if(!isObj(data.seo))throw bad('seo bắt buộc');required(data.seo.title,'seo.title');required(data.seo.description,'seo.description');
  if(data.type==='variant'){if(!Array.isArray(data.option_groups)||!data.option_groups.length)throw bad('Variant cần ít nhất một nhóm lựa chọn.');data.option_groups.forEach((g,i)=>validateOptionGroup(g,`option_groups[${i}]`));}
  if(data.type==='simple'&&data.option_groups?.length)throw bad('Sản phẩm cơ bản không dùng option_groups.');
  if(data.type==='composite'){if(!isObj(data.quantity)||data.quantity.enabled!==false||data.quantity.derived_from!=='selected_components')throw bad('Composite phải tự tính số lượng theo selected_components.');if(!Array.isArray(data.components)||!data.components.length)throw bad('Composite cần ít nhất một lễ vật.');const ids=new Set();data.components.forEach((item,i)=>{const cid=validateSlug(item?.id,`components[${i}].id`);if(ids.has(cid))throw bad(`Trùng lễ vật ${cid}`);ids.add(cid);required(item.label,`components[${i}].label`);if(item.sub_option)validateOptionGroup(item.sub_option,`components[${i}].sub_option`);if(item.allow_custom_text===true)required(item.custom_placeholder,`components[${i}].custom_placeholder`)});if(!isObj(data.receive_date)||data.receive_date.enabled!==true||data.receive_date.carry_to_checkout!==true||data.receive_date.checkout_is_final!==true)throw bad('Composite phải bật ngày nhận và carry_to_checkout.');}
  else {if(!isObj(data.quantity)||typeof data.quantity.enabled!=='boolean')throw bad('quantity không hợp lệ');if(data.quantity.enabled){for(const k of ['default_value','min_value','step'])if(!Number.isInteger(data.quantity[k])||data.quantity[k]<1)throw bad(`quantity.${k} không hợp lệ`);if(data.quantity.default_value<data.quantity.min_value)throw bad('quantity.default_value nhỏ hơn min_value');}}
  return data;
}
function validateArticle(data, storageKey=''){if(!isObj(data))throw bad('Bài viết phải là object.');const id=validateSlug(data.id,'id');const slug=validateSlug(data.slug);if(storageKey&&id!==storageKey)throw bad('ID bài viết phải ổn định sau khi tạo.');data.previous_slugs=validatePreviousSlugs(data.previous_slugs||[],slug,'previous_slugs');required(data.title,'title');validateSlug(data.category,'category');if(!STATUS.has(data.status))throw bad('status không hợp lệ');if(typeof data.featured!=='boolean')throw bad('featured phải là boolean');if(!Number.isInteger(data.featured_order)||data.featured_order<0)throw bad('featured_order không hợp lệ');if(!isObj(data.cover))throw bad('cover bắt buộc');validateImage(data.cover.src,'cover.src');required(data.cover.alt,'cover.alt');required(data.excerpt,'excerpt');if(!Array.isArray(data.blocks)||!data.blocks.length)throw bad('blocks cần ít nhất một block');const types=new Set(['paragraph','h2','h3','list','image','callout']);data.blocks.forEach((b,i)=>{if(!isObj(b)||!types.has(b.type))throw bad(`blocks[${i}] không hợp lệ`);if(['paragraph','h2','h3','callout'].includes(b.type))required(b.text,`blocks[${i}].text`);if(b.type==='list'){if(!Array.isArray(b.items)||!b.items.length)throw bad(`blocks[${i}].items cần dữ liệu`);b.items.forEach((x,j)=>required(x,`blocks[${i}].items[${j}]`));}if(b.type==='image'){validateImage(b.src,`blocks[${i}].src`);required(b.alt,`blocks[${i}].alt`);optional(b.caption,`blocks[${i}].caption`);}});if(!Array.isArray(data.related_products)||!Array.isArray(data.related_articles))throw bad('related_* phải là mảng');if(!isObj(data.seo))throw bad('seo bắt buộc');required(data.seo.title,'seo.title');required(data.seo.description,'seo.description');return data;}
function validateCategory(data, storageKey=''){if(!isObj(data))throw bad('Chuyên mục phải là object.');const slug=validateSlug(data.slug);const id=validateSlug(data.id,'id');if(storageKey&&id!==storageKey)throw bad('ID chuyên mục phải ổn định sau khi tạo.');data.previous_slugs=validatePreviousSlugs(data.previous_slugs||[],slug,'previous_slugs');required(data.name,'name');if(!STATUS.has(data.status))throw bad('status không hợp lệ');optional(data.description,'description');if(typeof data.public_hub!=='boolean')throw bad('public_hub phải là boolean');return data;}
function validateSettings(data){if(!isObj(data))throw bad('Cài đặt phải là object.');for(const f of ['name','brand_line','canonical_domain','address','hotline','hotline_display','zalo'])required(data[f],f);if(!String(data.canonical_domain).startsWith('https://'))throw bad('canonical_domain phải dùng https');if(!Array.isArray(data.fanpages))throw bad('fanpages phải là mảng');data.fanpages.forEach((p,i)=>{required(p?.label,`fanpages[${i}].label`);required(p?.url,`fanpages[${i}].url`)});if(!isObj(data.seo))throw bad('seo bắt buộc');required(data.seo.title,'seo.title');required(data.seo.description,'seo.description');return data;}
export function validateDocument(kind,data,storageKey=''){if(kind==='products')return validateProduct(data,storageKey);if(kind==='articles')return validateArticle(data,storageKey);if(kind==='categories')return validateCategory(data,storageKey);if(kind==='settings')return validateSettings(data);throw bad('Loại nội dung không hợp lệ.');}

function normalizeSlugHistory(data,current){const currentSlug=String(data.slug||'').trim();const oldSlug=String(current?.data?.slug||'').trim();const existing=Array.isArray(current?.data?.previous_slugs)?current.data.previous_slugs:[];const set=new Set(existing.filter(slug=>slug&&slug!==currentSlug));if(oldSlug&&oldSlug!==currentSlug)set.add(oldSlug);data.previous_slugs=[...set];return data;}
async function assertPublicSlugAvailable(config,kind,storageKey,data){if(kind==='settings')return;const target=String(data.slug||'').trim();const kinds=kind==='products'?['products']:kind==='articles'?['articles','categories']:['categories','articles'];for(const candidateKind of kinds){let items=[];try{items=await listDocuments(config,candidateKind);}catch(error){if(error.status===404)continue;throw error;}for(const item of items){if(candidateKind===kind&&item.slug===storageKey)continue;const candidate=item.data||{};if(String(candidate.slug||'')===target)throw Object.assign(new Error('Slug công khai đã được sử dụng.'),{status:409});if(Array.isArray(candidate.previous_slugs)&&candidate.previous_slugs.includes(target))throw Object.assign(new Error('Slug này đang được giữ làm URL chuyển hướng cũ.'),{status:409});}}
}

export async function saveDocument(config,{kind,slug,sha,data}){
  const storageKey=kind==='settings'?'site':validateSlug(slug,'slug');const path=resolveContentPath(kind,storageKey);let current=null;
  try{current=await getDocument(config,kind,storageKey);}catch(error){if(error.status!==404)throw error;}
  if(current){if(!sha||!SHA.test(sha))throw bad('Thiếu mã phiên bản nội dung.');if(current.sha!==sha)throw Object.assign(new Error('Nội dung đã có phiên bản mới. Vui lòng tải lại.'),{status:409,current_sha:current.sha});}
  else if(sha)throw Object.assign(new Error('Nội dung không còn tồn tại.'),{status:409});
  if(kind!=='settings'){
    if(!current&&String(data?.id||'')!==storageKey)throw bad('ID nội dung mới phải trùng khóa lưu trữ ban đầu.');
    normalizeSlugHistory(data,current);
  }
  validateDocument(kind,data,current?storageKey:'');
  await assertPublicSlugAvailable(config,kind,storageKey,data);
  const body={message:`Admin V2: ${current?'update':'create'} ${kind}/${storageKey}`,content:encodeBase64Utf8(`${JSON.stringify(data,null,2)}\n`),branch:config.branch};if(current)body.sha=current.sha;
  const response=await fetch(contentUrl(path),{method:'PUT',headers:{...headers(config.token),'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await response.text();let result=null;try{result=JSON.parse(text)}catch{}
  if(response.status===409||response.status===422)throw Object.assign(new Error('Không thể lưu vì nội dung vừa thay đổi hoặc dữ liệu không hợp lệ.'),{status:409});if(!response.ok)throw Object.assign(new Error(result?.message||'Không thể lưu nội dung.'),{status:502});
  return {sha:result?.content?.sha||null,commit_sha:result?.commit?.sha||null,created:!current,path,storage_key:storageKey,public_slug:data?.slug||storageKey};
}

export function normalizeUploadName(filename){const raw=String(filename||'');const dot=raw.lastIndexOf('.');const base=(dot>=0?raw.slice(0,dot):raw).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'anh';return base;}
export function detectImageType(bytes){if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return{ext:'.jpg',mime:'image/jpeg'};if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return{ext:'.png',mime:'image/png'};if(bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return{ext:'.webp',mime:'image/webp'};return null;}
export async function listMedia(config){
  const groups=Object.entries(MEDIA_DIRS);const docs=[];
  for(const kind of ['products','articles','categories','settings']){
    try{docs.push(...(await listDocuments(config,kind)).map(x=>x.data));}
    catch(error){if(error.status!==404)throw error;}
  }
  const serialized=docs.map(x=>JSON.stringify(x));const items=[];
  for(const [group,folder] of groups){
    let result;
    try{result=await githubJson(`${contentUrl(folder)}?ref=${encodeURIComponent(config.branch)}`,{headers:headers(config.token),cache:'no-store'},'Không thể đọc thư viện ảnh.');}
    catch(error){if(error.status===404)continue;throw error;}
    if(!Array.isArray(result))continue;
    for(const file of result.filter(x=>x.type==='file'&&IMAGE_FILE.test(x.name))){
      const publicPath=`/${file.path}`;
      items.push({group,group_label:{products:'Sản phẩm',articles:'Cẩm nang',categories:'Chuyên mục',site:'Website'}[group],name:file.name,path:file.path,url:publicPath,sha:file.sha,size:Number(file.size)||0,usage_count:serialized.reduce((n,text)=>n+(text.includes(publicPath)?1:0),0)});
    }
  }
  return items.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}

export async function uploadMedia(config,{group,file}){
  if(!Object.hasOwn(MEDIA_DIRS,group))throw bad('Nhóm ảnh không hợp lệ.');
  if(!file||typeof file.arrayBuffer!=='function')throw bad('Chưa chọn file ảnh.');
  if(file.size>900000)throw Object.assign(new Error('Ảnh vượt quá 900 KB.'),{status:413});
  const bytes=new Uint8Array(await file.arrayBuffer());const type=detectImageType(bytes);
  if(!type)throw bad('Chỉ hỗ trợ JPG, PNG hoặc WebP.');
  const name=`${normalizeUploadName(file.name)}${type.ext}`;const path=`${MEDIA_DIRS[group]}/${name}`;
  try{
    const existing=await githubJson(`${contentUrl(path)}?ref=${encodeURIComponent(config.branch)}`,{headers:headers(config.token),cache:'no-store'},'');
    const error=Object.assign(new Error('Tên ảnh đã tồn tại trong nhóm này. Vui lòng chọn tên khác.'),{status:409,existing_url:`/${path}`,existing_sha:existing?.sha||null});
    throw error;
  }catch(error){if(error.status!==404)throw error;}
  const response=await fetch(contentUrl(path),{method:'PUT',headers:{...headers(config.token),'Content-Type':'application/json'},body:JSON.stringify({message:`Admin V2: upload ${path}`,content:encodeBase64Bytes(bytes),branch:config.branch})});
  const text=await response.text();let result=null;try{result=JSON.parse(text)}catch{};
  if(!response.ok)throw Object.assign(new Error(result?.message||'Không thể tải ảnh lên.'),{status:502});
  return{name,url:`/${path}`,path,size:bytes.byteLength,sha:result?.content?.sha||null,commit_sha:result?.commit?.sha||null};
}

export async function getPublishStatus(config,{commitSha=''}={}){
  const result=await githubJson(workflowRunsUrl(config.branch),{headers:headers(config.token),cache:'no-store'},'Không thể kiểm tra trạng thái cập nhật website.');
  const runs=Array.isArray(result?.workflow_runs)?result.workflow_runs:[];
  const run=commitSha ? runs.find(item=>item?.head_sha===commitSha) : runs[0];
  if(!run){
    return {state:commitSha?'pending':'unknown',status:null,conclusion:null,head_sha:commitSha||null,updated_at:null};
  }
  const state=run.status==='completed' ? (run.conclusion==='success'?'success':'failed') : 'pending';
  return {state,status:run.status||null,conclusion:run.conclusion||null,head_sha:run.head_sha||null,updated_at:run.updated_at||null};
}
