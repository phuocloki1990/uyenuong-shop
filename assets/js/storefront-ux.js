(function(){
'use strict';
const catalog=window.UUCMS?.products;
if(!catalog)return;
const cartKey='uyen_uong_cart_v3';
// Scroll reveal without hiding content when JS is unavailable.
if('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches){
  const io=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    entry.target.classList.add('uu-reveal');
    io.unobserve(entry.target);
  }),{threshold:0.1,rootMargin:'0px 0px -24px 0px'});
  document.querySelectorAll('.need-card,.product-card,.article-card,.step,.home-faq').forEach(el=>io.observe(el));
}
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('vi-VN')+'đ';
const modal=document.createElement('div');modal.className='uu-dialog';modal.hidden=true;
modal.innerHTML='<section class="uu-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="uu-dialog-title"><div class="uu-dialog-top"><h2 id="uu-dialog-title">Chọn sản phẩm</h2><button type="button" class="uu-dialog-close" aria-label="Đóng cửa sổ">×</button></div><div class="uu-dialog-product"></div><form class="uu-dialog-form"><div class="uu-dialog-fields"></div><p class="notice uu-dialog-price" aria-live="polite"></p><p class="uu-dialog-status" aria-live="polite"></p><div class="uu-dialog-actions"><button type="submit" class="btn btn-secondary">Thêm vào giỏ</button><button type="button" class="btn btn-primary" data-uu-buy>Đặt ngay</button></div></form></section>';
document.body.append(modal);
const form=modal.querySelector('form'),fields=modal.querySelector('.uu-dialog-fields'),summary=modal.querySelector('.uu-dialog-price'),status=modal.querySelector('.uu-dialog-status');
let current,previousFocus;
function close(){modal.hidden=true;document.body.classList.remove('uu-modal-open');previousFocus?.focus();}
modal.querySelector('.uu-dialog-close').addEventListener('click',close);
modal.addEventListener('click',e=>{if(e.target===modal)close();});
document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key==='Tab'){const focusable=[...modal.querySelectorAll('button,input,select,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
function selected(){const fd=new FormData(form);return {options:Object.fromEntries(current.option_groups.map(g=>[g.key,String(fd.get(g.key)||'')])),qty:Number(fd.get('qty'))};}
function price(){const {options,qty}=selected();const valid=current.option_groups.every(g=>g.values.includes(options[g.key]))&&Number.isInteger(qty)&&qty>=current.quantity.min&&(qty-current.quantity.min)%current.quantity.step===0;
const amount=valid?window.UUCMS.quote(current,options,qty):null;summary.textContent=valid?(amount===null?'Giá liên hệ. Shop sẽ xác nhận giá theo quy cách và số lượng.':`Tổng theo quy cách đã chọn: ${money(amount)}.`):'Vui lòng chọn đủ quy cách và số lượng hợp lệ.';status.textContent='';}
function show(id){const p=catalog[id];if(!p||p.status!=='published')return;current=p;previousFocus=document.activeElement;modal.querySelector('#uu-dialog-title').textContent='Chọn '+p.name;modal.querySelector('.uu-dialog-product').innerHTML=`<img src="${safe(p.image)}" alt="${safe(p.name)}"><div><strong>${safe(p.name)}</strong><p>${safe(p.short_description||'')}</p><a href="/san-pham/${encodeURIComponent(p.slug)}.html">Xem thông tin chi tiết →</a></div>`;
fields.innerHTML=p.option_groups.map((g,i)=>`<div class="field"><label for="uu-option-${i}">${safe(g.label)}</label><select required id="uu-option-${i}" name="${safe(g.key)}"><option value="">-- Chọn --</option>${g.values.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('')}</select></div>`).join('')+`<div class="field"><label for="uu-quantity">${safe(p.quantity.label||'Số lượng')}</label><input id="uu-quantity" type="number" name="qty" min="${Number(p.quantity.min)}" step="${Number(p.quantity.step)}" value="${Number(p.quantity.default)}" required><small>${safe(p.quantity.hint||'')}</small></div>`;
modal.hidden=false;document.body.classList.add('uu-modal-open');price();modal.querySelector('.uu-dialog-close').focus();}
document.addEventListener('click',e=>{const button=e.target.closest('[data-quick-add]');if(button)show(button.dataset.quickAdd);});
form.addEventListener('input',price);form.addEventListener('change',price);
function commit(){if(!form.reportValidity())return false;const {options,qty}=selected();const q=current.quantity;if(!current.option_groups.every(g=>g.values.includes(options[g.key]))||!Number.isInteger(qty)||qty<q.min||(qty-q.min)%q.step){status.textContent='Vui lòng kiểm tra quy cách và số lượng.';return false;}
try{const raw=JSON.parse(localStorage.getItem(cartKey)||'[]');const cart=Array.isArray(raw)?raw:[];const key=JSON.stringify([current.id,Object.entries(options).sort(),qty])+':'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());cart.push({id:current.id,name:current.name,image:current.image,options,wrap:options.wrap||'',flavor:options.flavor||'',variant:Object.values(options).join(' · '),qty,minQty:q.min,stepQty:q.step,price:current.price_mode==='fixed'?current.base_price:0,priceText:'Giá liên hệ',key});localStorage.setItem(cartKey,JSON.stringify(cart));document.querySelectorAll('[data-cart-count]').forEach(el=>{el.textContent=String(cart.length);el.classList.remove('uu-cart-bump');void el.offsetWidth;el.classList.add('uu-cart-bump');});window.dispatchEvent(new CustomEvent('uu:cart-changed'));status.textContent='Đã thêm sản phẩm vào giỏ hàng.';return true;}catch(e){status.textContent='Chưa lưu được giỏ hàng. Vui lòng thử lại.';return false;}}
form.addEventListener('submit',e=>{e.preventDefault();commit();});modal.querySelector('[data-uu-buy]').addEventListener('click',()=>{if(commit())window.location.href='/dat-hang.html';});
})();
