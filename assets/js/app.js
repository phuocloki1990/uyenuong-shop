(function(){
  const CART_KEY='uyen_uong_cart_v2';
  const products={
    phuthe:{id:'phuthe',name:'Bánh phu thê',image:'/assets/images/Anh1.jpg'},
    mamqua:{id:'mamqua',name:'Mâm quả cưới',image:'/assets/images/mam-qua-cuoi-1.jpg'},
    phuclinh:{id:'phuclinh',name:'Bánh phục linh',image:'/assets/images/banh-phuc-linh-1.jpg'}
  };
  function money(n){return Number(n||0).toLocaleString('vi-VN')+'đ'}
  function getCart(){try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]')}catch(e){return[]}}
  function saveCart(cart){localStorage.setItem(CART_KEY,JSON.stringify(cart));updateCartCount()}
  function updateCartCount(){const count=getCart().reduce((s,i)=>s+Number(i.qty||0),0);document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=count)}
  function itemLabel(i){return i.variant||[i.size,i.wrap].filter(Boolean).join(' · ')||'Theo yêu cầu'}
  function itemPrice(i){return Number(i.price)>0?money(Number(i.price)*Number(i.qty||1)):(i.priceText||'Shop xác nhận')}
  function addCart(item){const cart=getCart();const key=[item.id,item.variant||'',item.size||'',item.wrap||''].join('|');const found=cart.find(i=>i.key===key);if(found)found.qty+=item.qty;else cart.push({...item,key});saveCart(cart)}
  function removeCart(key){saveCart(getCart().filter(i=>i.key!==key));renderCart()}
  function updateQty(key,qty){const cart=getCart();const item=cart.find(i=>i.key===key);if(item){item.qty=Math.max(1,Number(qty)||1);saveCart(cart);renderCart()}}
  function cartTotal(){return getCart().reduce((s,i)=>s+(Number(i.price)||0)*(Number(i.qty)||0),0)}
  function toggleMenu(){document.getElementById('mobileMenu')?.classList.toggle('open')}
  window.toggleMenu=toggleMenu;
  document.addEventListener('click',e=>{const menu=document.getElementById('mobileMenu'),btn=document.querySelector('.menu-btn');if(innerWidth<=740&&menu?.classList.contains('open')&&!menu.contains(e.target)&&!btn?.contains(e.target))menu.classList.remove('open')});

  document.querySelectorAll('[data-thumb]').forEach(btn=>btn.addEventListener('click',()=>{const main=document.getElementById('mainProductImage');if(main)main.src=btn.dataset.thumb;document.querySelectorAll('[data-thumb]').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}));
  document.querySelectorAll('[data-qty-minus]').forEach(b=>b.addEventListener('click',()=>{const input=b.parentElement.querySelector('input');input.value=Math.max(1,(Number(input.value)||1)-1)}));
  document.querySelectorAll('[data-qty-plus]').forEach(b=>b.addEventListener('click',()=>{const input=b.parentElement.querySelector('input');input.value=(Number(input.value)||1)+1}));

  const productForm=document.getElementById('product-purchase');
  if(productForm){
    function buildItem(){
      const fd=new FormData(productForm),id=productForm.dataset.product,base=products[id],qty=Math.max(1,Number(fd.get('qty'))||1);
      if(id==='phuthe'){
        const size=fd.get('size'),wrap=fd.get('wrap');
        return{id,name:base.name,image:base.image,size,wrap,variant:[size,wrap].join(' · '),qty,price:0,priceText:'Shop xác nhận theo số lượng'};
      }
      if(id==='mamqua'){
        const pkg=fd.get('package');
        return{id,name:base.name,image:base.image,variant:pkg,qty,price:0,priceText:'Giá liên hệ'};
      }
      if(id==='phuclinh'){
        const select=productForm.querySelector('select[name="package"]'),opt=select.options[select.selectedIndex],pkg=fd.get('package'),price=Number(opt.dataset.price||0);
        return{id,name:base.name,image:base.image,variant:pkg,qty,price,priceText:price?'':'Giá liên hệ'};
      }
      return{id,name:base.name,image:base.image,variant:'Theo yêu cầu',qty,price:0,priceText:'Shop xác nhận'};
    }
    productForm.querySelector('[data-add-cart]')?.addEventListener('click',()=>{addCart(buildItem());const btn=productForm.querySelector('[data-add-cart]'),old=btn.textContent;btn.textContent='Đã thêm vào giỏ';setTimeout(()=>btn.textContent=old,1400)});
    productForm.querySelector('[data-buy-now]')?.addEventListener('click',()=>{const item=buildItem();sessionStorage.setItem('uyen_uong_buy_now',JSON.stringify([item]));location.href='/dat-hang.html?source=buy-now'});
  }

  function renderCart(){
    const list=document.getElementById('cart-list'),empty=document.getElementById('cart-empty'),summary=document.getElementById('cart-summary');if(!list)return;
    const cart=getCart();list.innerHTML='';
    if(!cart.length){empty.hidden=false;summary.hidden=true;return}empty.hidden=true;summary.hidden=false;
    cart.forEach(item=>{const el=document.createElement('div');el.className='cart-item';el.innerHTML=`<img src="${item.image}" alt="${item.name}"><div><h3>${item.name}</h3><p>${itemLabel(item)}</p><div class="cart-item-controls"><input class="mini-qty" type="number" min="1" value="${item.qty}" aria-label="Số lượng"><button class="remove-btn" type="button">Xóa</button></div></div><div class="cart-item-price">${itemPrice(item)}</div>`;el.querySelector('input').addEventListener('change',e=>updateQty(item.key,e.target.value));el.querySelector('.remove-btn').addEventListener('click',()=>removeCart(item.key));list.appendChild(el)});
    const total=cartTotal(),totalEl=document.querySelector('[data-cart-total]');if(totalEl)totalEl.textContent=total?money(total):'Shop xác nhận';
  }
  renderCart();

  function getCheckoutItems(){const params=new URLSearchParams(location.search);if(params.get('source')==='buy-now'){try{return JSON.parse(sessionStorage.getItem('uyen_uong_buy_now')||'[]')}catch(e){return[]}}return getCart()}
  const orderForm=document.getElementById('order-form');
  if(orderForm){
    const params=new URLSearchParams(location.search),items=getCheckoutItems(),wrap=document.getElementById('selected-products');
    if(items.length){items.forEach(i=>{const d=document.createElement('div');d.className='selected-product';d.innerHTML=`<div class="selected-product-head"><div><strong>${i.name}</strong><p>${itemLabel(i)} · SL ${i.qty}</p></div><strong>${itemPrice(i)}</strong></div>`;wrap.appendChild(d)})}
    else if(params.get('product')){const p=products[params.get('product')];if(p){const d=document.createElement('div');d.className='selected-product';d.innerHTML=`<strong>${p.name}</strong><p>Chọn chi tiết bên dưới.</p>`;wrap.appendChild(d);document.querySelector(`[data-option="${p.id}"] input[type="checkbox"]`)?.click()}}
    else{wrap.innerHTML='<p class="muted">Chưa có sản phẩm từ giỏ hàng. Bạn vẫn có thể chọn món bên dưới.</p>'}
    document.querySelectorAll('.order-option input[type="checkbox"]').forEach(cb=>cb.addEventListener('change',()=>cb.closest('.order-option').classList.toggle('open',cb.checked)));
    const receive=document.querySelector('input[name="receive_date"]');if(receive){const tomorrow=new Date(Date.now()+86400000);receive.min=tomorrow.toISOString().slice(0,10)}
    orderForm.addEventListener('submit',async e=>{
      e.preventDefault();const fd=new FormData(orderForm);let lines=['YÊU CẦU ĐẶT HÀNG - SHOP UYÊN ƯƠNG',''];
      items.forEach(i=>lines.push(`- ${i.name}: ${itemLabel(i)} | SL ${i.qty}`));
      if(fd.get('want_mamqua'))lines.push(`- Mâm quả cưới: ${fd.get('mamqua_option')||'chưa chọn gói'}`);
      if(fd.get('want_phuthe'))lines.push(`- Bánh phu thê: ${fd.get('phuthe_region')||''}, ${fd.get('phuthe_wrap')||''}, SL ${fd.get('phuthe_qty')||''}`);
      if(fd.get('want_phuclinh'))lines.push(`- Bánh phục linh: ${fd.get('phuclinh_package')||''}`);
      lines.push('',`Khách hàng: ${fd.get('name')}`,`SĐT: ${fd.get('phone')}`,`Ngày nhận: ${fd.get('receive_date')}`,`Địa chỉ: ${fd.get('address')}`,`Ghi chú: ${fd.get('note')||'Không có'}`);
      const text=lines.join('\n'),preview=document.getElementById('order-preview');preview.textContent=text;preview.classList.add('show');
      try{await navigator.clipboard.writeText(text);document.getElementById('copy-status').textContent='Đã sao chép nội dung đơn hàng.'}catch(err){document.getElementById('copy-status').textContent='Bạn có thể sao chép nội dung bên trên.'}
      document.getElementById('order-success').classList.add('show');
    });
  }
  updateCartCount();
})();
