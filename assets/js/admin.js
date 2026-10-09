(() => {
  'use strict';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const pageData = (() => { try { return JSON.parse($('#admin-page-data')?.textContent || '{}'); } catch { return {}; } })();
  const orderLabels = pageData.orderLabels || { new:'Mới', processing:'Đang xử lý', completed:'Hoàn thành', cancelled:'Đã hủy' };
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
      if (result.state === 'success') { pendingVersion=''; setPublishStatus('success','Bản cập nhật đã được chuẩn bị'); return; }
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

  function optionGroupCard(group={id:'',name:'',type:'single_select',required:true,options:[]}) { const groupRadio=`default-${Math.random().toString(36).slice(2)}`;
    const options=(group.options||[]).map(o=>`<div class="mini-row option-row"><input data-opt-id placeholder="id" value="${esc(o.id)}"><input data-opt-label placeholder="Tên lựa chọn" value="${esc(o.label)}"><label class="check-row"><input type="radio" data-opt-default name="${groupRadio}" ${o.default?'checked':''}> Mặc định</label><label class="check-row"><input type="checkbox" data-opt-custom ${o.allow_custom_text?'checked':''}> Khác</label><button type="button" class="remove" data-remove-row>×</button></div>`).join('');
    return `<div class="repeat-card option-group-card"><div class="repeat-head"><strong>Nhóm lựa chọn</strong><button type="button" class="remove" data-remove-card>Xóa nhóm</button></div><div class="form-grid two"><label>Tên nhóm<input data-group-name value="${esc(group.name)}"></label><label>ID nhóm<input data-group-id value="${esc(group.id)}"></label></div><label class="check-row"><input type="checkbox" data-group-required ${group.required!==false?'checked':''}> Bắt buộc chọn</label><div class="mini-list" data-option-list>${options}</div><button type="button" class="button button-secondary button-small" data-add-option>+ Thêm lựa chọn</button></div>`;
  }
  function componentCard(item={id:'',label:'',allow_custom_text:false}) {
    const sub=item.sub_option; const lines=sub?.options?.map(o=>`${o.id}|${o.label}${o.default?'|default':''}`).join('\n')||'';
    return `<div class="repeat-card component-card"><div class="repeat-head"><strong>Lễ vật</strong><button type="button" class="remove" data-remove-card>Xóa</button></div><div class="form-grid two"><label>Tên hiển thị<input data-component-label value="${esc(item.label)}"></label><label>ID<input data-component-id value="${esc(item.id)}"></label></div><label class="check-row"><input type="checkbox" data-component-custom ${item.allow_custom_text?'checked':''}> Cho khách nhập nội dung khác</label><label>Placeholder khi nhập khác<input data-component-placeholder value="${esc(item.custom_placeholder||'')}"></label><label class="check-row"><input type="checkbox" data-sub-enabled ${sub?'checked':''}> Có lựa chọn phụ</label><div data-sub-fields ${sub?'':'hidden'}><label>Tên lựa chọn phụ<input data-sub-name value="${esc(sub?.name||'Quy cách')}"></label><label>Các lựa chọn <span class="hint">Mỗi dòng: id|Tên|default (nếu mặc định)</span><textarea data-sub-options rows="3">${esc(lines)}</textarea></label></div></div>`;
  }
  function infoCard(block={title:'',description:''}) { return `<div class="repeat-card info-card"><div class="repeat-head"><strong>Mục thông tin</strong><button type="button" class="remove" data-remove-card>Xóa</button></div><label>Tiêu đề<input data-info-title value="${esc(block.title)}"></label><label>Mô tả<textarea rows="2" data-info-description>${esc(block.description)}</textarea></label></div>`; }
  function priceRuleCard(rule={label:'',option_group:'',option_id:'',quantity:1,amount:0}) { return `<div class="repeat-card price-rule-card"><div class="repeat-head"><strong>Quy tắc giá</strong><button type="button" class="remove" data-remove-card>Xóa</button></div><label>Tên quy cách<input data-price-label value="${esc(rule.label||'')}"></label><div class="form-grid two"><label>ID nhóm lựa chọn<input data-price-group value="${esc(rule.option_group||'')}" placeholder="flavor-count"></label><label>ID lựa chọn<input data-price-option value="${esc(rule.option_id||'')}" placeholder="2-vi"></label></div><div class="form-grid two"><label>Số lượng<input type="number" min="1" step="1" data-price-quantity value="${Number(rule.quantity||1)}"></label><label>Giá (đ)<input type="number" min="0" step="1000" data-price-amount value="${Number(rule.amount||0)}"></label></div></div>`; }

  function wireRepeatActions(root) {
    root.addEventListener('click', event=>{
      const removeCard=event.target.closest('[data-remove-card]'); if(removeCard){removeCard.closest('.repeat-card')?.remove(); return;}
      const removeRow=event.target.closest('[data-remove-row]'); if(removeRow){removeRow.closest('.mini-row')?.remove(); return;}
      const addOption=event.target.closest('[data-add-option]'); if(addOption){ const list=addOption.closest('.option-group-card').querySelector('[data-option-list]'); list.insertAdjacentHTML('beforeend',`<div class="mini-row option-row"><input data-opt-id placeholder="id"><input data-opt-label placeholder="Tên lựa chọn"><label class="check-row"><input type="radio" data-opt-default name="${list.querySelector('[data-opt-default]')?.name||'default-new'}"> Mặc định</label><label class="check-row"><input type="checkbox" data-opt-custom> Khác</label><button type="button" class="remove" data-remove-row>×</button></div>`); }
    });
    root.addEventListener('change',event=>{ if(event.target.matches('[data-sub-enabled]')){ const fields=event.target.closest('.component-card').querySelector('[data-sub-fields]'); fields.hidden=!event.target.checked; } });
  }

  // V2 shared authoring surface for products and articles. Server-side validation is authoritative.
  function validateRichHtml(raw) {
    if(typeof raw!=='string'||raw.length>250000) throw Error('Nội dung quá dài.');
    const template=document.createElement('template');template.innerHTML=raw;
    const tags=new Set('p h2 h3 h4 strong b em i u s ul ol li blockquote pre code br hr a img figure figcaption table thead tbody tr th td div span aside'.split(' '));
    const globalAttrs=new Set(['class','title']);
    const ownAttrs={a:['href','target','rel'],img:['src','alt','width','height','loading'],th:['colspan','rowspan','scope'],td:['colspan','rowspan'],ol:['start']};
    const walk=element=>{
      for(const node of element.childNodes){
        if(node.nodeType===8) throw Error('Không hỗ trợ chú thích HTML.');
        if(node.nodeType!==1) continue;
        const tag=node.localName;
        if(!tags.has(tag)) throw Error(`HTML <${tag}> không được hỗ trợ; H1 chỉ lấy từ tiêu đề bài.`);
        for(const {name,value} of node.attributes){
          if(!globalAttrs.has(name)&&!ownAttrs[tag]?.includes(name)) throw Error(`Thuộc tính ${name} của <${tag}> không được hỗ trợ.`);
          if(name==='class'&&!/^[a-zA-Z][\w-]*(\s+[a-zA-Z][\w-]*)*$/.test(value)) throw Error('CSS class không hợp lệ.');
          if(['href','src'].includes(name)){
            const local=/^\/(?!\/)[\w\-./?%#=&+~]+$/.test(value)&&!value.includes('..');
            const external=/^https:\/\/[^\s<>"']+$/.test(value);
            if(!(local||external||(name==='href'&&/^(mailto:|tel:)/.test(value))))throw Error('URL không an toàn.');
          }
        }
        if(tag==='img'&&!node.hasAttribute('alt')) throw Error('Ảnh cần có Alt.');
        walk(node);
      }
    };
    walk(template.content);
    return raw;
  }
  function previewRichHtml(raw,title='Bản xem trước') {
    validateRichHtml(raw);
    const modal=document.createElement('dialog');modal.className='preview-dialog';
    modal.innerHTML='<div class="preview-top"><strong></strong><button type="button" aria-label="Đóng xem trước">Đóng ×</button></div><iframe sandbox="" title="Xem trước nội dung chưa xuất bản"></iframe>';
    modal.querySelector('strong').textContent=title;
    modal.querySelector('button').onclick=()=>{modal.close();modal.remove();};
    modal.addEventListener('close',()=>modal.remove());
    document.body.append(modal);modal.showModal();
    const doc='<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/site.css"></head><body><main class="article-content">'+raw+'</main></body></html>';
    modal.querySelector('iframe').srcdoc=doc;
  }
  function initRichEditor(node){
    const visual=$('[data-rich-visual]',node),source=$('[data-rich-source]',node),sourceWrap=$('[data-rich-source-wrap]',node);
    const toolbar=$('[data-rich-toolbar]',node),preview=$('[data-rich-preview]',node),warn=$('[data-rich-warning]',node),picker=$('[data-rich-table-picker]',node);
    const linkTool=$('[data-rich-link-tool]',node),linkInput=$('[data-rich-link-input]',node);
    let value='<p></p>',mode='visual',changed=false,sourceChanged=false,lastRange=null,activeCell=null,editingLink=null,plainPaste=false;
    let history=[],historyIndex=-1,historyTimer=null;
    function count(){
      const raw=mode==='source'?source.value.replace(/<[^>]*>/g,' ').replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi,' '):mode==='preview'?preview.textContent:visual.textContent;
      const text=raw.trim();
      $('[data-rich-count]',node).textContent=(text?text.split(/\s+/).length:0)+' từ';
    }
    function set(html){clearTimeout(historyTimer);historyTimer=null;value=html||'<p></p>';visual.innerHTML=value;source.value=value;changed=false;sourceChanged=false;lastRange=null;history=[{html:value,bookmark:null}];historyIndex=0;count();warn.textContent='';}
    function get(){return mode==='source'?source.value:changed?visual.innerHTML:value;}
    function selectedRange(){const selection=window.getSelection();if(!selection?.rangeCount)return null;const range=selection.getRangeAt(0);return visual.contains(range.commonAncestorContainer)?range.cloneRange():null;}
    function rememberRange(){const range=selectedRange();if(range)lastRange=range;}
    function textOffsets(range){
      if(!range||!visual.contains(range.commonAncestorContainer))return null;
      const start=document.createRange(),end=document.createRange();start.selectNodeContents(visual);end.selectNodeContents(visual);
      start.setEnd(range.startContainer,range.startOffset);end.setEnd(range.endContainer,range.endOffset);
      return {start:start.toString().length,end:end.toString().length};
    }
    function rememberHistory(){
      const html=visual.innerHTML,bookmark=textOffsets(selectedRange()||lastRange),current=history[historyIndex];
      if(current?.html===html){current.bookmark=bookmark;return;}
      history.splice(historyIndex+1);history.push({html,bookmark});historyIndex=history.length-1;
      if(history.length>50){history.shift();historyIndex--;}
    }
    function scheduleHistory(){clearTimeout(historyTimer);historyTimer=setTimeout(()=>{historyTimer=null;rememberHistory();},500);}
    function flushHistory(){if(historyTimer!==null){clearTimeout(historyTimer);historyTimer=null;rememberHistory();}}
    function restoreTextOffset(offset){
      const walker=document.createTreeWalker(visual,NodeFilter.SHOW_TEXT);let remaining=offset,last=null;
      while(walker.nextNode()){const text=walker.currentNode;last=text;if(remaining<=text.length){return [text,remaining];}remaining-=text.length;}
      return last?[last,last.length]:[visual,visual.childNodes.length];
    }
    function restoreHistory(){
      const entry=history[historyIndex];if(!entry)return;
      visual.innerHTML=entry.html;value=entry.html;source.value=value;changed=true;sourceChanged=false;activeCell=null;$('[data-table-tools]',node).hidden=true;count();
      if(entry.bookmark){const start=restoreTextOffset(entry.bookmark.start),end=restoreTextOffset(entry.bookmark.end),range=document.createRange();range.setStart(...start);range.setEnd(...end);visual.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();}
      else lastRange=null;
    }
    function undoEditor(){flushHistory();if(historyIndex<=0)return;historyIndex--;restoreHistory();}
    function redoEditor(){flushHistory();if(historyIndex>=history.length-1)return;historyIndex++;restoreHistory();}
    visual.addEventListener('keyup',rememberRange);visual.addEventListener('mouseup',rememberRange);visual.addEventListener('blur',rememberRange);
    visual.addEventListener('input',()=>{rememberRange();changed=true;count();warn.textContent='';scheduleHistory();});
    source.addEventListener('input',()=>{value=source.value;sourceChanged=true;changed=false;count();});
    function cleanClipboardHtml(markup) {
      const body=new DOMParser().parseFromString(markup,'text/html').body;
      const allowed=new Set('p strong em u s ul ol li blockquote pre code br hr a img table thead tbody tr th td figure figcaption'.split(' '));
      const blockTags=new Set('p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre table thead tbody tr td th figure div section article'.split(' '));
      const discard=new Set(['script','style','iframe','object','embed','form','svg','canvas','video','audio','meta','link']);
      function convert(node) {
        if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
        if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
        const originalTag=node.tagName.toLowerCase();let tag=originalTag;if(discard.has(tag))return document.createDocumentFragment();
        if(tag==='b')tag='strong';if(tag==='i')tag='em';if(/^h[1-6]$/.test(tag))tag='p';
        if(tag==='div'||tag==='section'||tag==='article'){
          const children=[...node.childNodes],hasBlock=children.some(child=>child.nodeType===Node.ELEMENT_NODE&&blockTags.has(child.localName));
          if(!hasBlock){const paragraph=document.createElement('p');children.forEach(child=>paragraph.append(convert(child)));return paragraph;}
          const frag=document.createDocumentFragment();[...node.childNodes].forEach(child=>frag.append(convert(child)));return frag;
        }
        if(tag==='font'||tag==='span'){const frag=document.createDocumentFragment();[...node.childNodes].forEach(child=>frag.append(convert(child)));return frag;}
        if(!allowed.has(tag)){const frag=document.createDocumentFragment();[...node.childNodes].forEach(child=>frag.append(convert(child)));return frag;}
        const el=document.createElement(tag);
        if(tag==='a'){const url=node.getAttribute('href')||'';if(/^(https:\/\/[^\s]+|\/(?!\/)[^\s]*|mailto:[^\s]+|tel:[0-9+\s-]+)$/.test(url))el.setAttribute('href',url);else {const frag=document.createDocumentFragment();[...node.childNodes].forEach(child=>frag.append(convert(child)));return frag;}}
        if(tag==='img'){const src=node.getAttribute('src')||'';if(!/^(https:\/\/|\/assets\/images\/)/.test(src))return document.createDocumentFragment();el.setAttribute('src',src);el.setAttribute('alt',node.getAttribute('alt')||'');}
        if(tag==='td'||tag==='th'){for(const attr of ['colspan','rowspan']){const value=node.getAttribute(attr);if(/^\d{1,3}$/.test(value||''))el.setAttribute(attr,value);}}
        if(tag==='ol'){const start=node.getAttribute('start');if(/^\d{1,3}$/.test(start||''))el.setAttribute('start',start);}
        [...node.childNodes].forEach(child=>el.append(convert(child)));
        return el;
      }
      const output=document.createElement('div');[...body.childNodes].forEach(child=>output.append(convert(child)));
      return output.innerHTML;
    }
    function plainTextHtml(text){return text.replace(/\r\n?/g,'\n').split('\n').map(line=>`<p>${line?esc(line):'<br>'}</p>`).join('');}
    visual.addEventListener('paste',e=>{
      const html=e.clipboardData?.getData('text/html'),text=e.clipboardData?.getData('text/plain')||'';
      if(!html&&!text)return;e.preventDefault();
      if(plainPaste){plainPaste=false;if(text)insert(plainTextHtml(text));return;}
      if(html){try{const cleaned=cleanClipboardHtml(html);validateRichHtml(cleaned);if(cleaned){insert(cleaned);return;}if(!text)return;}
      catch(error){toast(`Không thể giữ định dạng khi dán: ${error.message}`,'error');}}
      if(text)insert(plainTextHtml(text));
    });
    function restoreRange(){let range=lastRange;if(!range||!visual.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(visual);range.collapse(false);}visual.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();return range;}
    function focus(){restoreRange();}
    function insert(html){flushHistory();if(mode==='source'){const start=source.selectionStart;source.setRangeText(html,start,source.selectionEnd,'end');value=source.value;return;}
      validateRichHtml(html);focus();
      const sel=window.getSelection();let range=lastRange;
      if(!range||!visual.contains(range.commonAncestorContainer)) {
        range=document.createRange();range.selectNodeContents(visual);range.collapse(false);
      }
      range.deleteContents();const frag=range.createContextualFragment(html),last=frag.lastChild;
      range.insertNode(frag);if(last){range.setStartAfter(last);range.collapse(true);sel.removeAllRanges();sel.addRange(range);lastRange=range.cloneRange();}
      syncVisual();}
    function rangeBlock(node){const element=node?.nodeType===Node.TEXT_NODE?node.parentElement:node,block=element?.closest?.('p,h1,h2,h3,h4,blockquote,pre,li,div');return block===visual?null:block||null;}
    function blocksInRange(range){
      const blocks=new Set(),walker=document.createTreeWalker(visual,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){const text=walker.currentNode;if(text.textContent.trim()&&range.intersectsNode(text)){const block=rangeBlock(text);if(block&&visual.contains(block))blocks.add(block);}}
      if(!blocks.size){const block=rangeBlock(range.startContainer);if(block&&visual.contains(block))blocks.add(block);}
      return [...blocks];
    }
    function syncVisual(){clearTimeout(historyTimer);historyTimer=null;value=visual.innerHTML;source.value=value;changed=true;count();rememberHistory();}
    function setBlockStyle(style){
      flushHistory();
      const range=restoreRange(),blocks=blocksInRange(range);
      if(!blocks.length)return;
      const targetTag=['p','h2','h3','h4','blockquote','pre'].includes(style)?style:'p';
      blocks.forEach(block=>{
        if(block.tagName==='LI'&&[...block.children].some(child=>child.matches('ul,ol')))return;
        const replacement=document.createElement(targetTag);
        for(const name of block.getAttributeNames())if(name!=='class')replacement.setAttribute(name,block.getAttribute(name));
        const classes=(block.className||'').split(/\s+/).filter(name=>name&&!['article-title','article-subtitle'].includes(name));
        if(style==='title')classes.push('article-title');if(style==='subtitle')classes.push('article-subtitle');
        if(classes.length)replacement.className=[...new Set(classes)].join(' ');
        while(block.firstChild)replacement.append(block.firstChild);
        if(block.tagName==='LI')block.append(replacement);else block.replaceWith(replacement);
      });
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();syncVisual();
    }
    function selectedLink(range){
      const node=range.startContainer?.nodeType===Node.TEXT_NODE?range.startContainer.parentElement:range.startContainer;
      return node?.closest?.('a')&&visual.contains(node.closest('a'))?node.closest('a'):null;
    }
    function openLinkTool(){
      const range=selectedRange();if(range)lastRange=range;
      const current=lastRange&&visual.contains(lastRange.commonAncestorContainer)?selectedLink(lastRange):null;
      editingLink=current;linkInput.value=current?.getAttribute('href')||'';$('[data-rich-link-remove]',node).hidden=!current;
      linkTool.hidden=false;linkInput.focus();
    }
    function closeLinkTool(){linkTool.hidden=true;editingLink=null;visual.focus();if(lastRange){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(lastRange);}}
    function applyLink(){
      flushHistory();const href=linkInput.value.trim();
      if(!/^(https:\/\/[^\s<>"']+|\/(?!\/)[\w\-./?%#=&+~]*|mailto:[^\s<>"']+|tel:[0-9+\s-]+)$/.test(href)){toast('Địa chỉ liên kết không hợp lệ. Dùng https://, đường dẫn nội bộ, mailto: hoặc tel:.','error');linkInput.focus();return;}
      try{validateRichHtml(`<a href="${esc(href)}">Liên kết</a>`);}catch(error){toast(error.message,'error');return;}
      const range=lastRange&&visual.contains(lastRange.commonAncestorContainer)?lastRange.cloneRange():restoreRange();
      visual.focus();
      if(editingLink&&visual.contains(editingLink)){editingLink.setAttribute('href',href);}
      else{
        const anchor=document.createElement('a');anchor.setAttribute('href',href);
        if(range.collapsed)anchor.textContent='Liên kết';else anchor.append(range.extractContents());
        range.insertNode(anchor);range.setStartAfter(anchor);range.collapse(true);
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();
      }
      syncVisual();closeLinkTool();
    }
    function removeLink(){
      flushHistory();
      if(!editingLink||!visual.contains(editingLink))return;
      const parent=editingLink.parentNode,range=document.createRange();while(editingLink.firstChild)parent.insertBefore(editingLink.firstChild,editingLink);editingLink.remove();range.selectNodeContents(parent);range.collapse(false);lastRange=range.cloneRange();syncVisual();closeLinkTool();
    }
    linkTool.addEventListener('click',e=>{
      if(e.target.closest('[data-rich-link-save]'))applyLink();
      if(e.target.closest('[data-rich-link-cancel]'))closeLinkTool();
      if(e.target.closest('[data-rich-link-remove]'))removeLink();
    });
    linkInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyLink();}if(e.key==='Escape'){e.preventDefault();closeLinkTool();}});
    visual.addEventListener('keydown',e=>{
      if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
      const key=e.key.toLowerCase();
      if(key==='v'&&e.shiftKey){plainPaste=true;setTimeout(()=>{plainPaste=false;},0);return;}
      const redo=key==='y'||(key==='z'&&e.shiftKey);
    if(['b','i','u','k','z','y'].includes(key)){
      e.preventDefault();rememberRange();
      if(key==='k'){openLinkTool();return;}
      if(key==='z'||key==='y'){redo?redoEditor():undoEditor();return;}
      flushHistory();document.execCommand({b:'bold',i:'italic',u:'underline'}[key],false,null);rememberRange();syncVisual();
    }
    });
    visual.addEventListener('keydown',e=>{
      if(e.key!=='Enter'||e.shiftKey)return;
      const range=selectedRange();if(!range?.collapsed)return;
      const block=rangeBlock(range.startContainer);if(!block||!/^H[2-4]$/.test(block.tagName))return;
      const end=document.createRange();end.selectNodeContents(block);end.collapse(false);
      if(range.compareBoundaryPoints(Range.START_TO_START,end)!==0)return;
      e.preventDefault();flushHistory();const paragraph=document.createElement('p');paragraph.append(document.createElement('br'));block.after(paragraph);
      const caret=document.createRange();caret.setStart(paragraph,0);caret.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(caret);lastRange=caret.cloneRange();syncVisual();
    });
    function toggle(next){
      if(next===mode)return;
      try{validateRichHtml(get());}catch(e){warn.textContent=e.message;toast(e.message,'error');return;}
      if(mode==='visual')flushHistory();
      value=get();mode=next;
      node.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
      visual.hidden=next!=='visual';toolbar.hidden=next!=='visual';sourceWrap.hidden=next!=='source';preview.hidden=next!=='preview';
      if(next==='visual'&&sourceChanged){clearTimeout(historyTimer);historyTimer=null;visual.innerHTML=value;sourceChanged=false;changed=false;lastRange=null;history=[{html:value,bookmark:null}];historyIndex=0;}
      if(next==='source')source.value=value;
      if(next==='preview')preview.innerHTML=value;
      count();
    }
    node.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>toggle(b.dataset.mode)));
    toolbar.addEventListener('pointerdown',e=>{rememberRange();if(e.target.closest('button[data-command]'))e.preventDefault();});
    toolbar.addEventListener('click',e=>{
      const btn=e.target.closest('[data-command]');if(!btn)return;
      const cmd=btn.dataset.command;
      if(cmd==='image'){openImagePicker({type:'content',rich:api});return;}
      if(cmd==='table'){picker.hidden=!picker.hidden;return;}
      if(cmd==='link'){openLinkTool();return;}
      if(cmd==='undo'){undoEditor();return;}
      if(cmd==='redo'){redoEditor();return;}
      if(cmd==='cta'){insert('<a class="article-btn" href="/banh-phu-the/">Xem sản phẩm</a>');return;}
      if(cmd==='note'){insert('<aside class="article-note"><p>Nhập ghi chú tại đây.</p></aside>');return;}
      if(['align-left','align-center','align-right'].includes(cmd)){
        flushHistory();
        blocksInRange(restoreRange()).forEach(block=>{block.classList.remove('align-left','align-center','align-right');block.classList.add(cmd);});syncVisual();return;
      }
      if(cmd==='style')return;
      flushHistory();focus();document.execCommand(cmd,false,null);rememberRange();syncVisual();
    });
    toolbar.querySelector('[data-command="style"]').addEventListener('change',e=>{setBlockStyle(e.target.value);e.target.value='p';});
    picker.addEventListener('click',e=>{
      const b=e.target.closest('[data-table-size]');if(!b)return;
      const [cols,rows]=b.dataset.tableSize.split(',').map(Number);
      const table='<table><tbody>'+Array.from({length:rows},()=>'<tr>'+Array.from({length:cols},()=>'<td><p> </p></td>').join('')+'</tr>').join('')+'</tbody></table><p></p>';
      insert(table);picker.hidden=true;
    });
    visual.addEventListener('click',e=>{activeCell=e.target.closest('td,th');$('[data-table-tools]',node).hidden=!activeCell;});
    toolbar.addEventListener('click',e=>{
      const btn=e.target.closest('[data-table-action]');if(!btn||!activeCell)return;
      flushHistory();
      const action=btn.dataset.tableAction,row=activeCell.closest('tr'),table=activeCell.closest('table');
      if(action==='add-row'){const r=row.cloneNode(true);r.querySelectorAll('td,th').forEach(c=>c.innerHTML='<p> </p>');row.after(r);}
      if(action==='add-col')table.querySelectorAll('tr').forEach(tr=>{const newTd=document.createElement('td');newTd.innerHTML='<p> </p>';tr.appendChild(newTd);});
      if(action==='delete-row'){if(table.rows.length>1)row.remove();else toast('Bảng phải có ít nhất một hàng.','error');}
      if(action==='delete-col'){const index=activeCell.cellIndex;if(row.cells.length>1)table.querySelectorAll('tr').forEach(tr=>tr.cells[index]?.remove());else toast('Bảng phải có ít nhất một cột.','error');}
      if(action==='merge'){const next=activeCell.nextElementSibling;if(next){activeCell.colSpan=Number(activeCell.colSpan||1)+Number(next.colSpan||1);next.remove();}else toast('Không còn ô kế tiếp để gộp.','error');}
      syncVisual();
    });
    visual.addEventListener('dblclick',e=>{const img=e.target.closest('img');if(img){e.preventDefault();const figure=img.closest('figure')||img;openImagePicker({type:'content-replace',rich:api,node:figure});}});
    const api={set,get,insert,sync:()=>{changed=true;value=visual.innerHTML;source.value=value;count()},preview:()=>previewRichHtml(get())};set('<p></p>');return api;
  }
  function initRelations(form){
    $$('[data-relation-picker]',form).forEach(root=>{
      const search=$('[data-relation-search]',root),select=$('select[multiple]',root),rows=$$('[data-relation-row]',root);
      function update(){const chosen=new Set(selectedValues(select));const query=search.value.toLowerCase().trim();let count=0;
        rows.forEach(row=>{const show=row.dataset.search.includes(query)&&row.dataset.value!==querySlug();row.hidden=!show;const check=$('[data-relation-check]',row);check.checked=chosen.has(row.dataset.value);if(check.checked)count++;});
        $('[data-relation-selected]',root).textContent=`Đã chọn ${chosen.size} mục liên quan.`;}
      rows.forEach(row=>$('[data-relation-check]',row).addEventListener('change',e=>{const op=[...select.options].find(x=>x.value===row.dataset.value);if(op)op.selected=e.target.checked;update();}));
      search.addEventListener('input',update);const observer=new MutationObserver(update);observer.observe(select,{attributes:true,subtree:true,attributeFilter:['selected']});root.refresh=update;update();
    });
  }
  const normalizeSeoKeywords=value=>{
    const seen=new Set();
    return String(value||'').split(',').map(keyword=>keyword.trim()).filter(keyword=>{
      const normalized=keyword.toLocaleLowerCase('vi');
      if(!normalized||seen.has(normalized))return false;
      seen.add(normalized);return true;
    });
  };
  function seoWatcher(form,rich){
    const checklist=$('[data-seo-checklist]',form);if(!checklist)return;
    const title=form.elements.seo_title,description=form.elements.seo_description,keyword=form.elements.focus_keyword;
    function refresh(){const main=form.elements.name?.value||form.elements.title?.value||'',html=rich.get();const text=html.replace(/<[^>]+>/g,' ').replace(/&\w+;/g,' '),words=text.trim()?text.trim().split(/\s+/).length:0;
      $('[data-seo-title-count]',form).textContent=title.value.length;$('[data-seo-desc-count]',form).textContent=description.value.length;
      const checks=[['Có SEO Title',Boolean(title.value.trim())],['Có Meta Description',Boolean(description.value.trim())],['Có nội dung chi tiết',words>0],['Có H2',/<h2[\s>]/i.test(html)],['Ảnh có Alt',!/<img\b(?![^>]*\balt=)/i.test(html)],['Có liên kết nội bộ',/href="\/(?!\/)/i.test(html)]];
      const primaryKeyword=normalizeSeoKeywords(keyword.value)[0];
      if(primaryKeyword){const term=primaryKeyword.toLocaleLowerCase('vi');checks.push(['Từ khóa trong tên sản phẩm/tiêu đề',main.toLocaleLowerCase('vi').includes(term)],['Từ khóa trong SEO Title',title.value.toLocaleLowerCase('vi').includes(term)]);}
      checklist.innerHTML=checks.map(([name,ok])=>`<div class="seo-check ${ok?'ok':'warn'}"><span>${ok?'✓':'○'}</span>${esc(name)}</div>`).join('');
      $('[data-preview-url]',form).textContent=location.origin+(form.elements.title?'/cam-nang/':'/')+(form.elements.slug?.value||'');
      $('[data-preview-title]',form).textContent=title.value;$('[data-preview-description]',form).textContent=description.value;
    }
    form.addEventListener('input',refresh);form.querySelector('[data-rich-visual]')?.addEventListener('input',refresh);form.querySelector('[data-rich-source]')?.addEventListener('input',refresh);refresh();
  }

  let imageTarget=null;
  function openImagePicker(target){
    const dialog=$('[data-image-dialog]');if(!dialog) return;
    imageTarget=target;
    const selected=$('[data-image-preview]',dialog); selected.removeAttribute('src');
    $$('[data-image-alt],[data-image-caption],[data-image-width],[data-image-height],[data-image-class],[data-image-link],[data-image-url]',dialog).forEach(i=>i.value='');
    $('[data-image-new-tab]',dialog).checked=false;
    $('[data-image-align]',dialog).value='align-center';
    dialog.dataset.src='';dialog.dataset.choice='media';
    const currentImg=target.type==='content-replace' ? target.node.querySelector('img') || (target.node.tagName==='IMG'?target.node:null) : null;
    const source=target.type==='input' ? target.input.value : currentImg?.getAttribute('src')||'';
    if(currentImg){ $('[data-image-alt]',dialog).value=currentImg.getAttribute('alt')||''; $('[data-image-caption]',dialog).value=target.node.querySelector('figcaption')?.textContent||''; $('[data-image-width]',dialog).value=currentImg.getAttribute('width')||''; $('[data-image-height]',dialog).value=currentImg.getAttribute('height')||'';const classes=(currentImg.getAttribute('class')||'').split(/\s+/);const align=classes.find(c=>['align-center','align-left','align-right'].includes(c))||'align-center';$('[data-image-align]',dialog).value=align;$('[data-image-class]',dialog).value=classes.filter(c=>c!==align).join(' ');const link=currentImg.closest('a');if(link){$('[data-image-link]',dialog).value=link.getAttribute('href')||'';$('[data-image-new-tab]',dialog).checked=link.getAttribute('target')==='_blank';}}
    if(source){dialog.dataset.src=source;selected.src=source;}
    function sourceTab(tab){dialog.dataset.choice=tab;$$('[data-image-tab]',dialog).forEach(b=>b.classList.toggle('active',b.dataset.imageTab===tab));$$('[data-image-panel]',dialog).forEach(p=>p.hidden=p.dataset.imagePanel!==tab);}
    function propertyTab(tab){$$('[data-image-property-tab]',dialog).forEach(b=>b.classList.toggle('active',b.dataset.imagePropertyTab===tab));$$('[data-image-property]',dialog).forEach(p=>p.hidden=p.dataset.imageProperty!==tab);}
    $$('[data-image-tab]',dialog).forEach(b=>b.onclick=()=>sourceTab(b.dataset.imageTab));
    $$('[data-image-property-tab]',dialog).forEach(b=>b.onclick=()=>propertyTab(b.dataset.imagePropertyTab));
    sourceTab('media');propertyTab('info');
    const media=$('[data-image-media]',dialog),search=$('[data-image-search]',dialog);
    media.textContent='Đang tải thư viện…';
    requestJson('/admin/api/v2/media').then(r=>{
      const images=r.items||[];
      media.innerHTML=images.map(item=>`<button type="button" data-picker-src="${esc(item.url)}" data-picker-name="${esc(item.name)}" data-picker-alt="${esc(item.alt||'')}"><img loading="lazy" src="${esc(item.url)}" alt=""><small>${esc(item.name)}</small></button>`).join('')||'<p>Thư viện chưa có ảnh.</p>';
      media.onclick=e=>{const btn=e.target.closest('[data-picker-src]');if(!btn)return;dialog.dataset.src=btn.dataset.pickerSrc;selected.src=btn.dataset.pickerSrc;if(!$('[data-image-alt]',dialog).value)$('[data-image-alt]',dialog).value=btn.dataset.pickerAlt||'';$$('[data-picker-src]',media).forEach(b=>b.classList.toggle('active',b===btn));};
      search.oninput=()=>$$('[data-picker-src]',media).forEach(b=>b.hidden=!b.dataset.pickerName.toLowerCase().includes(search.value.toLowerCase()));
    }).catch(err=>{media.textContent=err.message;});
    $('[data-image-file]',dialog).onchange=e=>{const file=e.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file);if(dialog.dataset.objectUrl)URL.revokeObjectURL(dialog.dataset.objectUrl);dialog.dataset.objectUrl=url;selected.src=url;};
    $('[data-image-url]',dialog).oninput=e=>{const s=e.target.value.trim();if(/^https:\/\/[^\s<>"']+$/.test(s)){selected.src=s;dialog.dataset.src=s;}};
    const close=()=>{if(dialog.dataset.objectUrl){URL.revokeObjectURL(dialog.dataset.objectUrl);delete dialog.dataset.objectUrl;}dialog.close();};
    $$('[data-image-close]',dialog).forEach(b=>b.onclick=close);
    $('[data-image-confirm]',dialog).onclick=async()=>{
      const msg=$('[data-image-message]',dialog);msg.textContent='';
      const tab=dialog.dataset.choice;let url=dialog.dataset.src;
      const alt=$('[data-image-alt]',dialog).value.trim();
      if(!alt){msg.textContent='Nhập Alt trước khi chèn ảnh.';return;}
      const confirm=$('[data-image-confirm]',dialog);confirm.disabled=true;
      try {
        if(tab==='upload'){
          const original=$('[data-image-file]',dialog).files?.[0];if(!original)throw Error('Vui lòng chọn ảnh để tải lên.');
          const {file}=await optimizeImageFile(original);
          if(file.size>900000)throw Error('Ảnh lớn hơn 900 KB sau tối ưu.');
          const fd=new FormData();fd.append('file',file);fd.append('alt',alt);fd.append('group',imageTarget?.kind||'articles');
          const r=await requestJson('/admin/api/v2/media',{method:'POST',body:fd});url=r.url;
        } else if(tab==='url') url=$('[data-image-url]',dialog).value.trim();
        if(!url)throw Error('Vui lòng chọn hoặc nhập URL ảnh.');
        const width=Number($('[data-image-width]',dialog).value||0),height=Number($('[data-image-height]',dialog).value||0);
        const cls=[ $('[data-image-align]',dialog).value,$('[data-image-class]',dialog).value.trim()].filter(Boolean).join(' ');
        const caption=$('[data-image-caption]',dialog).value.trim();
        const link=$('[data-image-link]',dialog).value.trim();
        const openNew=$('[data-image-new-tab]',dialog).checked;
        let img=`<img src="${esc(url)}" alt="${esc(alt)}"${cls?` class="${esc(cls)}"`:''}${width?` width="${width}"`:''}${height?` height="${height}"`:''} loading="lazy">`;
        if(link)img=`<a href="${esc(link)}"${openNew?' target="_blank" rel="noopener noreferrer"':''}>${img}</a>`;
        const markup=`<figure>${img}${caption?`<figcaption>${esc(caption)}</figcaption>`:''}</figure>`;
        validateRichHtml(markup);
        if(imageTarget.type==='input'){
          if(!url.startsWith('/assets/images/'))throw Error('Ảnh đại diện phải lấy từ thư viện Media của Shop.');
          imageTarget.input.value=url;imageTarget.input.dispatchEvent(new Event('input',{bubbles:true}));
          const field=imageTarget.input.closest('form')?.elements[imageTarget.input.name==='main_image'?'main_image_alt':'cover_alt'];if(field)field.value=alt;
        } else if(imageTarget.type==='content-replace'){imageTarget.node.outerHTML=markup;imageTarget.rich.sync();}else imageTarget.rich.insert(markup);
        close();toast('Đã chọn và chèn ảnh.');
      }catch(err){msg.textContent=err.message;toast(err.message,'error');}
      finally{confirm.disabled=false;}
    };
    dialog.showModal();
  }
  function wireImageButtons(form,kind){
    $$('[data-image-open]',form).forEach(btn=>btn.addEventListener('click',()=>{
      const input=btn.closest('.media-field').querySelector('input[name="main_image"],input[name="cover_src"],input[name="header_logo"]');
      openImagePicker({type:'input',input,kind});
    }));
  }

  function initProductEditor() {
    const form=$('[data-product-editor]'); if(!form) return;
    const optionRoot=$('[data-option-groups]'), compRoot=$('[data-components]'), infoRoot=$('[data-info-blocks]'), priceRoot=$('[data-price-rules]');
    wireRepeatActions(form);
    $('[data-add-option-group]')?.addEventListener('click',()=>optionRoot.insertAdjacentHTML('beforeend',optionGroupCard()));
    $('[data-add-component]')?.addEventListener('click',()=>compRoot.insertAdjacentHTML('beforeend',componentCard()));
    $('[data-add-info]')?.addEventListener('click',()=>infoRoot.insertAdjacentHTML('beforeend',infoCard()));
    $('[data-add-price-rule]')?.addEventListener('click',()=>priceRoot.insertAdjacentHTML('beforeend',priceRuleCard()));
    const rich=initRichEditor($('[data-rich-editor]',form));initRelations(form);wireImageButtons(form,'products');seoWatcher(form,rich);
    let currentSha=null, existingSlug=querySlug(), loaded=structuredClone(pageData.blank||{});

    function renderCollections(data){ optionRoot.innerHTML=(data.option_groups||[]).map(optionGroupCard).join(''); compRoot.innerHTML=(data.components||[]).map(componentCard).join(''); infoRoot.innerHTML=(data.info_blocks||[]).map(infoCard).join(''); priceRoot.innerHTML=(data.price?.rules||[]).map(priceRuleCard).join(''); }
    function apply(data){ loaded=structuredClone(data); setFormValue(form,'name',data.name); setFormValue(form,'slug',data.slug); setFormValue(form,'short_description',data.short_description); setFormValue(form,'type',data.type); setFormValue(form,'status',data.status); setFormValue(form,'main_image',data.main_image);setFormValue(form,'main_image_alt',data.main_image_alt||data.name); setFormValue(form,'gallery',(data.gallery||[]).join('\n')); setFormValue(form,'price_display',data.price?.display_text||'Giá liên hệ'); $$('input[name=price_mode]',form).forEach(r=>r.checked=r.value===(data.price?.mode||'contact')); setFormValue(form,'price_amount',data.price?.amount||''); setFormValue(form,'quantity_enabled',data.quantity?.enabled); setFormValue(form,'quantity_default',data.quantity?.default_value||1); setFormValue(form,'quantity_min',data.quantity?.min_value||1); setFormValue(form,'quantity_step',data.quantity?.step||1); setFormValue(form,'quantity_unit',data.quantity?.unit||''); setFormValue(form,'quantity_hint',data.quantity?.hint||''); setFormValue(form,'receive_date_enabled',data.receive_date?.enabled); setFormValue(form,'receive_date_label',data.receive_date?.label||'Ngày nhận mâm quả'); setFormValue(form,'seo_title',data.seo?.title); setFormValue(form,'seo_description',data.seo?.description); setFormValue(form,'focus_keyword',normalizeSeoKeywords(data.seo?.focus_keyword).join(', '));rich.set(data.content_html||'<p></p>'); syncMulti(form.elements.related_products,data.related_products); syncMulti(form.elements.related_articles,data.related_articles);$$('[data-relation-picker]',form).forEach(e=>e.refresh?.()); renderCollections(data); $('.media-field img').src=data.main_image; updateType(); updatePrice(); updateUrl(); }
    function updateType(){ const type=form.elements.type.value; $('[data-variant-section]').hidden=type!=='variant'; $('[data-composite-section]').hidden=type!=='composite'; $('[data-quantity-section]').hidden=type==='composite'; }
    function updatePrice(){ const mode=$$('input[name=price_mode]',form).find(r=>r.checked)?.value||'contact'; $('[data-fixed-price]').hidden=mode!=='fixed'; $('[data-hybrid-price]').hidden=mode!=='hybrid'; }
    function updateUrl(){ const slug=form.elements.slug.value.trim()||'ten-san-pham'; $('[data-product-url]').textContent=`/${slug}/`; }
    form.elements.type.addEventListener('change',updateType); $$('input[name=price_mode]',form).forEach(r=>r.addEventListener('change',updatePrice)); form.elements.slug.addEventListener('input',updateUrl); form.elements.name.addEventListener('input',()=>{ if(!existingSlug&&!form.elements.slug.dataset.touched) form.elements.slug.value=slugify(form.elements.name.value); updateUrl(); }); form.elements.slug.addEventListener('input',()=>form.elements.slug.dataset.touched='1'); form.elements.main_image.addEventListener('input',()=>{$('.media-field img').src=form.elements.main_image.value||'/assets/images/products/banh-phu-the.jpg';});

    function collectOptions(){ return $$('.option-group-card',optionRoot).map((card,gIndex)=>{ const rows=$$('.option-row',card); const defaults=rows.filter(r=>$('[data-opt-default]',r).checked); return {id:slugify($('[data-group-id]',card).value||`nhom-${gIndex+1}`),name:$('[data-group-name]',card).value.trim()||`Nhóm ${gIndex+1}`,type:'single_select',required:$('[data-group-required]',card).checked,options:rows.map((row,i)=>{ const custom=$('[data-opt-custom]',row).checked; const o={id:slugify($('[data-opt-id]',row).value||`lua-chon-${i+1}`),label:$('[data-opt-label]',row).value.trim()||`Lựa chọn ${i+1}`}; if(defaults.length&&$('[data-opt-default]',row).checked)o.default=true; if(custom){o.allow_custom_text=true;o.custom_placeholder='Nhập lựa chọn khác…';} return o;})}; }); }
    function parseSubOptions(text){ return String(text||'').split('\n').map(x=>x.trim()).filter(Boolean).map((line,i)=>{const [id,label,flag]=line.split('|').map(x=>x?.trim());const o={id:slugify(id||`lua-chon-${i+1}`),label:label||id||`Lựa chọn ${i+1}`};if(flag==='default')o.default=true;return o;}); }
    function collectComponents(){ return $$('.component-card',compRoot).map((card,i)=>{ const id=slugify($('[data-component-id]',card).value||`le-vat-${i+1}`); const item={id,label:$('[data-component-label]',card).value.trim()||`Lễ vật ${i+1}`}; if($('[data-component-custom]',card).checked){item.allow_custom_text=true;item.custom_placeholder=$('[data-component-placeholder]',card).value.trim()||'Ghi rõ lễ vật khác…';} if($('[data-sub-enabled]',card).checked){const options=parseSubOptions($('[data-sub-options]',card).value); if(options.length)item.sub_option={id:`${id}-option`,name:$('[data-sub-name]',card).value.trim()||'Quy cách',type:'single_select',required:true,options};} return item; }); }
    function collect(){ const type=form.elements.type.value, mode=$$('input[name=price_mode]',form).find(r=>r.checked)?.value||'contact'; const data={...structuredClone(loaded),id:loaded.id||existingSlug||slugify(form.elements.slug.value),name:form.elements.name.value.trim(),slug:form.elements.slug.value.trim(),status:form.elements.status.value,type,main_image:form.elements.main_image.value.trim(),main_image_alt:form.elements.main_image_alt.value.trim(),gallery:form.elements.gallery.value.split('\n').map(x=>x.trim()).filter(Boolean),short_description:form.elements.short_description.value.trim(),price:{mode,display_text:form.elements.price_display.value.trim()||'Giá liên hệ'},quantity:{},note:loaded.note||{enabled:true,label:'Ghi chú',placeholder:'Yêu cầu thêm cho Shop…'},info_blocks:$$('.info-card',infoRoot).map(card=>({title:$('[data-info-title]',card).value.trim(),description:$('[data-info-description]',card).value.trim()})).filter(x=>x.title&&x.description),related_products:selectedValues(form.elements.related_products).filter(x=>x!==(loaded.id||existingSlug||form.elements.slug.value)),related_articles:selectedValues(form.elements.related_articles),seo:{...(loaded.seo||{}),title:form.elements.seo_title.value.trim(),description:form.elements.seo_description.value.trim(),focus_keyword:normalizeSeoKeywords(form.elements.focus_keyword.value).join(', ')},content_html:rich.get().trim()==='<p></p>'?'':rich.get()}; if(mode==='fixed')data.price.amount=Number(form.elements.price_amount.value||0); if(mode==='hybrid')data.price.rules=$$('.price-rule-card',priceRoot).map((card,i)=>({label:$('[data-price-label]',card).value.trim()||`Quy cách ${i+1}`,option_group:slugify($('[data-price-group]',card).value),option_id:slugify($('[data-price-option]',card).value),quantity:Number($('[data-price-quantity]',card).value||1),amount:Number($('[data-price-amount]',card).value||0)})); if(type==='composite'){data.quantity={enabled:false,derived_from:'selected_components',unit:'mâm'};data.components=collectComponents();data.receive_date={enabled:form.elements.receive_date_enabled.checked,label:form.elements.receive_date_label.value.trim()||'Ngày nhận',carry_to_checkout:true,checkout_is_final:true};delete data.option_groups;}else{data.quantity={enabled:form.elements.quantity_enabled.checked,label:'Số lượng',default_value:Number(form.elements.quantity_default.value||1),min_value:Number(form.elements.quantity_min.value||1),step:Number(form.elements.quantity_step.value||1),unit:form.elements.quantity_unit.value.trim(),hint:form.elements.quantity_hint.value.trim()}; if(type==='variant')data.option_groups=collectOptions();else delete data.option_groups; delete data.components;delete data.receive_date;} return data; }
    async function save(forceDraft=false){let data;try{data=collect();validateRichHtml(data.content_html);}catch(e){return toast(e.message,'error');} if(forceDraft)data.status='draft'; if(!data.slug||!data.name||!data.short_description){toast('Vui lòng nhập đủ tên, slug và mô tả ngắn.','error');return;} try{const result=await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'products',slug:existingSlug||data.id,sha:currentSha,data,confirm_write:true})});currentSha=result.sha||currentSha; existingSlug=existingSlug||data.id;toast(forceDraft?'Đã lưu bản nháp.':'Đã lưu sản phẩm.'); if(!querySlug()) history.replaceState(null,'',`?slug=${encodeURIComponent(existingSlug)}`);}catch(error){toast(error.message,'error');}}
    form.addEventListener('submit',e=>{e.preventDefault();save(false);}); $('[data-save-draft]')?.addEventListener('click',()=>save(true)); $('[data-preview-product]')?.addEventListener('click',()=>{try{previewRichHtml(`<h2>${esc(form.elements.name.value)}</h2>`+rich.get(),'Xem trước nội dung sản phẩm');}catch(e){toast(e.message,'error');}});
    apply(loaded);
    if(existingSlug) requestJson(`/admin/api/v2/content?kind=products&slug=${encodeURIComponent(existingSlug)}`).then(result=>{currentSha=result.sha;apply(result.data);}).catch(e=>toast(e.message,'error'));
  }

  function blockCard(block={type:'paragraph',text:''}) { const type=block.type||'paragraph'; let field=''; if(type==='list')field=`<label>Mỗi dòng một mục<textarea data-block-items rows="4">${esc((block.items||[]).join('\n'))}</textarea></label>`; else if(type==='image')field=`<label>Đường dẫn ảnh<input data-block-src value="${esc(block.src||'')}"></label><label>Alt<input data-block-alt value="${esc(block.alt||'')}"></label><label>Chú thích<input data-block-caption value="${esc(block.caption||'')}"></label>`; else field=`<label>Nội dung<textarea data-block-text rows="${type==='paragraph'?4:2}">${esc(block.text||'')}</textarea></label>`; return `<div class="article-block" data-block-type="${esc(type)}"><div class="article-block-head"><strong>${esc({paragraph:'Đoạn văn',h2:'H2',h3:'H3',list:'Danh sách',image:'Ảnh',callout:'Callout'}[type]||type)}</strong><button type="button" class="remove" data-remove-block>Xóa</button></div>${field}</div>`; }
  function initArticleEditor(){
    const form=$('[data-article-editor]');if(!form)return;
    const rich=initRichEditor($('[data-rich-editor]',form));
    initRelations(form);wireImageButtons(form,'articles');seoWatcher(form,rich);
    let currentSha=null,existingSlug=querySlug(),loaded=structuredClone(pageData.blank||{});
    function updateUrl(){$('[data-article-url]').textContent=`/cam-nang/${form.elements.slug.value.trim()||'ten-bai-viet'}/`;}
    function render(data){
      loaded=structuredClone(data);
      for(const field of ['title','slug','category','excerpt','status','featured','featured_order'])setFormValue(form,field,data[field]);
      setFormValue(form,'cover_src',data.cover?.src);setFormValue(form,'cover_alt',data.cover?.alt);
      setFormValue(form,'seo_title',data.seo?.title);setFormValue(form,'seo_description',data.seo?.description);setFormValue(form,'focus_keyword',normalizeSeoKeywords(data.seo?.focus_keyword).join(', '));
      syncMulti(form.elements.related_products,data.related_products||[]);syncMulti(form.elements.related_articles,data.related_articles||[]);
      $$('[data-relation-picker]',form).forEach(e=>e.refresh?.());
      rich.set(data.content_html||'<p></p>');$('[data-cover-preview]').src=data.cover?.src||'/assets/images/articles/mam-qua-cuoi-thuong-co-nhung-gi.jpg';updateUrl();
    }
    form.elements.title.addEventListener('input',()=>{if(!existingSlug&&!form.elements.slug.dataset.touched)form.elements.slug.value=slugify(form.elements.title.value);updateUrl();});
    form.elements.slug.addEventListener('input',()=>{form.elements.slug.dataset.touched='1';updateUrl();});
    form.elements.cover_src.addEventListener('input',()=>{$('[data-cover-preview]').src=form.elements.cover_src.value||'/assets/images/articles/mam-qua-cuoi-thuong-co-nhung-gi.jpg';});
    function collect(){return {...structuredClone(loaded),id:loaded.id||existingSlug||slugify(form.elements.slug.value),title:form.elements.title.value.trim(),slug:form.elements.slug.value.trim(),category:form.elements.category.value,status:form.elements.status.value,featured:form.elements.featured.checked,featured_order:Number(form.elements.featured_order.value||0),cover:{src:form.elements.cover_src.value.trim(),alt:form.elements.cover_alt.value.trim()},excerpt:form.elements.excerpt.value.trim(),content_html:rich.get(),related_products:selectedValues(form.elements.related_products),related_articles:selectedValues(form.elements.related_articles).filter(x=>x!==(loaded.id||existingSlug||form.elements.slug.value)),seo:{...(loaded.seo||{}),title:form.elements.seo_title.value.trim(),description:form.elements.seo_description.value.trim(),focus_keyword:normalizeSeoKeywords(form.elements.focus_keyword.value).join(', ')}};}
    async function save(forceDraft=false){
      let data;try{data=collect();validateRichHtml(data.content_html);}catch(e){return toast(e.message,'error');}
      if(forceDraft)data.status='draft';
      try{const result=await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'articles',slug:existingSlug||data.id,sha:currentSha,data,confirm_write:true})});
        currentSha=result.sha||currentSha;existingSlug=existingSlug||data.id;toast(forceDraft?'Đã lưu bản nháp.':'Đã lưu bài viết.');if(!querySlug())history.replaceState(null,'',`?slug=${encodeURIComponent(existingSlug)}`);
      }catch(e){toast(e.message,'error');}
    }
    form.addEventListener('submit',e=>{e.preventDefault();save(false);});
    $('[data-save-article-draft]')?.addEventListener('click',()=>save(true));
    $('[data-preview-article]')?.addEventListener('click',()=>{try{previewRichHtml(`<h2>${esc(form.elements.title.value)}</h2>`+rich.get(),'Xem trước bài Cẩm nang');}catch(e){toast(e.message,'error');}});
    render(loaded);
    if(existingSlug)requestJson(`/admin/api/v2/content?kind=articles&slug=${encodeURIComponent(existingSlug)}`).then(r=>{currentSha=r.sha;render(r.data);}).catch(e=>toast(e.message,'error'));
  }

  function initCategories() {
    const form=$('[data-category-editor]');if(!form)return;
    let selectedSlug='',loadedCategory=null;
    const seoBlock=$('[data-category-seo]',form);function toggleSeo(){seoBlock.hidden=!form.elements.public_hub.checked;$('[data-category-url]',form).textContent='/cam-nang/'+(form.elements.slug.value||'slug')+'/';}
    form.elements.public_hub.addEventListener('change',toggleSeo);form.elements.slug.addEventListener('input',toggleSeo);
    const heading=$('[data-category-form-title]'),hint=$('[data-category-form-hint]');
    function resetEditor({create=false}={}) {
      selectedSlug='';loadedCategory=null;form.reset();form.elements.sha.value='';
      delete form.elements.slug.dataset.touched;toggleSeo();
      form.hidden=!create;
      heading.textContent=create?'Tạo chuyên mục':'Chọn chuyên mục hoặc tạo mới';
      hint.hidden=create;
      $$('[data-category-row]').forEach(row=>row.classList.remove('active'));
    }
    async function load(slug) {
      try {const r=await requestJson(`/admin/api/v2/content?kind=categories&slug=${encodeURIComponent(slug)}`);
        selectedSlug=slug;loadedCategory=structuredClone(r.data);
        form.hidden=false;heading.textContent='Sửa: '+r.data.name;hint.hidden=true;
        $$('[data-category-row]').forEach(row=>row.classList.toggle('active',row.dataset.slug===slug));
        setFormValue(form,'sha',r.sha);setFormValue(form,'name',r.data.name);setFormValue(form,'slug',r.data.slug);
        setFormValue(form,'description',r.data.description);setFormValue(form,'status',r.data.status);
        setFormValue(form,'public_hub',r.data.public_hub);setFormValue(form,'seo_title',r.data.seo?.title||'');setFormValue(form,'seo_description',r.data.seo?.description||'');toggleSeo();
        form.elements.slug.dataset.touched='1';
      } catch(e){toast(e.message,'error')}
    }
    $$('[data-category-row]').forEach(row=>row.addEventListener('click',()=>load(row.dataset.slug)));
    $('[data-new-category]')?.addEventListener('click',()=>resetEditor({create:true}));
    $('[data-category-reset]')?.addEventListener('click',()=>resetEditor());
    $('[data-category-search]')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();$$('[data-category-row]').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(q));});
    form.elements.name.addEventListener('input',()=>{if(!selectedSlug&&!form.elements.slug.dataset.touched)form.elements.slug.value=slugify(form.elements.name.value)});
    form.elements.slug.addEventListener('input',()=>form.elements.slug.dataset.touched='1');
    form.addEventListener('submit',async e=>{e.preventDefault();const slug=form.elements.slug.value.trim();
      const data={...(loadedCategory||{}),id:loadedCategory?.id||selectedSlug||slug,previous_slugs:loadedCategory?.previous_slugs||[],name:form.elements.name.value.trim(),slug,status:form.elements.status.value,description:form.elements.description.value.trim(),public_hub:form.elements.public_hub.checked,seo:{title:form.elements.seo_title.value.trim(),description:form.elements.seo_description.value.trim()}};
      try{await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'categories',slug:selectedSlug||data.id,sha:form.elements.sha.value||null,data,confirm_write:true})});toast('Đã lưu chuyên mục.');setTimeout(()=>location.reload(),450)}catch(err){toast(err.message,'error')}
    });
    resetEditor();
  }

  function initSettings(){
    const form=$('[data-settings-editor]');if(!form)return;
    let sha=null;
    const original=structuredClone(pageData.site||{});
    const menuRoot=$('[data-settings-menu]',form),footerRoot=$('[data-settings-footer]',form);
    const basicMenu=[['Trang chủ','/'],['Bánh phu thê','/banh-phu-the/'],['Mâm quả cưới','/mam-qua-cuoi/'],['Bánh phục linh','/banh-phuc-linh/'],['Cẩm nang','/cam-nang/'],['Liên hệ','/lien-he/']];
    const defaultFooter=[{type:'about',title:'Giới thiệu Shop',visible:true},{type:'contact',title:'Liên hệ đặt hàng',visible:true},{type:'channels',title:'Kênh chính thức',visible:true}];
    function menuRow(item={label:'',href:'',visible:true}){return `<div class="settings-repeat-row" data-menu-row><div class="form-grid two"><label>Tên mục<input data-menu-label value="${esc(item.label)}"></label><label>Đường dẫn<input data-menu-href value="${esc(item.href)}"></label></div><div class="settings-row-actions"><label class="check-row"><input type="checkbox" data-menu-visible ${item.visible!==false?'checked':''}> Hiển thị</label><button type="button" data-shift="up">↑</button><button type="button" data-shift="down">↓</button><button type="button" data-remove-settings-row>Xóa</button></div></div>`;}
    function footerRow(item={type:'links',title:'',visible:true,items:[]}){return `<div class="settings-repeat-row" data-footer-row><div class="form-grid two"><label>Tên nhóm<input data-footer-title value="${esc(item.title)}"></label><label>Loại nhóm<select data-footer-type>${[['about','Giới thiệu Shop'],['contact','Liên hệ'],['channels','Kênh chính thức'],['links','Liên kết tùy chỉnh']].map(([v,n])=>`<option value="${v}"${v===item.type?' selected':''}>${n}</option>`).join('')}</select></label></div><label>Liên kết (mỗi dòng: Tên | Đường dẫn)<textarea data-footer-items rows="3" placeholder="Hướng dẫn đặt hàng | /lien-he/">${esc((item.items||[]).map(x=>`${x.label} | ${x.url}`).join('\n'))}</textarea></label><div class="settings-row-actions"><label class="check-row"><input type="checkbox" data-footer-visible ${item.visible!==false?'checked':''}> Hiển thị</label><button type="button" data-shift="up">↑</button><button type="button" data-shift="down">↓</button><button type="button" data-remove-settings-row>Xóa</button></div></div>`;}
    menuRoot.innerHTML=(original.header?.menu||basicMenu.map(([label,href])=>({label,href,visible:true}))).map(menuRow).join('');
    footerRoot.innerHTML=(original.footer?.columns||defaultFooter).map(footerRow).join('');
    const tabButtons=$$('[data-settings-tab]',form),panels=$$('[data-settings-panel]',form);
    function tab(key){tabButtons.forEach(b=>b.classList.toggle('active',b.dataset.settingsTab===key));panels.forEach(p=>p.hidden=p.dataset.settingsPanel!==key);}
    tabButtons.forEach(b=>b.addEventListener('click',()=>tab(b.dataset.settingsTab)));
    tab('store');wireImageButtons(form,'site');
    function collectMenu(){return $$('[data-menu-row]',menuRoot).map(row=>({label:$('[data-menu-label]',row).value.trim(),href:$('[data-menu-href]',row).value.trim(),visible:$('[data-menu-visible]',row).checked})).filter(x=>x.label);}
    function collectFooter(){return $$('[data-footer-row]',footerRoot).map(row=>({type:$('[data-footer-type]',row).value,title:$('[data-footer-title]',row).value.trim(),visible:$('[data-footer-visible]',row).checked,items:$('[data-footer-items]',row).value.split('\n').map(s=>s.split('|').map(x=>x.trim())).filter(a=>a[0]&&a[1]).map(([label,url])=>({label,url}))})).filter(x=>x.title);}
    function preview(){
      const links=collectMenu().filter(x=>x.visible),cols=collectFooter().filter(x=>x.visible);
      const name=form.elements.name.value||'Shop Uyên Ương';
      $('[data-settings-live-preview]',form).innerHTML=`<strong>Xem nhanh cấu hình (không xuất bản)</strong><div><b>${esc(name)}</b> · ${links.map(x=>esc(x.label)).join(' · ')}</div><div>${cols.map(x=>esc(x.title)).join(' | ')}</div>`;
      $('[data-seo-preview-title]',form).textContent=form.elements.seo_title.value;
      $('[data-seo-preview-description]',form).textContent=form.elements.seo_description.value;
      const logo=$('[data-header-preview]',form);if(logo)logo.src=form.elements.header_logo.value;
    }
    function shift(btn){const row=btn.closest('.settings-repeat-row'),root=row?.parentElement;if(!row||!root)return;
      if(btn.dataset.shift==='up'&&row.previousElementSibling)root.insertBefore(row,row.previousElementSibling);
      if(btn.dataset.shift==='down'&&row.nextElementSibling)root.insertBefore(row.nextElementSibling,row);
    }
    form.addEventListener('click',e=>{
      const btn=e.target.closest('[data-shift],[data-remove-settings-row]');if(!btn)return;
      if(btn.hasAttribute('data-shift'))shift(btn);
      else if(confirm('Xóa mục này khỏi cấu hình?'))btn.closest('.settings-repeat-row')?.remove();
      preview();
    });
    $('[data-menu-add]',form).addEventListener('click',()=>{menuRoot.insertAdjacentHTML('beforeend',menuRow());preview();});
    $('[data-footer-add]',form).addEventListener('click',()=>{footerRoot.insertAdjacentHTML('beforeend',footerRow());preview();});
    form.elements.hotline.addEventListener('input',()=>{const digits=form.elements.hotline.value.replace(/\D/g,'');form.elements.hotline_display.value=digits.length===10?`${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7)}`:digits;});
    form.addEventListener('input',preview);form.addEventListener('change',preview);preview();
    requestJson('/admin/api/v2/content?kind=settings&slug=site').then(r=>sha=r.sha).catch(e=>toast(e.message,'error'));
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const fanpages=[0,1,2].map(n=>{const i=n+1;return{label:form.elements[`fanpage_${i}_label`].value.trim(),url:form.elements[`fanpage_${i}_url`].value.trim(),text:form.elements[`fanpage_${i}_text`].value.trim(),visible:form.elements[`fanpage_${i}_visible`].checked};}).filter(x=>x.label&&x.url);
      const data={...structuredClone(original),name:form.elements.name.value.trim(),address:form.elements.address.value.trim(),hotline:form.elements.hotline.value.trim(),hotline_display:form.elements.hotline_display.value.trim(),zalo:form.elements.zalo.value.trim(),fanpages,seo:{title:form.elements.seo_title.value.trim(),description:form.elements.seo_description.value.trim()},header:{logo:form.elements.header_logo.value.trim(),hotline_label:form.elements.header_hotline_label.value.trim(),zalo_label:form.elements.header_zalo_label.value.trim(),menu:collectMenu()},footer:{about:form.elements.footer_about.value.trim(),copyright:form.elements.footer_copyright.value.trim(),columns:collectFooter()}};
      try{const result=await requestJson('/admin/api/v2/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'settings',slug:'site',sha,data,confirm_write:true})});sha=result.sha||sha;toast('Cài đặt đã lưu. Website đang chờ build.');}
      catch(error){toast(error.message,'error');}
    });
  }

  function mediaCard(item){return `<button type="button" class="media-card" data-media-card data-group="${esc(item.group)}" data-name="${esc((item.name||'').toLowerCase())}" data-search="${esc((item.name||'').toLowerCase())}" data-url="${esc(item.url)}"><img src="${esc(item.url)}" alt=""><div><strong>${esc(item.name)}</strong><small>${esc(item.alt||'Chưa có Alt mặc định')}</small><small>${esc(item.group_label||item.group)}${Number.isFinite(item.usage_count)?` · Đang dùng ${item.usage_count} nơi`:''}${item.size?` · ${formatKb(item.size)}`:''}</small></div></button>`;}
  function initMedia(){
    const form=$('[data-media-upload]');if(!form)return;
    const file=form.elements.file,preview=$('[data-upload-preview]'),grid=$('[data-media-grid]'),empty=$('[data-media-empty]'),search=$('[data-media-search]'),filter=$('[data-media-filter]'),duplicate=$('[data-media-duplicate]'),submit=$('[data-media-submit]');
    let mediaItems=[];const dialog=$('[data-media-detail]');let editingImage=null;
    grid.addEventListener('click',e=>{const card=e.target.closest('[data-media-card]');if(!card)return;editingImage=mediaItems.find(x=>x.url===card.dataset.url);if(!editingImage)return;const img=$('[data-media-detail-preview]',dialog);img.src=editingImage.url;$('[data-media-file-info]',dialog).textContent=editingImage.name+' · '+formatKb(editingImage.size);$('[data-media-detail-alt]',dialog).value=editingImage.alt||'';$('[data-media-detail-caption]',dialog).value=editingImage.caption||'';dialog.showModal();});
    $$('[data-media-close]',dialog).forEach(b=>b.addEventListener('click',()=>dialog.close()));
    $('[data-media-save]',dialog)?.addEventListener('click',async()=>{if(!editingImage)return;const b=$('[data-media-save]',dialog);b.disabled=true;try{await requestJson('/admin/api/v2/media',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:editingImage.url,alt:$('[data-media-detail-alt]',dialog).value,caption:$('[data-media-detail-caption]',dialog).value})});dialog.close();toast('Đã lưu thuộc tính ảnh.');await refresh();}catch(err){toast(err.message,'error')}finally{b.disabled=false}});
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

  function orderRow(order) {
    const code = order.order_code || order.id;
    const name = order.customer_name || 'Khách hàng';
    const meta = [order.phone || '', order.receive_date ? `Nhận ${order.receive_date}` : ''].filter(Boolean).join(' · ');
    const status = order.status || 'new';
    return `<button type="button" class="order-row" data-order-id="${esc(order.id)}"><span><strong>${esc(code)} · ${esc(name)}</strong><small>${esc(meta || 'Chưa có thông tin liên hệ')}</small></span><span class="status status-${esc(status)}">${esc(orderLabels[status] || status)}</span></button>`;
  }

  function orderDescription(item) {
    const result=[];
    const amount=Number(item.quantity);
    if(item.option)result.push(String(item.option));
    if(Number.isFinite(amount)&&amount>0)result.push(`${amount} ${item.unit||''}`.trim());
    if(item.price_text)result.push(String(item.price_text));
    if(item.configuration && typeof item.configuration==='object') {
      const c=item.configuration;
      for(const [key,value] of Object.entries(c)) {
        if(value==null || value==='' || typeof value==='object')continue;
        if(!['quantity','unit','option','price_text'].includes(key)) result.push(`${key}: ${value}`);
      }
    }
    if(!result.length)result.push(item.summary||item.configuration_summary||'');
    return result.filter(Boolean).join(' · ');
  }
  function initOrders() {
    const list=$('[data-order-list]'),detail=$('[data-order-detail]');if(!list)return;
    const search=$('[data-order-search]'),status=$('[data-order-status]');
    const info=$('[data-order-page-info]'),prev=$('[data-order-prev]'),next=$('[data-order-next]');
    const pageSize=20;let offset=0,selected=null,timer,loadVersion=0;
    let requestedId=Number(new URLSearchParams(location.search).get('id'))||null;
    const displayDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.split('-').reverse().join('/'):v||'—';
    async function load(){const run=++loadVersion;const p=new URLSearchParams({limit:String(pageSize),offset:String(offset)});if(search.value.trim())p.set('search',search.value.trim());if(status.value)p.set('status',status.value);
      try{const r=await requestJson(`/admin/api/orders?${p}`);if(run!==loadVersion)return;
        const orders=r.orders||[],total=Number(r.total)||0;
        list.innerHTML=orders.length?orders.map(orderRow).join(''):'<div class="empty">Không có yêu cầu phù hợp.</div>';
        $$('[data-order-id]',list).forEach(btn=>btn.addEventListener('click',()=>show(Number(btn.dataset.orderId))));
        if(info)info.textContent=total?`${offset+1}–${offset+orders.length} / ${total} đơn`:'0 đơn';
        if(prev)prev.disabled=offset===0;if(next)next.disabled=offset+pageSize>=total;
        if(selected&&!orders.some(x=>x.id===selected)){selected=null;detail.innerHTML='<div class="empty">Chọn một yêu cầu để xem chi tiết.</div>';}
        if(requestedId){const id=requestedId;requestedId=null;await show(id);}
      }catch(e){if(run!==loadVersion)return;list.innerHTML='<div class="empty">Không thể tải yêu cầu đặt hàng.</div>';toast(e.message,'error')}
    }
    async function show(id){try{const r=await requestJson(`/admin/api/orders/${id}`);selected=id;
      $$('[data-order-id]',list).forEach(x=>x.classList.toggle('active',Number(x.dataset.orderId)===id));
      const o=r.order,items=o.items||[];
      detail.innerHTML=`<div class="section-head"><h2>Chi tiết yêu cầu</h2><span class="status status-${esc(o.status)}">${esc(orderLabels[o.status]||o.status)}</span></div><dl><dt>Mã đơn</dt><dd>${esc(o.order_code||o.id)}</dd><dt>Khách hàng</dt><dd>${esc(o.customer_name||'—')}</dd><dt>Số điện thoại</dt><dd><a href="tel:${esc(o.phone||'')}">${esc(o.phone||'—')}</a></dd><dt>Đặt lúc</dt><dd>${esc(o.created_at||'—')}</dd><dt>Ngày nhận</dt><dd>${esc(displayDate(o.receive_date))}</dd><dt>Địa chỉ</dt><dd>${esc(o.address||'—')}</dd><dt>Ghi chú</dt><dd>${esc(o.note||'—')}</dd></dl><h3>Sản phẩm</h3><ul class="order-items">${items.map(i=>`<li><strong>${esc(i.product_name||i.name||i.product_id||'Sản phẩm')}</strong><small>${esc(orderDescription(i))}</small></li>`).join('')||'<li>Không có dữ liệu sản phẩm.</li>'}</ul><form data-order-update><label>Trạng thái<select name="status">${Object.entries(orderLabels).map(([k,v])=>`<option value="${k}"${k===o.status?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Ghi chú nội bộ<textarea name="internal_note" rows="3">${esc(o.internal_note||'')}</textarea></label><div class="form-actions"><a class="button button-secondary" href="tel:${esc(o.phone||'')}">Gọi</a><a class="button button-secondary" href="https://zalo.me/${esc(String(o.phone||'').replace(/\D/g,''))}" target="_blank" rel="noopener">Nhắn Zalo</a><button class="button button-primary">Lưu</button></div></form>`;
      $('[data-order-update]',detail).addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;
        if(f.elements.status.value!==o.status&&['completed','cancelled'].includes(f.elements.status.value)&&!confirm(`Xác nhận chuyển đơn ${o.order_code||o.id} sang ${orderLabels[f.elements.status.value]}?`))return;
        const save=f.querySelector('button[type="submit"],button.button-primary');save.disabled=true;
        try{await requestJson(`/admin/api/orders/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:f.elements.status.value,internal_note:f.elements.internal_note.value.trim(),expected_updated_at:o.updated_at||''})});toast('Đã cập nhật yêu cầu.');await load();await show(id)}
        catch(err){toast(err.message,'error');if(err.status===409||err.current_sha)await show(id)}
        finally{save.disabled=false}
      });
    }catch(e){toast(e.message,'error')}}
    search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{offset=0;load()},250)});
    status.addEventListener('change',()=>{offset=0;load()});
    prev?.addEventListener('click',()=>{offset=Math.max(0,offset-pageSize);load()});
    next?.addEventListener('click',()=>{offset+=pageSize;load()});
    $('[data-order-refresh]')?.addEventListener('click',load);load();
  }

  function initDashboard(){if(pageData.page!=='dashboard')return;Promise.allSettled([requestJson('/admin/api/orders/summary'),requestJson('/admin/api/orders?limit=3')]).then(results=>{const sum=results[0].status==='fulfilled'?results[0].value:null;const orders=results[1].status==='fulfilled'?results[1].value.orders||[]:[];if(sum)$('[data-order-new]').textContent=sum.stats?.new??'—';else { $('[data-order-new]').textContent='—'; $('[data-order-new]').title='Không tải được dữ liệu đơn hàng'; }const root=$('[data-dashboard-orders]');if(root){root.classList.remove('empty');root.innerHTML=orders.length?orders.map(o=>`<a class="order-row" href="/admin/orders/?id=${encodeURIComponent(o.id)}" aria-label="Mở đơn ${esc(o.order_code||o.id)}"><span><strong>${esc(o.order_code||o.id)} · ${esc(o.customer_name||'Khách hàng')}</strong><small>${esc(o.receive_date?'Nhận '+o.receive_date:'')}</small></span><span class="status status-${esc(o.status)}">${esc(orderLabels[o.status]||o.status)}</span></a>`).join(''):'<div class="empty compact">Chưa có yêu cầu mới.</div>';}});}

  initListFilters(); initProductEditor(); initArticleEditor(); initCategories(); initSettings(); initMedia(); initOrders(); initDashboard();
})();
