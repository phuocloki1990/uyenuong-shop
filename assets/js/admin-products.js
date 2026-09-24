import { productTemplate, checkProductPayload, imagePattern } from '/scripts/product-admin.mjs';

const CONTENT='/admin/api/content';
const SAVE='/admin/api/products/save';
const MEDIA='/admin/api/media';
const $=id=>document.getElementById(id);
const IMAGE_FALLBACK='/assets/images/logo.jpg';
const statuses={published:'Đã xuất bản',draft:'Bản nháp',hidden:'Đã ẩn'};
const fieldNames={id:'Mã nội bộ',name:'Tên sản phẩm',slug:'Đường dẫn',category:'Chuyên mục',status:'Trạng thái',featured:'Sản phẩm nổi bật',featured_order:'Thứ tự nổi bật',image:'Ảnh đại diện',image_alt:'Mô tả ảnh',short_description:'Mô tả ngắn',lead:'Nội dung đầu trang',price_mode:'Chế độ giá',price_text:'Chữ giá hiển thị',base_price:'Đơn giá',quantity:'Số lượng',option_groups:'Nhóm lựa chọn',price_rules:'Bảng giá theo quy cách',details:'Thông tin chi tiết',features:'Điểm nổi bật',faq:'Câu hỏi thường gặp',card_highlights:'Thông tin trên thẻ',related_products:'Sản phẩm liên quan',related_articles:'Bài viết liên quan',redirect_from:'Đường dẫn cũ',seo:'SEO'};
const textKeys=['id','name','slug','category','status','image_alt','short_description','lead','price_mode','price_text'];
const qs=s=>document.querySelector(s);
let products=[],articles=[],categories=[],media=[],current=null,baseline='',mode='update',busy=false;
let pendingPayload=null,localPreviews=new Map(),mediaLoaded=false;
const jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function message(value='',type=''){$('message').hidden=!value;$('message').textContent=value;$('message').className='message '+type;}
async function readJson(url,opts={}){
  const response=await fetch(url,{cache:'no-store',...opts});
  let result;try{result=await response.json();}catch{throw new Error('Máy chủ không trả dữ liệu hợp lệ.');}
  if(!response.ok||!result.success){const error=new Error(result.message||'Không thể hoàn tất thao tác.');error.status=response.status;error.fields=result.errors||[];throw error;}
  return result;
}
function showError(error){
  let text=error.message;
  if(error.fields?.length)text+='\n'+error.fields.slice(0,8).map(e=>`• ${fieldNames[e.field]||e.field}: ${e.message}`).join('\n');
  message(text,'error');
  const first=error.fields?.[0]?.field?.split('.')[0];
  const id=first==='seo'?'seo_title':first==='quantity'?'quantity_min':first;
  if(id&&$(id))$(id).focus();
}
function imageUrl(path){return localPreviews.get(path)||((typeof path==='string'&&imagePattern.test(path))?path:IMAGE_FALLBACK);}
function imgFallback(img){img.addEventListener('error',()=>{if(img.dataset.fallback)return;img.dataset.fallback='1';img.src=IMAGE_FALLBACK;img.title='Ảnh đang chờ triển khai hoặc không tải được';if(img.id==='selectedImage')$('uploadImageStatus').textContent='Ảnh đang chờ Cloudflare triển khai hoặc chưa tải được; đường dẫn đã chọn vẫn được giữ nguyên.';});}
function setBusy(flag){busy=flag;for(const element of document.querySelectorAll('button,input,select,textarea')){
  if(element.closest('#confirmDialog'))continue;
  element.disabled=flag||(element.id==='saveProduct'&&!isDirty());
}if(!flag&&current)$('id').readOnly=mode==='update';}
function getValue(key){return $(key).value.trim();}
function intValue(id){const value=$(id).value.trim();return value===''?null:Number(value);}
function buildInput(field,value='',placeholder='',multiline=false){
  const wrap=document.createElement('label');wrap.className='repeat-field';
  const title=document.createElement('span');title.textContent=field.label;
  const input=document.createElement(multiline?'textarea':'input');
  input.dataset.field=field.key;input.value=value??'';input.placeholder=placeholder||field.placeholder||'';
  wrap.append(title,input);return wrap;
}
function rowAction(row,container){
  const actions=document.createElement('div');actions.className='repeat-actions';
  for(const [name,direction] of [['↑',-1],['↓',1]]){
    const button=document.createElement('button');button.type='button';button.className='button ghost';button.textContent=name;button.title=direction===-1?'Đưa lên':'Đưa xuống';
    button.addEventListener('click',()=>{const next=direction===-1?row.previousElementSibling:row.nextElementSibling;if(next){if(direction===-1)container.insertBefore(row,next);else container.insertBefore(next,row);refreshDirty();}});actions.append(button);
  }
  const del=document.createElement('button');del.type='button';del.className='button ghost';del.textContent='Xóa dòng';del.addEventListener('click',()=>{row.remove();refreshDirty();});actions.append(del);row.append(actions);
}
const repeatTypes={
  card_highlights:[{key:'text',label:'Thông tin ngắn',placeholder:'Ví dụ: 53g/bánh'}],
  secondary_keywords:[{key:'text',label:'Từ khóa phụ',placeholder:'Ví dụ: bánh cưới hỏi Huế'}],
  features:[{key:'text',label:'Điểm nổi bật',placeholder:'Ví dụ: Nhận từ 20 bánh'}],
  details:[{key:'label',label:'Tên thông tin',placeholder:'Ví dụ: Trọng lượng'},{key:'value',label:'Giá trị',placeholder:'Ví dụ: 53g/bánh'}],
  faq:[{key:'question',label:'Câu hỏi',placeholder:'Ví dụ: Có nhận 70 bánh không?'},{key:'answer',label:'Trả lời',placeholder:'Ví dụ: Có, shop sẽ liên hệ xác nhận.'}],
  option_groups:[{key:'key',label:'Mã nhóm (chữ không dấu)',placeholder:'Ví dụ: flavor'},{key:'label',label:'Tên lựa chọn',placeholder:'Ví dụ: Số vị'},{key:'values',label:'Mỗi giá trị trên một dòng',placeholder:'2 vị\n5 vị'}]
};
function addRepeater(type,value=null){
  const container=$(type);if(type==='card_highlights'&&container.children.length>=2){message('Tối đa 2 thông tin ngắn trên thẻ.','warning');return;}
  const row=document.createElement('div');row.className='repeat-row';row.dataset.type=type;
  if(type==='price_rules'){
    const data=value||{label:'',when:{qty:0},price:''};row.dataset.when=JSON.stringify(data.when||{});
    const group=document.createElement('div');group.className='repeat-grid';
    for(const field of [{key:'label',label:'Tên dòng giá',placeholder:'Ví dụ: 2 vị – 30 cái'},{key:'qty',label:'Số lượng chính xác',placeholder:'Ví dụ: 30'},{key:'price',label:'Tổng giá (VNĐ)',placeholder:'Ví dụ: 180000'}]){
      const input=buildInput(field,field.key==='qty'?data.when?.qty||'':data[field.key]??'');
      if(field.key!=='label'){input.querySelector('input').type='number';input.querySelector('input').min='1';input.querySelector('input').step='1';}
      group.append(input);
    }
    row.append(group);
    const controls=document.createElement('div');controls.className='repeat-grid rule-options';row.append(controls);
    renderRuleOptions(row,data.when||{});
  } else {
    const values=value===null?{}:(typeof value==='string'?{text:value}:value);
    const group=document.createElement('div');group.className='repeat-grid';
    for(const field of repeatTypes[type]){
      const val=field.key==='values'?(values.values||[]).join('\n'):values[field.key]??'';
      group.append(buildInput(field,val,field.placeholder,['answer','values','text'].includes(field.key)&&type==='features'||field.key==='values'||field.key==='answer'));
    }
    row.append(group);
  }
  rowAction(row,container);container.append(row);refreshDirty();
}
function readRows(type){
  return [...$(type).children].map(row=>{
    const value=Object.fromEntries([...row.querySelectorAll('[data-field]')].map(x=>[x.dataset.field,x.value.trim()]));
    if(['card_highlights','features','secondary_keywords'].includes(type))return value.text;
    if(type==='option_groups')return {key:value.key,label:value.label,values:value.values.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)};
    if(type==='price_rules'){
      const when={...JSON.parse(row.dataset.when||'{}'),qty:Number(value.qty)};
      for(const sel of row.querySelectorAll('select[data-option-key]')){
        if(sel.value)when[sel.dataset.optionKey]=sel.value;else delete when[sel.dataset.optionKey];
      }
      return {label:value.label,when,price:Number(value.price)};
    }
    return value;
  });
}
function readOptionsFromRows(){return [...$('option_groups').children].map(row=>{
  const fields=Object.fromEntries([...row.querySelectorAll('[data-field]')].map(x=>[x.dataset.field,x.value.trim()]));
  return {key:fields.key,label:fields.label,values:(fields.values||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)};
}).filter(x=>x.key);}
function renderRuleOptions(row,when){
  const target=row.querySelector('.rule-options');target.replaceChildren();
  for(const group of readOptionsFromRows()){
    const wrap=document.createElement('label');wrap.className='repeat-field';wrap.textContent=group.label||group.key;
    const select=document.createElement('select');select.dataset.optionKey=group.key;
    for(const [value,title] of [['','-- Không xét --'],...group.values.map(v=>[v,v])]){
      const opt=document.createElement('option');opt.value=value;opt.textContent=title;select.append(opt);
    }
    select.value=when[group.key]||'';
    if(!group.values.includes(select.value))select.value='';
    wrap.append(select);target.append(wrap);
  }
  const orphan=Object.keys(when).filter(k=>k!=='qty'&&!readOptionsFromRows().some(g=>g.key===k));
  if(orphan.length){const alert=document.createElement('p');alert.className='small';alert.textContent='⚠ Điều kiện cũ không còn nhóm: '+orphan.join(', ')+'; hãy xóa dòng giá này hoặc khôi phục nhóm để sửa.';target.append(alert);}
}
function refreshRuleOptions(){for(const row of $('price_rules').children){
  const existing=readRows('price_rules')[[...$('price_rules').children].indexOf(row)]?.when||{};
  row.dataset.when=JSON.stringify(existing);renderRuleOptions(row,existing);
}}
function renderRows(data){for(const type of Object.keys(repeatTypes).concat('price_rules')){
  $(type).replaceChildren();const list=type==='secondary_keywords'?data.seo?.secondary_keywords:(data[type]||[]);
  for(const value of list||[])addRepeater(type,value);
}}
function renderRelated(container,items,values,self){
  container.replaceChildren();let found=0;
  for(const item of items){if(item.slug===self)continue;
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=item.slug;check.checked=(values||[]).includes(item.slug);
    const text=document.createTextNode(item.name||item.title||item.slug);
    label.append(check,text);container.append(label);found++;
  }
  if(!found)container.textContent='Chưa có nội dung phù hợp.';
}
function gather(){
  const p=structuredClone(current?.data||productTemplate());
  for(const key of textKeys)p[key]=getValue(key);
  p.image=selectedPath();p.featured=$('featured').checked;p.featured_order=intValue('featured_order');
  p.base_price=p.price_mode==='fixed'?intValue('base_price'):undefined;
  if(p.base_price===undefined)delete p.base_price;
  p.quantity={label:getValue('quantity_label'),unit:getValue('quantity_unit'),min:intValue('quantity_min'),default:intValue('quantity_default'),step:intValue('quantity_step'),hint:getValue('quantity_hint')};
  for(const type of Object.keys(repeatTypes).filter(x=>x!=='secondary_keywords'))p[type]=readRows(type);
  // Switching away from hybrid is explicitly shown as a deleted price table in confirmation.
  p.price_rules=p.price_mode==='hybrid'?readRows('price_rules'):[];
  p.related_products=[...$('related_products').querySelectorAll('input:checked')].map(x=>x.value);
  p.related_articles=[...$('related_articles').querySelectorAll('input:checked')].map(x=>x.value);
  p.seo={...p.seo,title:getValue('seo_title'),description:getValue('seo_description'),focus_keyword:getValue('seo_focus_keyword'),secondary_keywords:readRows('secondary_keywords')};
  return p;
}
function selectedPath(){return $('selectedPath').dataset.path||'';}
function assignPath(path){
  $('selectedPath').dataset.path=path||'';$('selectedPath').textContent=path||'Chưa chọn ảnh';
  $('selectedImage').dataset.fallback='';$('selectedImage').src=imageUrl(path);
  $('selectedImageName').textContent=path?'Xem trước ảnh đang chọn':'Chưa chọn ảnh';
  for(const el of $('mediaGallery').children){el.classList.toggle('selected',el.dataset.path===path);el.setAttribute('aria-pressed',String(el.dataset.path===path));}
  refreshDirty();
}
function renderGallery(){
  const term=$('mediaSearch').value.trim().toLocaleLowerCase('vi');$('mediaGallery').replaceChildren();
  const items=media.filter(m=>m.path.toLocaleLowerCase('vi').includes(term));
  for(const item of items){
    const button=document.createElement('button');button.type='button';button.className='gallery-item';button.dataset.path=item.path;button.setAttribute('aria-pressed',String(item.path===selectedPath()));button.title=item.name;
    if(item.path===selectedPath())button.classList.add('selected');
    const img=document.createElement('img');img.src=imageUrl(item.path);img.alt='Chọn ảnh '+item.name;img.loading='lazy';imgFallback(img);
    const name=document.createElement('small');name.textContent=item.name;button.append(img,name);
    button.addEventListener('click',()=>assignPath(item.path));$('mediaGallery').append(button);
  }
  $('mediaCount').textContent=items.length?`${items.length} ảnh trong thư viện (chọn ảnh trực tiếp)`:'Chưa có ảnh phù hợp. Có thể tải ảnh mới bên dưới.';
}
async function loadMedia(){
  const result=await readJson(MEDIA);media=result.items||[];mediaLoaded=true;
  const used=selectedPath();if(used&&!media.some(x=>x.path===used))media.unshift({name:used.split('/').at(-1),path:used,size:0});
  renderGallery();
}
function setPreviewSaved(product){
  $('savedImage').dataset.fallback='';$('savedImage').src=imageUrl(product.image);$('savedImageName').textContent=product.image||'Chưa có ảnh';
}
function updateCount(){$('seoTitleCount').textContent=`${$('seo_title').value.length}/70`;$('seoDescriptionCount').textContent=`${$('seo_description').value.length}/180`;}
function showProduct(detail,isNew=false){
  current={data:structuredClone(detail.data),filename:detail.filename||null,sha:detail.sha||null};mode=isNew?'create':'update';
  $('editor').hidden=false;$('editorEmpty').hidden=true;
  $('modeBadge').textContent=isNew?'Tạo sản phẩm mới':'Chỉnh sửa sản phẩm';
  $('editorTitle').textContent=isNew?'Tạo sản phẩm mới':'Chỉnh sửa: '+(detail.data.name||detail.filename);
  $('editorSubtitle').textContent=isNew?'Mặc định Bản nháp; điền đủ thông tin trước khi xuất bản.':'Mọi thay đổi phải xác nhận trước khi ghi GitHub.';
  for(const key of textKeys)$(key).value=detail.data[key]??'';
  $('id').readOnly=!isNew;$('id').title=isNew?'Nhập mã nội bộ, không đổi sau khi tạo.':'Mã sản phẩm đã tạo được cố định để bảo vệ đơn hàng.';
  $('featured').checked=detail.data.featured===true;
  $('featured_order').value=detail.data.featured_order??99;
  $('base_price').value=detail.data.base_price??'';
  const q=detail.data.quantity||{};for(const key of ['label','unit','min','default','step','hint'])$('quantity_'+key).value=q[key]??'';
  $('seo_title').value=detail.data.seo?.title||'';$('seo_description').value=detail.data.seo?.description||'';
  $('seo_focus_keyword').value=detail.data.seo?.focus_keyword||'';
  $('viewProduct').hidden=detail.data.status!=='published'||isNew;
  $('viewProduct').href='/san-pham/'+encodeURIComponent(detail.data.slug||'')+'.html';
  $('redirects').replaceChildren();for(const route of detail.data.redirect_from||[]){const item=document.createElement('div');item.textContent=route;$('redirects').append(item);}if(!$('redirects').children.length)$('redirects').textContent='Chưa có URL cũ.';
  setPreviewSaved(detail.data);
  $('uploadImageStatus').textContent='';
  renderRows(detail.data);
  renderRelated($('related_products'),products.filter(x=>x.status==='published'),detail.data.related_products,detail.data.slug);
  renderRelated($('related_articles'),articles.filter(x=>x.status==='published'),detail.data.related_articles,detail.data.slug);
  assignPath(detail.data.image||'');
  imgFallback($('savedImage'));imgFallback($('selectedImage'));
  updatePriceMode();updateCount();updateSlug();
  baseline=JSON.stringify(gather());refreshDirty();renderList();
  if(window.innerWidth<=760)$('editorTitle').scrollIntoView({block:'start'});
}
function confirmDiscard(){return !current||!isDirty()||window.confirm('Có thay đổi chưa lưu. Bỏ thay đổi và chuyển trang/sản phẩm?');}
function isDirty(){return Boolean(current&&baseline&&JSON.stringify(gather())!==baseline);}
function refreshDirty(){if(!current)return;const dirty=isDirty();$('dirtyBadge').hidden=!dirty;$('saveProduct').disabled=busy||!dirty;$('saveState').textContent=dirty?'Có thay đổi chưa lưu':'Chưa có thay đổi';}
function updateSlug(){$('slugPreview').textContent=getValue('slug')?'/san-pham/'+getValue('slug')+'.html':'Nhập đường dẫn để xem trước URL.';}
function updatePriceMode(){const mode=getValue('price_mode');$('fixedPriceField').hidden=mode!=='fixed';$('priceRuleArea').hidden=mode!=='hybrid';$('base_price').required=mode==='fixed';}
function renderList(){const term=$('search').value.trim().toLocaleLowerCase('vi'),filter=$('statusFilter').value;
  const visible=products.filter(x=>(!filter||x.status===filter)&&`${x.name||''} ${x.id||''} ${x.slug||''} ${x.filename||''}`.toLocaleLowerCase('vi').includes(term));
  $('productCount').textContent=`${visible.length}/${products.length} sản phẩm`;$('products').replaceChildren();
  if(!visible.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=products.length?'Không có sản phẩm phù hợp.':'Chưa có sản phẩm. Bấm Tạo sản phẩm.';$('products').append(empty);return;}
  for(const product of visible){
    const row=document.createElement('button');row.type='button';row.className='product-row';if(current?.filename&&current.filename===product.filename)row.classList.add('active');
    const img=document.createElement('img');img.src=imageUrl(product.image);img.alt='';img.loading='lazy';imgFallback(img);
    const info=document.createElement('span');info.className='product-info';
    const name=document.createElement('strong');name.textContent=product.name||product.filename;
    const code=document.createElement('small');code.textContent=(product.id||'')+' · '+(product.slug||product.filename);
    const price=document.createElement('small');price.textContent=product.price_text||'Chưa có giá';
    const badge=document.createElement('span');badge.className='pill '+(product.status||'');badge.textContent=statuses[product.status]||'Chưa rõ';
    info.append(name,code,price,badge);row.append(img,info);
    row.addEventListener('click',()=>openProduct(product));$('products').append(row);
  }
}
async function getDetails(kind){const list=await readJson(CONTENT+'?kind='+kind);return Promise.all(list.items.map(async item=>{
  const d=await readJson(CONTENT+'/item?kind='+kind+'&slug='+encodeURIComponent(item.slug));return {...d.data,filename:item.filename,sha:d.sha};
}));}
async function loadAll(){if(busy||!confirmDiscard())return;setBusy(true);message('Đang tải dữ liệu quản lý sản phẩm…');
  try{
    const [newProducts,newCategories,newArticles]=await Promise.all(['products','categories','articles'].map(getDetails));
    products=newProducts;categories=newCategories;articles=newArticles;
    current=null;baseline='';$('editor').hidden=true;$('editorEmpty').hidden=false;$('editorTitle').textContent='Chỉnh sửa sản phẩm';
    $('category').replaceChildren();const placeholder=new Option('-- Chọn chuyên mục --','');$('category').append(placeholder);
    for(const category of categories.filter(c=>c.status==='published'&&!c.slug.endsWith('-bai-viet')&&c.slug!=='cam-nang-cuoi'))$('category').append(new Option(category.title,category.slug));
    renderList();message('Đã tải '+products.length+' sản phẩm từ GitHub.','success');
  }catch(error){showError(error);}finally{setBusy(false);}
}
async function openProduct(product){if(busy||!confirmDiscard())return;setBusy(true);message('Đang tải sản phẩm…');
  try{
    const slug=product.filename.replace(/\.json$/,'');const detail=await readJson(CONTENT+'/item?kind=products&slug='+encodeURIComponent(slug));
    showProduct(detail);message('');try{await loadMedia();}catch(error){$('mediaCount').textContent='Chưa tải được thư viện: '+error.message;}
  }catch(error){showError(error);}finally{setBusy(false);refreshDirty();}
}
function newProduct(){if(busy||!confirmDiscard())return;showProduct({data:productTemplate(),filename:null,sha:null},true);message('Sản phẩm mới mặc định là Bản nháp. Hãy làm theo các hướng dẫn ngắn.');if(!mediaLoaded)loadMedia().catch(e=>{$('mediaCount').textContent=e.message;});$('name').focus();}
async function uploadImage(){if(busy||!current)return;const file=$('productImageFile').files?.[0];if(!file){$('uploadImageStatus').textContent='Hãy chọn ảnh trước.';return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>900000){$('uploadImageStatus').textContent='Chỉ nhận JPG/PNG/WebP không quá 900 KB.';return;}
  const url=URL.createObjectURL(file);setBusy(true);$('uploadImageStatus').textContent='Đang tải ảnh lên GitHub…';
  try{const form=new FormData();form.append('file',file);
    const result=await readJson(MEDIA,{method:'POST',body:form});
    const path=result.path||result.image?.path||result.file?.path;
    if(!path||!imagePattern.test(path))throw new Error('GitHub đã phản hồi nhưng chưa xác định đường dẫn ảnh. Hãy kiểm tra thư viện trước khi tải lại.');
    localPreviews.set(path,url);mediaLoaded=true;
    if(!media.some(x=>x.path===path))media.unshift({name:path.split('/').at(-1),path,size:file.size});
    renderGallery();assignPath(path);
    $('uploadImageStatus').textContent='Đã tải ảnh lên GitHub. Ảnh có thể chờ Pages triển khai; bấm Lưu để gắn vào sản phẩm.';
    $('productImageFile').value='';
  }catch(error){URL.revokeObjectURL(url);$('uploadImageStatus').textContent=error.message;}finally{setBusy(false);refreshDirty();}
}
function human(value){if(value===undefined||value===null)return '(trống)';if(typeof value==='boolean')return value?'Có':'Không';if(Array.isArray(value))return value.length?`${value.length} mục: ${JSON.stringify(value).slice(0,140)}`:'(trống)';if(typeof value==='object')return JSON.stringify(value).slice(0,200);return String(value).slice(0,220)||'(trống)';}
function presentChanges(oldProduct,newProduct){
  const changes=[];const keys=new Set([...Object.keys(oldProduct||{}),...Object.keys(newProduct)]);
  for(const key of keys)if(!jsonEqual(oldProduct?.[key],newProduct[key])){
    const entry={label:fieldNames[key]||key,old:human(oldProduct?.[key]),next:human(newProduct[key])};
    if(key==='slug'){entry.old='/san-pham/'+(oldProduct?.slug||'(mới)')+'.html';entry.next='/san-pham/'+newProduct.slug+'.html';}
    if(key==='status'){entry.old=statuses[oldProduct?.status]||'(mới)';entry.next=statuses[newProduct.status]||newProduct.status;}
    changes.push(entry);
  }
  return changes;
}
function confirmation(newProduct){
  const old=mode==='create'?null:current.data;
  const list=presentChanges(old,newProduct),container=$('confirmChanges');container.replaceChildren();
  for(const entry of list){const item=document.createElement('div');item.className='diff-item';const label=document.createElement('strong');label.textContent=entry.label;
    const before=document.createElement('span');before.textContent='Trước: '+entry.old;const after=document.createElement('span');after.textContent='Sau: '+entry.next;item.append(label,before,after);container.append(item);}
  $('confirmIntro').textContent=mode==='create'?'Tạo sản phẩm mới: '+newProduct.name+' – '+statuses[newProduct.status]:`Sản phẩm: ${newProduct.name}. Có ${list.length} nhóm dữ liệu thay đổi.`;
  const warning=[];
  if(old?.slug!==newProduct.slug&&old)warning.push('URL cũ sẽ được chuyển hướng 301 sang URL mới sau khi triển khai; liên kết ngoài có thể cần cập nhật.');
  if(old?.status!==newProduct.status){if(newProduct.status==='hidden'||newProduct.status==='draft')warning.push('Sản phẩm sẽ ngừng hiển thị và ngừng nhận đơn mới sau khi website cập nhật.');if(newProduct.status==='published')warning.push('Sản phẩm sẽ hiển thị để khách xem và đặt sau khi website cập nhật.');}
  if(!jsonEqual(old?.quantity,newProduct.quantity)||!jsonEqual(old?.price_rules,newProduct.price_rules)||old?.base_price!==newProduct.base_price||old?.price_mode!==newProduct.price_mode)warning.push('Giá và điều kiện số lượng mới áp dụng cho yêu cầu đặt hàng sau khi triển khai. Đơn hàng cũ giữ nguyên.');
  if(old?.image!==newProduct.image)warning.push('Ảnh mới chỉ được gắn vào sản phẩm khi xác nhận lưu; file ảnh upload đã tồn tại riêng trên GitHub.');
  warning.push('Lưu vào GitHub không đồng nghĩa website đã triển khai thành công. Hãy kiểm tra GitHub Actions và Cloudflare.');
  $('confirmWarning').textContent=warning.join('\n');$('confirmDialog').showModal();
}
async function submitProduct(event){event.preventDefault();if(busy||!current||!isDirty())return;
  if(!$('editor').reportValidity()){message('Hãy nhập các ô có dấu * và kiểm tra định dạng ở ô đang được báo.','error');return;}
  const p=gather();const validation=checkProductPayload(p,mode==='update'?current.data:null);
  if(!validation.valid){showError({message:'Vui lòng hoàn thiện thông tin trước khi lưu.',fields:validation.errors});return;}
  const payload={mode,product:p,...(mode==='update'?{filename:current.filename,sha:current.sha}:{})};
  setBusy(true);message('Đang kiểm tra dữ liệu và liên kết trên GitHub…');
  try{const checked=await readJson(SAVE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,dry_run:true})});
    pendingPayload={...payload,product:checked.product};message('Dữ liệu hợp lệ. Hãy xem và xác nhận những thay đổi.');confirmation(checked.product);
  }catch(error){showError(error);}finally{setBusy(false);refreshDirty();}
}
async function persist(){if(!pendingPayload||busy)return;const payload=pendingPayload;pendingPayload=null;$('confirmDialog').close();setBusy(true);message('Đang ghi dữ liệu vào GitHub…');
  try{const result=await readJson(SAVE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,confirm_write:true})});
    if(!result.saved){message(result.message||'Không có thay đổi cần lưu.','warning');return;}
    const oldFile=current?.filename;
    showProduct({data:result.product,filename:result.filename,sha:result.sha},false);
    const index=products.findIndex(x=>x.filename===oldFile&&oldFile);
    const updated={...result.product,filename:result.filename,sha:result.sha};
    if(index>=0)products[index]=updated;else products.push(updated);
    current={data:structuredClone(result.product),filename:result.filename,sha:result.sha};
    baseline=JSON.stringify(gather());renderList();refreshDirty();
    message('ĐÃ LƯU GITHUB. Đang chờ GitHub Actions và Cloudflare. Chỉ sau khi triển khai xong nội dung mới xuất hiện trên website.','success');
    if(!result.sha)message('Đã lưu GitHub, nhưng chưa nhận SHA. Hãy tải lại và kiểm tra trước khi sửa tiếp.','warning');
  }catch(error){showError(error);if(error.status!==400&&error.status!==409)message('Chưa xác minh được trạng thái ghi GitHub. Hãy tải lại và kiểm tra sản phẩm trước khi bấm Lưu lần nữa.\n'+error.message,'warning');}
  finally{setBusy(false);refreshDirty();}
}
function restore(){if(!current||busy||!isDirty())return;if(!window.confirm('Khôi phục dữ liệu về bản đang lưu? Mọi chỉnh sửa chưa lưu sẽ mất.'))return;
  showProduct({data:current.data,filename:current.filename,sha:current.sha},mode==='create');message('Đã khôi phục dữ liệu đang mở.');}
