(function(){
  const CART_KEY='uyen_uong_cart_v3';
  const TELEGRAM_BOT_TOKEN='8681052924:AAHp19-sUlvkV3OSoKLDx7lIxH8bMj8X7v0';
  const TELEGRAM_CHAT_ID='779623814';
  const products={
    phuthe:{id:'phuthe',name:'Bánh phu thê',image:'/assets/images/Anh1.jpg'},
    phuthehue:{id:'phuthehue',name:'Bánh phu thê Huế',image:'/assets/images/Anh1.jpg'},
    phuthebac:{id:'phuthebac',name:'Bánh phu thê miền Bắc',image:'/assets/images/Banner.jpg'},
    mamqua:{id:'mamqua',name:'Mâm quả cưới hỏi',image:'/assets/images/mam-qua-cuoi-1.jpg'},
    phuclinh:{id:'phuclinh',name:'Bánh phục linh',image:'/assets/images/banh-phuc-linh-1.jpg'}
  };

  function money(n){return Number(n||0).toLocaleString('vi-VN')+'đ'}
  function phucLinhPrice(flavor,qty){
    qty=Number(qty)||0;
    if(flavor==='2 vị'&&qty===30)return 180000;
    if(flavor==='2 vị'&&qty===50)return 230000;
    return 0;
  }
  function getCart(){try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]')}catch(e){return[]}}
  function saveCart(cart){localStorage.setItem(CART_KEY,JSON.stringify(cart));updateCartCount()}
  function updateCartCount(){const count=getCart().reduce((s,i)=>s+Number(i.qty||0),0);document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=count)}
  function itemLabel(i){return i.variant||[i.size,i.wrap].filter(Boolean).join(' · ')||'Theo yêu cầu'}
  function itemPrice(i){
    if(i.id==='phuclinh'&&i.flavor){const p=phucLinhPrice(i.flavor,i.qty);return p?money(p):'Giá liên hệ'}
    return Number(i.price)>0?money(Number(i.price)*Number(i.qty||1)):(i.priceText||'Shop xác nhận')
  }
  function addCart(item){const cart=getCart();const key=[item.id,item.variant||'',item.size||'',item.wrap||'',item.flavor||''].join('|');const found=cart.find(i=>i.key===key);if(found){
      if(item.id==='phuclinh'&&item.flavor)found.qty=Number(found.qty||0)+Number(item.qty||0);
      else found.qty+=item.qty;
    }else cart.push({...item,key});saveCart(cart)}
  function removeCart(key){saveCart(getCart().filter(i=>i.key!==key));renderCart()}
  function updateQty(key,qty){const cart=getCart();const item=cart.find(i=>i.key===key);if(item){const min=Number(item.minQty||1);item.qty=Math.max(min,Number(qty)||min);saveCart(cart);renderCart()}}
  function cartTotal(){return getCart().reduce((s,i)=>{if(i.id==='phuclinh'&&i.flavor)return s+phucLinhPrice(i.flavor,i.qty);return s+(Number(i.price)||0)*(Number(i.qty)||0)},0)}
  function hasUnknownPrice(){return getCart().some(i=>{if(i.id==='phuclinh'&&i.flavor)return !phucLinhPrice(i.flavor,i.qty);return !(Number(i.price)>0)})}
  function toggleMenu(){document.getElementById('mobileMenu')?.classList.toggle('open')}
  window.toggleMenu=toggleMenu;
  document.addEventListener('click',e=>{const menu=document.getElementById('mobileMenu'),btn=document.querySelector('.menu-btn');if(innerWidth<=740&&menu?.classList.contains('open')&&!menu.contains(e.target)&&!btn?.contains(e.target))menu.classList.remove('open')});

  document.querySelectorAll('[data-thumb]').forEach(btn=>btn.addEventListener('click',()=>{const main=document.getElementById('mainProductImage');if(main)main.src=btn.dataset.thumb;document.querySelectorAll('[data-thumb]').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}));
  document.querySelectorAll('[data-qty-minus]').forEach(b=>b.addEventListener('click',()=>{const input=b.parentElement.querySelector('input');const min=Number(input.min||1);input.value=Math.max(min,(Number(input.value)||min)-1);input.dispatchEvent(new Event('input',{bubbles:true}))}));
  document.querySelectorAll('[data-qty-plus]').forEach(b=>b.addEventListener('click',()=>{const input=b.parentElement.querySelector('input');const min=Number(input.min||1);input.value=Math.max(min,(Number(input.value)||min)+1);input.dispatchEvent(new Event('input',{bubbles:true}))}));

  const productForm=document.getElementById('product-purchase');
  if(productForm){
    const productId=productForm.dataset.product;
    const productPriceHint=document.getElementById('product-phuclinh-price');
    function updateProductPhucLinhPrice(){
      if(productId!=='phuclinh'||!productPriceHint)return;
      const flavor=productForm.querySelector('[name="flavor"]')?.value||'';
      const qty=Number(productForm.querySelector('[name="qty"]')?.value||0);
      const price=phucLinhPrice(flavor,qty);
      productPriceHint.textContent=price?`${flavor} · ${qty} cái: ${money(price)}.`:`${flavor||'Bánh phục linh'} · ${qty||0} cái: Giá liên hệ. Shop sẽ báo giá khi xác nhận.`;
    }
    productForm.querySelector('[name="flavor"]')?.addEventListener('change',updateProductPhucLinhPrice);
    productForm.querySelector('[name="qty"]')?.addEventListener('input',updateProductPhucLinhPrice);
    updateProductPhucLinhPrice();

    function buildItem(){
      const fd=new FormData(productForm),id=productId,base=products[id],qty=Math.max(Number(productForm.querySelector('input[name="qty"]')?.min||1),Number(fd.get('qty'))||1);
      if(id==='phuthe'||id==='phuthehue'||id==='phuthebac'){
        const wrap=fd.get('wrap');
        return{id,name:base.name,image:base.image,wrap,variant:[wrap].filter(Boolean).join(' · ')||'Theo yêu cầu',qty,minQty:20,price:0,priceText:'Giá liên hệ'};
      }
      if(id==='mamqua'){
        const pkg=fd.get('package');
        return{id,name:base.name,image:base.image,variant:pkg,qty,minQty:1,price:0,priceText:'Giá liên hệ'};
      }
      if(id==='phuclinh'){
        const flavor=fd.get('flavor')||'2 vị',price=phucLinhPrice(flavor,qty);
        return{id,name:base.name,image:base.image,flavor,variant:`${flavor} · ${qty} cái`,qty,minQty:1,price,priceText:price?'':'Giá liên hệ'};
      }
      return{id,name:base.name,image:base.image,variant:'Theo yêu cầu',qty,minQty:1,price:0,priceText:'Shop xác nhận'};
    }
    productForm.querySelector('[data-add-cart]')?.addEventListener('click',()=>{addCart(buildItem());const btn=productForm.querySelector('[data-add-cart]'),old=btn.textContent;btn.textContent='Đã thêm vào giỏ';setTimeout(()=>btn.textContent=old,1400)});
    productForm.querySelector('[data-buy-now]')?.addEventListener('click',()=>{const item=buildItem();sessionStorage.setItem('uyen_uong_buy_now',JSON.stringify([item]));location.href='/dat-hang.html?source=buy-now'});
  }

  function renderCart(){
    const list=document.getElementById('cart-list'),empty=document.getElementById('cart-empty'),summary=document.getElementById('cart-summary');if(!list)return;
    const cart=getCart();list.innerHTML='';
    if(!cart.length){empty.hidden=false;summary.hidden=true;return}empty.hidden=true;summary.hidden=false;
    cart.forEach(item=>{const el=document.createElement('div');el.className='cart-item';const min=Number(item.minQty||1);const qtyLabel=item.id==='phuclinh'&&item.flavor?'Số bánh':'Số lượng';el.innerHTML=`<img src="${item.image}" alt="${item.name}"><div><h3>${item.name}</h3><p>${itemLabel(item)}</p><div class="cart-item-controls"><span class="small">${qtyLabel}:</span><input class="mini-qty" type="number" min="${min}" value="${item.qty}" aria-label="Số lượng"><button class="remove-btn" type="button">Xóa</button></div></div><div class="cart-item-price">${itemPrice(item)}</div>`;el.querySelector('input').addEventListener('change',e=>updateQty(item.key,e.target.value));el.querySelector('.remove-btn').addEventListener('click',()=>removeCart(item.key));list.appendChild(el)});
    const total=cartTotal(),unknown=hasUnknownPrice(),totalEl=document.querySelector('[data-cart-total]'),label=document.querySelector('.summary-row.total span:first-child');
    if(totalEl){if(total&&unknown)totalEl.textContent=money(total)+' + món chờ báo giá';else if(total)totalEl.textContent=money(total);else totalEl.textContent='Shop xác nhận'}
    if(label)label.textContent=unknown?'Tạm tính':'Tổng cộng';
  }
  renderCart();

  function getCheckoutItems(){const params=new URLSearchParams(location.search);if(params.get('source')==='buy-now'){try{return JSON.parse(sessionStorage.getItem('uyen_uong_buy_now')||'[]')}catch(e){return[]}}return getCart()}
  const orderForm=document.getElementById('order-form');
  if(orderForm){
    const params=new URLSearchParams(location.search),items=getCheckoutItems(),wrap=document.getElementById('selected-products');
    if(items.length){items.forEach(i=>{const d=document.createElement('div');d.className='selected-product';const qtyText=(i.id==='phuclinh'&&i.flavor)?'':` · SL ${i.qty}`;d.innerHTML=`<div class="selected-product-head"><div><strong>${i.name}</strong><p>${itemLabel(i)}${qtyText}</p></div><strong>${itemPrice(i)}</strong></div>`;wrap.appendChild(d)})}
    else if(params.get('product')){const p=products[params.get('product')];if(p){const d=document.createElement('div');d.className='selected-product';d.innerHTML=`<strong>${p.name}</strong><p>Chọn chi tiết bên dưới.</p>`;wrap.appendChild(d);document.querySelector(`[data-option="${p.id}"] input[type="checkbox"]`)?.click()}}
    else{wrap.innerHTML='<p class="muted">Chưa có sản phẩm từ giỏ hàng. Bạn vẫn có thể chọn món bên dưới.</p>'}

    document.querySelectorAll('.order-option input[type="checkbox"]').forEach(cb=>cb.addEventListener('change',()=>{
      const option=cb.closest('.order-option');option.classList.toggle('open',cb.checked);
      option.querySelectorAll('select,input[type="number"]').forEach(el=>{el.required=cb.checked});
    }));

    const phutheRegion=document.getElementById('phuthe-region'),phutheWrap=document.getElementById('phuthe-wrap');
    function syncPhutheWrap(){
      if(!phutheRegion||!phutheWrap)return;
      const region=phutheRegion.value;
      if(region==='Huế')phutheWrap.innerHTML='<option value="">-- Chọn kiểu đóng gói --</option><option value="Hộp giấy">Hộp giấy</option><option value="Lá dừa">Lá dừa</option>';
      else if(region==='Miền Bắc')phutheWrap.innerHTML='<option value="Hộp giấy">Hộp giấy</option>';
      else phutheWrap.innerHTML='<option value="">-- Chọn dòng bánh trước --</option>';
    }
    phutheRegion?.addEventListener('change',syncPhutheWrap);syncPhutheWrap();

    const plFlavor=document.getElementById('phuclinh-flavor'),plQty=document.getElementById('phuclinh-qty'),plHint=document.getElementById('phuclinh-price-hint');
    function updateCheckoutPhucLinhPrice(){
      if(!plHint)return;
      const flavor=plFlavor?.value||'',qty=Number(plQty?.value||0),price=phucLinhPrice(flavor,qty);
      if(!flavor||!qty)plHint.textContent='Nhập số lượng để xem giá nếu trùng đúng quy cách đang niêm yết.';
      else if(price)plHint.textContent=`Giá niêm yết cho ${flavor} · ${qty} cái: ${money(price)}.`;
      else plHint.textContent=`${flavor} · ${qty} cái chưa có giá niêm yết. Shop sẽ báo giá khi xác nhận.`;
    }
    plFlavor?.addEventListener('change',updateCheckoutPhucLinhPrice);plQty?.addEventListener('input',updateCheckoutPhucLinhPrice);updateCheckoutPhucLinhPrice();

    const receive=document.querySelector('input[name="receive_date"]');if(receive){const tomorrow=new Date(Date.now()+86400000);receive.min=tomorrow.toISOString().slice(0,10)}
    orderForm.addEventListener('submit',async e=>{
      e.preventDefault();
      if(!orderForm.reportValidity())return;
      const fd=new FormData(orderForm);let lines=['YÊU CẦU ĐẶT HÀNG - SHOP UYÊN ƯƠNG',''];
      items.forEach(i=>{const qtyText=(i.id==='phuclinh'&&i.flavor)?'':` | SL ${i.qty}`;lines.push(`- ${i.name}: ${itemLabel(i)}${qtyText} | ${itemPrice(i)}`)});
      if(fd.get('want_mamqua'))lines.push(`- Mâm quả cưới: ${fd.get('mamqua_option')||'chưa chọn gói'} | Giá liên hệ`);
      if(fd.get('want_phuthe')){
        const qty=Number(fd.get('phuthe_qty')||0);if(qty<20){alert('Bánh phu thê nhận đặt tối thiểu 20 bánh.');return}
        lines.push(`- Bánh phu thê: ${fd.get('phuthe_region')}, ${fd.get('phuthe_wrap')}, ${qty} bánh | Giá liên hệ`);
      }
      if(fd.get('want_phuclinh')){
        const flavor=fd.get('phuclinh_flavor'),qty=Number(fd.get('phuclinh_qty')||0),price=phucLinhPrice(flavor,qty);
        lines.push(`- Bánh phục linh: ${flavor}, ${qty} cái | ${price?money(price):'Giá liên hệ'}`);
      }
      lines.push('',`Khách hàng: ${fd.get('name')}`,`SĐT: ${fd.get('phone')}`,`Ngày nhận: ${fd.get('receive_date')}`,`Địa chỉ: ${fd.get('address')}`,`Ghi chú: ${fd.get('note')||'Không có'}`);
      const text=lines.join('\n'),preview=document.getElementById('order-preview');preview.textContent=text;preview.classList.add('show');
      const status=document.getElementById('copy-status');

      let telegramOk=false;
      try{
        const res=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({chat_id:TELEGRAM_CHAT_ID,text})
        });
        telegramOk=res.ok;
      }catch(err){telegramOk=false}

      if(telegramOk){
        status.textContent='Yêu cầu đã được gửi tự động đến Shop qua Telegram. Shop sẽ liên hệ lại để xác nhận.';
      }else{
        try{await navigator.clipboard.writeText(text);status.textContent='Không gửi tự động được. Nội dung đã được sao chép, hãy mở Zalo và gửi giúp shop nhé.'}catch(err){status.textContent='Không gửi tự động được. Hãy sao chép nội dung yêu cầu phía trên rồi gửi qua Zalo.'}
      }
      document.getElementById('order-success').classList.add('show');
    });
  }
  updateCartCount();
})();
(function () {
  const form = document.getElementById('order-form');
  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const successBox = document.getElementById('order-success');
  const modal = document.getElementById('order-confirm-modal');
  const closeBtn = document.getElementById('close-order-confirm');

  let submitting = false;
  let confirmed = false;

  // Khóa ngay khi khách bấm gửi để tránh bấm liên tục
  form.addEventListener('submit', function (event) {
    if (submitting || confirmed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    submitting = true;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang gửi yêu cầu...';
    }
  }, true);

  function showOrderConfirmed() {
    if (confirmed) return;

    confirmed = true;
    submitting = false;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '✓ Yêu cầu đã được gửi';
    }

    // Xóa giỏ hàng sau khi đơn đã gửi thành công
    localStorage.removeItem('uyen_uong_cart_v3');
    sessionStorage.removeItem('uyen_uong_buy_now');

    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = '0';
    });

    if (modal) {
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('order-modal-open');
    }
  }

  // Theo dõi box thành công hiện có.
  // Telegram gửi thành công -> app.js hiện .show -> popup xuất hiện.
  if (successBox) {
    const observer = new MutationObserver(function () {
      if (successBox.classList.contains('show')) {
        showOrderConfirmed();
      }
    });

    observer.observe(successBox, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Phòng trường hợp success đã hiện trước khi observer chạy
    if (successBox.classList.contains('show')) {
      showOrderConfirmed();
    }
  }

  function closeModal() {
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('order-modal-open');

    // Sau khi đóng popup, kéo tới box xác nhận để khách vẫn thấy trạng thái
    successBox?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  closeBtn?.addEventListener('click', closeModal);

  modal?.querySelector('.order-confirm-backdrop')
    ?.addEventListener('click', closeModal);
})();
