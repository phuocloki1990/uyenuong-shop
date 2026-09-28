(() => {
  'use strict';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const pageData = (() => { try { return JSON.parse($('#admin-page-data')?.textContent || '{}'); } catch { return {}; } })();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selectedValues = select => [...select.selectedOptions].map(o => o.value);
  const querySlug = () => new URLSearchParams(location.search).get('slug') || '';

  function toast(message, type='ok') {
    const el = $('.admin-toast'); if (!el) return;
    el.textContent = message; el.hidden = false; el.className = `admin-toast${type==='error'?' error':''}`;
    clearTimeout(toast.timer); toast.timer = setTimeout(()=>{el.hidden=true;},3500);
  }
  async function requestJson(url, options={}) {
    const response = await fetch(url, { cache:'no-store', ...options });
    let data = null; try { data = await response.json(); } catch {}
    if (!response.ok || data?.success === false) throw Object.assign(new Error(data?.message || `Yêu cầu thất bại (${response.status}).`), data || {});
    if (data?.publish_version) markPublishPending(data.publish_version);
    return data || {};
  }
  function slugify(value) {
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
  }
  function normalizeFilename(name) {
    const dot = name.lastIndexOf('.'); const ext = dot>=0 ? name.slice(dot).toLowerCase() : '';
    const base = dot>=0 ? name.slice(0,dot) : name;
    return `${slugify(base) || 'anh'}${ext}`;
  }
  function setPublishStatus(state, text) {
    const el = $('[data-publish-status]'); if (!el) return;
    el.textContent = text; el.className = `site-status ${state || ''}`.trim();
  }
  let pendingVersion = '';
  let publishTimer = null;
  async function refreshPublishStatus(version=pendingVersion) {
    if (!$('[data-publish-status]')) return;
    try {
      const query = version ? `?version=${encodeURIComponent(version)}` : '';
      const result = await requestJson(`/admin/api/v2/publish-status${query}`);
      if (result.state === 'success') { pendingVersion=''; setPublishStatus('success','Website đã cập nhật'); return; }
      if (result.state === 'failed') { setPublishStatus('error','Cập nhật website gặp lỗi'); return; }
      if (result.state === 'pending') { setPublishStatus('pending','Đang cập nhật website…'); schedulePublishRefresh(); return; }
      setPublishStatus('unknown','Chưa kiểm tra được cập nhật');
    } catch {
      setPublishStatus('unknown','Chưa kiểm tra được cập nhật');
    }
  }
  function schedulePublishRefresh() {
    clearTimeout(publishTimer);
    publishTimer = setTimeout(()=>refreshPublishStatus(), 4500);
  }
  function markPublishPending(version='') {
    if (version) pendingVersion = version;
    setPublishStatus('pending','Đang cập nhật website…');
    schedulePublishRefresh();
  }

  function expectedMediaName(file) {
    const ext = file?.type === 'image/png' ? '.png' : file?.type === 'image/webp' ? '.webp' : '.jpg';
    const raw = String(file?.name || 'anh');
    const dot = raw.lastIndexOf('.');
    const base = dot >= 0 ? raw.slice(0,dot) : raw;
    return `${slugify(base) || 'anh'}${ext}`;
  }
  const formatKb = bytes => `${Math.max(1,Math.round(Number(bytes||0)/1024))} KB`;
  async function loadBitmap(file) {
    if ('createImageBitmap' in window) return createImageBitmap(file);
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file), image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Không thể đọc ảnh để tối ưu.'))};
      image.src=url;
    });
  }
  async function canvasBlob(bitmap,maxSide,quality) {
    const width=bitmap.width||bitmap.naturalWidth, height=bitmap.height||bitmap.naturalHeight;
    const scale=Math.min(1,maxSide/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  }
  async function optimizeImageFile(file) {
    if (!file || file.size <= 900000) return { file, optimized:false };
    let bitmap;
    try { bitmap=await loadBitmap(file); }
    catch { return { file, optimized:false }; }
    try {
      const base=slugify(file.name.replace(/\.[^.]+$/,''))||'anh';
      for (const maxSide of [1800,1500,1200,1000]) {
        for (const quality of [0.86,0.78,0.70,0.62]) {
          const blob=await canvasBlob(bitmap,maxSide,quality);
          if (blob && blob.size <= 900000) return { file:new File([blob],`${base}.webp`,{type:'image/webp'}), optimized:true, originalSize:file.size };
        }
      }
      return { file, optimized:false };
    } finally { if (bitmap?.close) bitmap.close(); }
  }

  function setFormValue(form, name, value) { const el = form.elements[name]; if (!el) return; if (el.type==='checkbox') el.checked=Boolean(value); else el.value=value ?? ''; }
  function syncMulti(select, values=[]) { const set=new Set(values); [...select.options].forEach(o=>o.selected=set.has(o.value)); }

  const menuBtn = $('[data-admin-menu]');
  if (menuBtn) menuBtn.addEventListener('click', () => { const side=$('#admin-sidebar'); const open=!side.classList.contains('open'); side.classList.toggle('open',open); menuBtn.setAttribute('aria-expanded',String(open)); });
  if ($('[data-publish-status]')) refreshPublishStatus();

  function initListFilters() {
    const body = $('[data-list-body]'); if (!body) return;
    const search=$('[data-list-search]'), status=$('[data-list-status]'), type=$('[data-list-type]'), empty=$('[data-list-empty]');
    const run=()=>{ let shown=0; $$('tr',body).forEach(row=>{ const okSearch=!search?.value || row.dataset.search.includes(search.value.toLowerCase().trim()); const okStatus=!status?.value || row.dataset.status===status.value; const okType=!type?.value || row.dataset.type===type.value; const show=okSearch&&okStatus&&okType; row.hidden=!show; if(show)shown++; }); if(empty)empty.hidden=shown>0; };
    search?.addEventListener('input',run); status?.addEventListener('change',run); type?.addEventListener('change',run);
  }

  async function toggleHidden(button) {
    const kind=button.dataset.kind, slug=button.dataset.slug, current=button.dataset.status;
    const next=current==='hidden'?'published':'hidden';
    try {
      button.disabled=true;
      const item=await requestJson(`/admin/api/v2/content?kind=${encodeURIComponent(kind)}&slug=${encodeURIComponent(slug)}`);
      const data=structuredClone(item.data); data.status=next;
      await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,slug,sha:item.sha,data,confirm_write:true})});
      toast(next==='hidden'?'Đã ẩn nội dung.':'Đã bật hiển thị.'); setTimeout(()=>location.reload(),450);
    } catch(error) { toast(error.message,'error'); button.disabled=false; }
  }
  $$('[data-hide-item]').forEach(btn=>btn.addEventListener('click',()=>toggleHidden(btn)));

  function optionGroupCard(group={id:'',name:'',type:'single_select',required:true,options:[]}) {
    const options=(group.options||[]).map(o=>`<div class="mini-row option-row"><input data-opt-id placeholder="id" value="${esc(o.id)}"><input data-opt-label placeholder="Tên lựa chọn" value="${esc(o.label)}"><label class="check-row"><input type="radio" data-opt-default name="default-${Math.random()}" ${o.default?'checked':''}> Mặc định</label><label class="check-row"><input type="checkbox" data-opt-custom ${o.allow_custom_text?'checked':''}> Khác</label><button type="button" class="remove" data-remove-row>×</button></div>`).join('');
    return `<div class="repeat-card option-group-card"><div class="repeat-head"><strong>Nhóm lựa chọn</strong><button type="button" class="remove" data-remove-card>Xóa nhóm</button></div><div class="form-grid two"><label>Tên nhóm<input data-group-name value="${esc(group.name)}"></label><label>ID nhóm<input data-group-id value="${esc(group.id)}"></label></div><label class="check-row"><input type="checkbox" data-group-required ${group.required!==false?'checked':''}> Bắt buộc chọn</label><div class="mini-list" data-option-list>${options}</div><button type="button" class="button button-secondary button-small" data-add-option>+ Thêm lựa chọn</button></div>`;
  }
  function componentCard(item={id:'',label:'',allow_custom_text:false}) {
    const sub=item.sub_option; const lines=sub?.options?.map(o=>`${o.id}|${o.label}${o.default?'|default':''}`).join('\n')||'';
    return `<div class="repeat-card component-card"><div class="repeat-head"><strong>Lễ vật</strong><button type="button" class="remove" data-remove-card>Xóa</button></div><div class="form-grid two"><label>Tên hiển thị<input data-component-label value="${esc(item.label)}"></label><label>ID<input data-component-id value="${esc(item.id)}"></label></div><label class="check-row"><input type="checkbox" data-component-custom ${item.allow_custom_text?'checked':''}> Cho khách nhập nội dung khác</label><label>Placeholder khi nhập khác<input data-component-placeholder value="${esc(item.custom_placeholder||'')}"></label><label class="check-row"><input type="checkbox" data-sub-enabled ${sub?'checked':''}> Có lựa chọn phụ</label><div data-sub-fields ${sub?'':'hidden'}><label>Tên lựa chọn phụ<input data-sub-name value="${esc(sub?.name||'Quy cách')}"></label><label>Các lựa chọn <span class="hint">Mỗi dòng: id|Tên|default (nếu mặc định)</span><textarea data-sub-options rows="3">${esc(lines)}</textarea></label></div></div>`;
  }
  function infoCard(block={title:'',description:''}) { return `<div class="repeat-card info-card"><div class="repeat-head"><strong>Mục thông tin</strong><button type="button" class="remove" data-remove-card>Xóa</button></div><label>Tiêu đề<input data-info-title value="${esc(block.title)}"></label><label>Mô tả<textarea rows="2" data-info-description>${esc(block.description)}</textarea></label></div>`; }

  function wireRepeatActions(root) {
    root.addEventListener('click', event=>{
      const removeCard=event.target.closest('[data-remove-card]'); if(removeCard){removeCard.closest('.repeat-card')?.remove(); return;}
      const removeRow=event.target.closest('[data-remove-row]'); if(removeRow){removeRow.closest('.mini-row')?.remove(); return;}
      const addOption=event.target.closest('[data-add-option]'); if(addOption){ const list=addOption.closest('.option-group-card').querySelector('[data-option-list]'); list.insertAdjacentHTML('beforeend',`<div class="mini-row option-row"><input data-opt-id placeholder="id"><input data-opt-label placeholder="Tên lựa chọn"><label class="check-row"><input type="radio" data-opt-default name="default-${Date.now()}"> Mặc định</label><label class="check-row"><input type="checkbox" data-opt-custom> Khác</label><button type="button" class="remove" data-remove-row>×</button></div>`); }
    });
    root.addEventListener('change',event=>{ if(event.target.matches('[data-sub-enabled]')){ const fields=event.target.closest('.component-card').querySelector('[data-sub-fields]'); fields.hidden=!event.target.checked; } });
  }

  function initProductEditor() {
    const form=$('[data-product-editor]'); if(!form) return;
    const optionRoot=$('[data-option-groups]'), compRoot=$('[data-components]'), infoRoot=$('[data-info-blocks]');
    wireRepeatActions(form);
    $('[data-add-option-group]')?.addEventListener('click',()=>optionRoot.insertAdjacentHTML('beforeend',optionGroupCard()));
    $('[data-add-component]')?.addEventListener('click',()=>compRoot.insertAdjacentHTML('beforeend',componentCard()));
    $('[data-add-info]')?.addEventListener('click',()=>infoRoot.insertAdjacentHTML('beforeend',infoCard()));
    let currentSha=null, existingSlug=querySlug(), loaded=structuredClone(pageData.blank||{});

    function renderCollections(data){ optionRoot.innerHTML=(data.option_groups||[]).map(optionGroupCard).join(''); compRoot.innerHTML=(data.components||[]).map(componentCard).join(''); infoRoot.innerHTML=(data.info_blocks||[]).map(infoCard).join(''); }
    function apply(data){ loaded=structuredClone(data); setFormValue(form,'name',data.name); setFormValue(form,'slug',data.slug); setFormValue(form,'short_description',data.short_description); setFormValue(form,'type',data.type); setFormValue(form,'status',data.status); setFormValue(form,'main_image',data.main_image); setFormValue(form,'gallery',(data.gallery||[]).join('\n')); setFormValue(form,'price_display',data.price?.display_text||'Giá liên hệ'); $$('input[name=price_mode]',form).forEach(r=>r.checked=r.value===(data.price?.mode||'contact')); setFormValue(form,'price_amount',data.price?.amount||''); setFormValue(form,'quantity_enabled',data.quantity?.enabled); setFormValue(form,'quantity_default',data.quantity?.default_value||1); setFormValue(form,'quantity_min',data.quantity?.min_value||1); setFormValue(form,'quantity_step',data.quantity?.step||1); setFormValue(form,'quantity_unit',data.quantity?.unit||''); setFormValue(form,'receive_date_enabled',data.receive_date?.enabled); setFormValue(form,'receive_date_label',data.receive_date?.label||'Ngày nhận mâm quả'); setFormValue(form,'seo_title',data.seo?.title); setFormValue(form,'seo_description',data.seo?.description); syncMulti(form.elements.related_products,data.related_products); syncMulti(form.elements.related_articles,data.related_articles); renderCollections(data); $('.media-field img').src=data.main_image; updateType(); updatePrice(); updateUrl(); }
    function updateType(){ const type=form.elements.type.value; $('[data-variant-section]').hidden=type!=='variant'; $('[data-composite-section]').hidden=type!=='composite'; $('[data-quantity-section]').hidden=type==='composite'; }
    function updatePrice(){ const fixed=$$('input[name=price_mode]',form).find(r=>r.checked)?.value==='fixed'; $('[data-fixed-price]').hidden=!fixed; }
    function updateUrl(){ const slug=form.elements.slug.value.trim()||'ten-san-pham'; $('[data-product-url]').textContent=`/${slug}/`; }
    form.elements.type.addEventListener('change',updateType); $$('input[name=price_mode]',form).forEach(r=>r.addEventListener('change',updatePrice)); form.elements.slug.addEventListener('input',updateUrl); form.elements.name.addEventListener('input',()=>{ if(!existingSlug&&!form.elements.slug.dataset.touched) form.elements.slug.value=slugify(form.elements.name.value); updateUrl(); }); form.elements.slug.addEventListener('input',()=>form.elements.slug.dataset.touched='1'); form.elements.main_image.addEventListener('input',()=>{$('.media-field img').src=form.elements.main_image.value||'/assets/images/products/banh-phu-the.jpg';});

    function collectOptions(){ return $$('.option-group-card',optionRoot).map((card,gIndex)=>{ const rows=$$('.option-row',card); const defaults=rows.filter(r=>$('[data-opt-default]',r).checked); return {id:slugify($('[data-group-id]',card).value||`nhom-${gIndex+1}`),name:$('[data-group-name]',card).value.trim()||`Nhóm ${gIndex+1}`,type:'single_select',required:$('[data-group-required]',card).checked,options:rows.map((row,i)=>{ const custom=$('[data-opt-custom]',row).checked; const o={id:slugify($('[data-opt-id]',row).value||`lua-chon-${i+1}`),label:$('[data-opt-label]',row).value.trim()||`Lựa chọn ${i+1}`}; if(defaults.length&&$('[data-opt-default]',row).checked)o.default=true; if(custom){o.allow_custom_text=true;o.custom_placeholder='Nhập lựa chọn khác…';} return o;})}; }); }
    function parseSubOptions(text){ return String(text||'').split('\n').map(x=>x.trim()).filter(Boolean).map((line,i)=>{const [id,label,flag]=line.split('|').map(x=>x?.trim());const o={id:slugify(id||`lua-chon-${i+1}`),label:label||id||`Lựa chọn ${i+1}`};if(flag==='default')o.default=true;return o;}); }
    function collectComponents(){ return $$('.component-card',compRoot).map((card,i)=>{ const id=slugify($('[data-component-id]',card).value||`le-vat-${i+1}`); const item={id,label:$('[data-component-label]',card).value.trim()||`Lễ vật ${i+1}`}; if($('[data-component-custom]',card).checked){item.allow_custom_text=true;item.custom_placeholder=$('[data-component-placeholder]',card).value.trim()||'Ghi rõ lễ vật khác…';} if($('[data-sub-enabled]',card).checked){const options=parseSubOptions($('[data-sub-options]',card).value); if(options.length)item.sub_option={id:`${id}-option`,name:$('[data-sub-name]',card).value.trim()||'Quy cách',type:'single_select',required:true,options};} return item; }); }
    function collect(){ const type=form.elements.type.value, mode=$$('input[name=price_mode]',form).find(r=>r.checked)?.value||'contact'; const data={...structuredClone(loaded),id:loaded.id||existingSlug||slugify(form.elements.slug.value),name:form.elements.name.value.trim(),slug:form.elements.slug.value.trim(),status:form.elements.status.value,type,main_image:form.elements.main_image.value.trim(),gallery:form.elements.gallery.value.split('\n').map(x=>x.trim()).filter(Boolean),short_description:form.elements.short_description.value.trim(),price:{mode,display_text:form.elements.price_display.value.trim()||'Giá liên hệ'},quantity:{},note:loaded.note||{enabled:true,label:'Ghi chú',placeholder:'Yêu cầu thêm cho Shop…'},info_blocks:$$('.info-card',infoRoot).map(card=>({title:$('[data-info-title]',card).value.trim(),description:$('[data-info-description]',card).value.trim()})).filter(x=>x.title&&x.description),related_products:selectedValues(form.elements.related_products).filter(x=>x!==(loaded.id||existingSlug||form.elements.slug.value)),related_articles:selectedValues(form.elements.related_articles),seo:{title:form.elements.seo_title.value.trim(),description:form.elements.seo_description.value.trim()}}; if(mode==='fixed')data.price.amount=Number(form.elements.price_amount.value||0); if(type==='composite'){data.quantity={enabled:false,derived_from:'selected_components',unit:'mâm'};data.components=collectComponents();data.receive_date={enabled:form.elements.receive_date_enabled.checked,label:form.elements.receive_date_label.value.trim()||'Ngày nhận',carry_to_checkout:true,checkout_is_final:true};delete data.option_groups;}else{data.quantity={enabled:form.elements.quantity_enabled.checked,label:'Số lượng',default_value:Number(form.elements.quantity_default.value||1),min_value:Number(form.elements.quantity_min.value||1),step:Number(form.elements.quantity_step.value||1),unit:form.elements.quantity_unit.value.trim()}; if(type==='variant')data.option_groups=collectOptions();else delete data.option_groups; delete data.components;delete data.receive_date;} return data; }
    async function save(forceDraft=false){ const data=collect(); if(forceDraft)data.status='draft'; if(!data.slug||!data.name||!data.short_description){toast('Vui lòng nhập đủ tên, slug và mô tả ngắn.','error');return;} try{const result=await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'products',slug:existingSlug||data.id,sha:currentSha,data,confirm_write:true})});currentSha=result.sha||currentSha; existingSlug=existingSlug||data.id;toast(forceDraft?'Đã lưu bản nháp.':'Đã lưu sản phẩm.'); if(!querySlug()) history.replaceState(null,'',`?slug=${encodeURIComponent(existingSlug)}`);}catch(error){toast(error.message,'error');}}
    form.addEventListener('submit',e=>{e.preventDefault();save(false);}); $('[data-save-draft]')?.addEventListener('click',()=>save(true)); $('[data-preview-product]')?.addEventListener('click',()=>{const slug=form.elements.slug.value.trim(); if(slug)window.open(`/${slug}/`,'_blank');});
    apply(loaded);
    if(existingSlug) requestJson(`/admin/api/v2/content?kind=products&slug=${encodeURIComponent(existingSlug)}`).then(result=>{currentSha=result.sha;apply(result.data);}).catch(e=>toast(e.message,'error'));
  }

  function blockCard(block={type:'paragraph',text:''}) { const type=block.type||'paragraph'; let field=''; if(type==='list')field=`<label>Mỗi dòng một mục<textarea data-block-items rows="4">${esc((block.items||[]).join('\n'))}</textarea></label>`; else if(type==='image')field=`<label>Đường dẫn ảnh<input data-block-src value="${esc(block.src||'')}"></label><label>Alt<input data-block-alt value="${esc(block.alt||'')}"></label><label>Chú thích<input data-block-caption value="${esc(block.caption||'')}"></label>`; else field=`<label>Nội dung<textarea data-block-text rows="${type==='paragraph'?4:2}">${esc(block.text||'')}</textarea></label>`; return `<div class="article-block" data-block-type="${esc(type)}"><div class="article-block-head"><strong>${esc({paragraph:'Đoạn văn',h2:'H2',h3:'H3',list:'Danh sách',image:'Ảnh',callout:'Callout'}[type]||type)}</strong><button type="button" class="remove" data-remove-block>Xóa</button></div>${field}</div>`; }
  function initArticleEditor(){ const form=$('[data-article-editor]'); if(!form)return; const root=$('[data-article-blocks]'); let currentSha=null,existingSlug=querySlug(),loaded=structuredClone(pageData.blank||{}); const render=data=>{loaded=structuredClone(data);setFormValue(form,'title',data.title);setFormValue(form,'slug',data.slug);setFormValue(form,'category',data.category);setFormValue(form,'excerpt',data.excerpt);setFormValue(form,'cover_src',data.cover?.src);setFormValue(form,'cover_alt',data.cover?.alt);setFormValue(form,'status',data.status);setFormValue(form,'featured',data.featured);setFormValue(form,'featured_order',data.featured_order);setFormValue(form,'seo_title',data.seo?.title);setFormValue(form,'seo_description',data.seo?.description);syncMulti(form.elements.related_products,data.related_products);syncMulti(form.elements.related_articles,data.related_articles);root.innerHTML=(data.blocks||[]).map(blockCard).join(''); $('[data-cover-preview]').src=data.cover?.src||'/assets/images/articles/mam-qua-cuoi-thuong-co-nhung-gi.jpg';updateUrl();}; const updateUrl=()=>{$('[data-article-url]').textContent=`/cam-nang/${form.elements.slug.value.trim()||'ten-bai-viet'}/`;}; form.elements.title.addEventListener('input',()=>{if(!existingSlug&&!form.elements.slug.dataset.touched)form.elements.slug.value=slugify(form.elements.title.value);updateUrl();});form.elements.slug.addEventListener('input',()=>{form.elements.slug.dataset.touched='1';updateUrl();});form.elements.cover_src.addEventListener('input',()=>{$('[data-cover-preview]').src=form.elements.cover_src.value||'/assets/images/articles/mam-qua-cuoi-thuong-co-nhung-gi.jpg';}); $$('[data-add-block]').forEach(btn=>btn.addEventListener('click',()=>root.insertAdjacentHTML('beforeend',blockCard({type:btn.dataset.addBlock,text:''}))));root.addEventListener('click',e=>{if(e.target.closest('[data-remove-block]'))e.target.closest('.article-block')?.remove();}); const collectBlocks=()=>$$('.article-block',root).map(el=>{const type=el.dataset.blockType;if(type==='list')return{type,items:$('[data-block-items]',el).value.split('\n').map(x=>x.trim()).filter(Boolean)};if(type==='image')return{type,src:$('[data-block-src]',el).value.trim(),alt:$('[data-block-alt]',el).value.trim(),caption:$('[data-block-caption]',el).value.trim()};return{type,text:$('[data-block-text]',el).value.trim()};}).filter(b=>b.type==='list'?b.items.length:b.type==='image'?b.src&&b.alt:b.text); const collect=()=>({...structuredClone(loaded),id:loaded.id||existingSlug||slugify(form.elements.slug.value),title:form.elements.title.value.trim(),slug:form.elements.slug.value.trim(),category:form.elements.category.value,status:form.elements.status.value,featured:form.elements.featured.checked,featured_order:Number(form.elements.featured_order.value||0),cover:{src:form.elements.cover_src.value.trim(),alt:form.elements.cover_alt.value.trim()},excerpt:form.elements.excerpt.value.trim(),blocks:collectBlocks(),related_products:selectedValues(form.elements.related_products),related_articles:selectedValues(form.elements.related_articles).filter(x=>x!==(loaded.id||existingSlug||form.elements.slug.value)),seo:{title:form.elements.seo_title.value.trim(),description:form.elements.seo_description.value.trim()}}); async function save(forceDraft=false){const data=collect();if(forceDraft)data.status='draft';try{const result=await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'articles',slug:existingSlug||data.id,sha:currentSha,data,confirm_write:true})});currentSha=result.sha||currentSha;existingSlug=existingSlug||data.id;toast(forceDraft?'Đã lưu bản nháp.':'Đã lưu bài viết.');if(!querySlug())history.replaceState(null,'',`?slug=${encodeURIComponent(existingSlug)}`);}catch(e){toast(e.message,'error');}} form.addEventListener('submit',e=>{e.preventDefault();save(false)});$('[data-save-article-draft]')?.addEventListener('click',()=>save(true));$('[data-preview-article]')?.addEventListener('click',()=>{const slug=form.elements.slug.value.trim();if(slug)window.open(`/cam-nang/${slug}/`,'_blank')});render(loaded);if(existingSlug)requestJson(`/admin/api/v2/content?kind=articles&slug=${encodeURIComponent(existingSlug)}`).then(r=>{currentSha=r.sha;render(r.data)}).catch(e=>toast(e.message,'error')); }

  function initCategories(){ const form=$('[data-category-editor]'); if(!form)return; let selectedSlug='',loadedCategory=null; const clear=()=>{selectedSlug='';loadedCategory=null;form.reset();form.elements.sha.value='';}; async function load(slug){try{const r=await requestJson(`/admin/api/v2/content?kind=categories&slug=${encodeURIComponent(slug)}`);selectedSlug=slug;loadedCategory=structuredClone(r.data);setFormValue(form,'sha',r.sha);setFormValue(form,'name',r.data.name);setFormValue(form,'slug',r.data.slug);setFormValue(form,'description',r.data.description);setFormValue(form,'status',r.data.status);setFormValue(form,'public_hub',r.data.public_hub);}catch(e){toast(e.message,'error')}} $$('[data-category-row]').forEach(btn=>btn.addEventListener('click',()=>load(btn.dataset.slug)));$('[data-new-category]')?.addEventListener('click',clear);$('[data-category-reset]')?.addEventListener('click',clear);$('[data-category-search]')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();$$('[data-category-row]').forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(q));});form.elements.name.addEventListener('input',()=>{if(!selectedSlug&&!form.elements.slug.dataset.touched)form.elements.slug.value=slugify(form.elements.name.value)});form.elements.slug.addEventListener('input',()=>form.elements.slug.dataset.touched='1');form.addEventListener('submit',async e=>{e.preventDefault();const slug=form.elements.slug.value.trim();const data={...(loadedCategory||{}),id:loadedCategory?.id||selectedSlug||slug,previous_slugs:loadedCategory?.previous_slugs||[],name:form.elements.name.value.trim(),slug,status:form.elements.status.value,description:form.elements.description.value.trim(),public_hub:form.elements.public_hub.checked};try{await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'categories',slug:selectedSlug||data.id,sha:form.elements.sha.value||null,data,confirm_write:true})});toast('Đã lưu chuyên mục.');setTimeout(()=>location.reload(),450);}catch(err){toast(err.message,'error')}});clear(); }

  function initSettings(){const form=$('[data-settings-editor]');if(!form)return;let sha=null;requestJson('/admin/api/v2/content?kind=settings&slug=site').then(r=>sha=r.sha).catch(()=>{});const updatePreview=()=>{$('[data-seo-preview-title]').textContent=form.elements.seo_title.value;$('[data-seo-preview-description]').textContent=form.elements.seo_description.value};form.elements.seo_title.addEventListener('input',updatePreview);form.elements.seo_description.addEventListener('input',updatePreview);form.addEventListener('submit',async e=>{e.preventDefault();const base=pageData.site||{};const data={...structuredClone(base),name:form.elements.name.value.trim(),address:form.elements.address.value.trim(),hotline:form.elements.hotline.value.trim(),hotline_display:form.elements.hotline_display.value.trim(),zalo:form.elements.zalo.value.trim(),fanpages:[{label:'Mâm quả cưới HCM',url:form.elements.fanpage_1.value.trim()},{label:'Bánh phục linh HCM',url:form.elements.fanpage_2.value.trim()}],seo:{title:form.elements.seo_title.value.trim(),description:form.elements.seo_description.value.trim()}};try{const r=await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'settings',slug:'site',sha,data,confirm_write:true})});sha=r.sha||sha;toast('Đã lưu cài đặt cửa hàng.');}catch(err){toast(err.message,'error')}});}

  function mediaCard(item){return `<article class="media-card" data-media-card data-group="${esc(item.group)}" data-name="${esc((item.name||'').toLowerCase())}" data-search="${esc((item.name||'').toLowerCase())}"><img src="${esc(item.url)}" alt=""><div><strong>${esc(item.name)}</strong><small>${esc(item.group_label||item.group)}${Number.isFinite(item.usage_count)?` · Đang dùng ${item.usage_count} nơi`:''}${item.size?` · ${formatKb(item.size)}`:''}</small></div></article>`;}
  function initMedia(){
    const form=$('[data-media-upload]');if(!form)return;
    const file=form.elements.file,preview=$('[data-upload-preview]'),grid=$('[data-media-grid]'),empty=$('[data-media-empty]'),search=$('[data-media-search]'),filter=$('[data-media-filter]'),duplicate=$('[data-media-duplicate]'),submit=$('[data-media-submit]');
    let mediaItems=[];
    function localFilter(){let shown=0;$$('[data-media-card]',grid).forEach(c=>{const ok=(!search.value||c.dataset.search.includes(search.value.toLowerCase()))&&(!filter.value||c.dataset.group===filter.value);c.hidden=!ok;if(ok)shown++});empty.hidden=shown>0;}
    function duplicateFor(candidate,group){const name=expectedMediaName(candidate).toLowerCase();return mediaItems.find(item=>item.group===group&&String(item.name||'').toLowerCase()===name)||null;}
    function showDuplicate(candidate){
      const dup=candidate?duplicateFor(candidate,form.elements.group.value):null;
      if(!duplicate)return dup;
      duplicate.hidden=!dup;
      duplicate.textContent=dup?`Tên ảnh ${dup.name} đã có trong nhóm này. Hãy đổi tên file trước khi tải.`:'';
      if(submit)submit.disabled=Boolean(dup);
      return dup;
    }
    async function refresh(){try{const r=await requestJson('/admin/api/v2/media');mediaItems=r.items||[];grid.innerHTML=mediaItems.map(mediaCard).join('');localFilter();showDuplicate(file.files?.[0]);}catch(e){toast(e.message,'error')}}
    file.addEventListener('change',()=>{const f=file.files?.[0];if(!f){preview.hidden=true;showDuplicate(null);return}preview.hidden=false;$('img',preview).src=URL.createObjectURL(f);$('[data-original-name]').textContent=f.name;$('[data-normalized-name]').textContent=expectedMediaName(f);$('[data-optimized-size]').textContent=f.size>900000?'Ảnh sẽ được tối ưu trước khi tải.':formatKb(f.size);showDuplicate(f);});
    form.elements.group.addEventListener('change',()=>showDuplicate(file.files?.[0]));
    search.addEventListener('input',localFilter);filter.addEventListener('change',localFilter);$('[data-refresh-media]')?.addEventListener('click',refresh);
    form.addEventListener('submit',async e=>{
      e.preventDefault();const original=file.files?.[0];if(!original)return toast('Vui lòng chọn ảnh.','error');
      if(showDuplicate(original))return toast('Ảnh có tên trùng trong nhóm này. Vui lòng đổi tên file.','error');
      if(submit)submit.disabled=true;
      try{
        const prepared=await optimizeImageFile(original);const upload=prepared.file;
        if(upload.size>900000)throw new Error('Ảnh vẫn lớn hơn 900 KB sau khi tối ưu. Vui lòng chọn ảnh nhỏ hơn.');
        if(showDuplicate(upload))throw new Error('Tên ảnh sau khi tối ưu bị trùng trong nhóm này. Vui lòng đổi tên file.');
        const fd=new FormData();fd.append('file',upload);fd.append('group',form.elements.group.value);fd.append('alt',form.elements.alt.value.trim());
        const r=await requestJson('/admin/api/v2/media',{method:'POST',body:fd});
        toast(prepared.optimized?`Đã tối ưu ${formatKb(prepared.originalSize)} → ${formatKb(upload.size)} và tải ảnh lên.`:`Đã tải ảnh: ${r.url}`);
        form.reset();preview.hidden=true;if(duplicate)duplicate.hidden=true;await refresh();
      }catch(err){toast(err.message,'error');}
      finally{if(submit)submit.disabled=false;}
    });
    refresh();
  }

  function initOrders(){const list=$('[data-order-list]'),detail=$('[data-order-detail]');if(!list)return;const search=$('[data-order-search]'),status=$('[data-order-status]');let selected=null,timer;async function load(){const p=new URLSearchParams();if(search.value.trim())p.set('search',search.value.trim());if(status.value)p.set('status',status.value);try{const r=await requestJson(`/admin/api/orders?${p}`);const orders=r.orders||[];list.innerHTML=orders.length?orders.map(orderRow).join(''):'<div class="empty">Chưa có yêu cầu đặt hàng mới.</div>';$$('[data-order-id]',list).forEach(btn=>btn.addEventListener('click',()=>show(Number(btn.dataset.orderId))));if(selected&&!orders.some(x=>x.id===selected)){selected=null;detail.innerHTML='<div class="empty">Chọn một yêu cầu để xem chi tiết.</div>';}}catch(e){list.innerHTML='<div class="empty">Không thể tải yêu cầu đặt hàng.</div>';toast(e.message,'error')}}async function show(id){try{const r=await requestJson(`/admin/api/orders/${id}`);selected=id;$$('[data-order-id]',list).forEach(x=>x.classList.toggle('active',Number(x.dataset.orderId)===id));const o=r.order,items=o.items||[];detail.innerHTML=`<div class="section-head"><h2>Chi tiết yêu cầu</h2><span class="status status-${esc(o.status)}">${esc(statusLabels[o.status]||o.status)}</span></div><dl><dt>Mã đơn</dt><dd>${esc(o.order_code||o.id)}</dd><dt>Khách hàng</dt><dd>${esc(o.customer_name||'—')}</dd><dt>Số điện thoại</dt><dd><a href="tel:${esc(o.phone||'')}">${esc(o.phone||'—')}</a></dd><dt>Ngày nhận</dt><dd>${esc(o.receive_date||'—')}</dd><dt>Địa chỉ</dt><dd>${esc(o.address||'—')}</dd><dt>Ghi chú</dt><dd>${esc(o.note||'—')}</dd></dl><h3>Sản phẩm</h3><ul class="order-items">${items.map(i=>`<li><strong>${esc(i.product_name||i.name||i.product_id||'Sản phẩm')}</strong><small>${esc(i.summary||i.configuration_summary||'')}</small></li>`).join('')||'<li>Không có dữ liệu sản phẩm.</li>'}</ul><form data-order-update><label>Trạng thái<select name="status">${Object.entries(statusLabels).map(([k,v])=>`<option value="${k}"${k===o.status?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Ghi chú nội bộ<textarea name="internal_note" rows="3">${esc(o.internal_note||'')}</textarea></label><div class="form-actions"><a class="button button-secondary" href="tel:${esc(o.phone||'')}">Gọi</a><a class="button button-secondary" href="https://zalo.me/${esc(String(o.phone||'').replace(/\D/g,''))}" target="_blank" rel="noopener">Nhắn Zalo</a><button class="button button-primary">Lưu</button></div></form>`;$('[data-order-update]',detail).addEventListener('submit',async e=>{e.preventDefault();try{await requestJson(`/admin/api/orders/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:e.currentTarget.elements.status.value,internal_note:e.currentTarget.elements.internal_note.value.trim()})});toast('Đã cập nhật yêu cầu.');await load();await show(id);}catch(err){toast(err.message,'error')}});}catch(e){toast(e.message,'error')}}search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,250)});status.addEventListener('change',load);$('[data-order-refresh]')?.addEventListener('click',load);load();}

  function initDashboard(){if(pageData.page!=='dashboard')return;Promise.allSettled([requestJson('/admin/api/orders/summary'),requestJson('/admin/api/orders?limit=3')]).then(results=>{const sum=results[0].status==='fulfilled'?results[0].value:null;const orders=results[1].status==='fulfilled'?results[1].value.orders||[]:[];if(sum)$('[data-order-new]').textContent=sum.stats?.new??'—';const root=$('[data-dashboard-orders]');if(root){root.classList.remove('empty');root.innerHTML=orders.length?orders.map(o=>`<div class="order-row"><span><strong>${esc(o.order_code||o.id)} · ${esc(o.customer_name||'Khách hàng')}</strong><small>${esc(o.phone||'')}</small></span><span class="status status-${esc(o.status)}">${esc(statusLabels[o.status]||o.status)}</span></div>`).join(''):'<div class="empty compact">Chưa có yêu cầu mới.</div>';}});}

  initListFilters(); initProductEditor(); initArticleEditor(); initCategories(); initSettings(); initMedia(); initOrders(); initDashboard();
})();