$('newProduct').addEventListener('click',newProduct);$('reloadProducts').addEventListener('click',loadAll);
$('search').addEventListener('input',renderList);$('statusFilter').addEventListener('change',renderList);
$('refreshMedia').addEventListener('click',()=>loadMedia().catch(showError));$('mediaSearch').addEventListener('input',renderGallery);
$('uploadProductImage').addEventListener('click',uploadImage);$('resetImage').addEventListener('click',()=>{if(current)assignPath(current.data.image||'');});
$('copyImagePath').addEventListener('click',()=>{if(selectedPath())navigator.clipboard?.writeText(selectedPath()).then(()=>message('Đã sao chép đường dẫn ảnh.')).catch(()=>message('Hãy chọn và sao chép đường dẫn bằng tay.','warning'));});
$('discardChanges').addEventListener('click',restore);$('editor').addEventListener('submit',submitProduct);
$('cancelSave').addEventListener('click',()=>{pendingPayload=null;$('confirmDialog').close();});$('confirmSave').addEventListener('click',persist);
$('confirmDialog').addEventListener('cancel',()=>{pendingPayload=null;});
for(const button of document.querySelectorAll('[data-add]'))button.addEventListener('click',()=>addRepeater(button.dataset.add));
$('option_groups').addEventListener('change',refreshRuleOptions);
$('editor').addEventListener('input',event=>{if(!current)return;if(event.target.id==='slug')updateSlug();if(['seo_title','seo_description'].includes(event.target.id))updateCount();refreshDirty();});
$('editor').addEventListener('change',event=>{if(event.target.id==='price_mode')updatePriceMode();if(event.target.id==='status')$('viewProduct').hidden=getValue('status')!=='published'||mode==='create';refreshDirty();});
window.addEventListener('beforeunload',event=>{if(!isDirty())return;event.preventDefault();event.returnValue='';});
loadAll();
