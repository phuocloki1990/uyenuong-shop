(() => {
  'use strict';

  const CART_KEY = 'uyen_uong_cart_v4';
  const ORDER_REQUEST_KEY = 'uyen_uong_order_request_v2';
  const catalog = window.UYEN_UONG_PRODUCTS || {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  const menuButton = document.querySelector('.menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (menuButton && mobileMenu) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!open));
      menuButton.setAttribute('aria-label', open ? 'Mở menu' : 'Đóng menu');
      mobileMenu.hidden = open;
    });
    mobileMenu.addEventListener('click', event => {
      if (event.target.closest('a')) {
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Mở menu');
        mobileMenu.hidden = true;
      }
    });
  }

  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && typeof item === 'object' && typeof item.product_id === 'string' && catalog[item.product_id]);
    } catch {
      return [];
    }
  }

  function saveCart(cart, { preserveRequestId = false } = {}) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    if (!preserveRequestId) sessionStorage.removeItem(ORDER_REQUEST_KEY);
    updateCartCount();
  }

  function updateCartCount() {
    const count = readCart().length;
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = String(count); });
  }

  function newLineId() {
    return globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function optionLabel(group, selected) {
    if (!selected) return '';
    const selectedId = typeof selected === 'object' ? selected.id : selected;
    const option = group.options.find(item => item.id === selectedId);
    if (!option) return '';
    const custom = typeof selected === 'object' ? String(selected.custom_text || '').trim() : '';
    return `${option.label}${custom ? ` – ${custom}` : ''}`;
  }

  function componentLabel(product, selected) {
    const component = product.components.find(item => item.id === selected.id);
    if (!component) return '';
    let label = component.label;
    if (component.sub_option) {
      const raw = selected.sub_options?.[component.sub_option.id];
      const sub = optionLabel(component.sub_option, raw);
      if (sub) label += ` (${sub})`;
    }
    const custom = String(selected.custom_text || '').trim();
    if (custom) label += `: ${custom}`;
    return label;
  }

  function formatMoney(amount) {
    return `${new Intl.NumberFormat('vi-VN').format(Number(amount || 0))}đ`;
  }

  function quotedPrice(product, quantity, configuration = {}) {
    if (!product?.price) return 'Giá liên hệ';
    if (product.price.mode === 'fixed') return product.price.display_text;
    if (product.price.mode !== 'hybrid') return product.price.display_text;
    const rules = Array.isArray(product.price.rules) ? product.price.rules : [];
    const rule = rules.find(item => {
      const selected = configuration.options?.[item.option_group];
      const optionId = typeof selected === 'object' ? selected?.id : selected;
      return optionId === item.option_id && Number(quantity) === Number(item.quantity);
    });
    return rule ? formatMoney(rule.amount) : product.price.display_text;
  }

  function itemDisplay(item) {
    const product = catalog[item.product_id];
    if (!product) return { title: 'Sản phẩm', detail: '', subdetail: '', quantityText: '', price: 'Giá liên hệ' };
    const config = item.configuration || {};
    if (product.type === 'composite') {
      const components = Array.isArray(config.components) ? config.components : [];
      const labels = components.map(component => componentLabel(product, component)).filter(Boolean);
      return {
        title: product.name,
        detail: `${components.length} lễ vật đã chọn`,
        subdetail: labels.join(' · '),
        quantityText: '',
        price: product.price.display_text
      };
    }
    const parts = [];
    for (const group of product.option_groups || []) {
      const label = optionLabel(group, config.options?.[group.id]);
      if (label) parts.push(`${group.name}: ${label}`);
    }
    const quantity = Number(item.quantity || product.quantity?.default_value || 1);
    const unit = product.quantity?.unit || 'sản phẩm';
    return {
      title: product.name,
      detail: parts.join(' · ') || 'Theo yêu cầu',
      subdetail: '',
      quantityText: product.quantity?.enabled ? `Số lượng: ${quantity} ${unit}` : '',
      price: quotedPrice(product, quantity, config)
    };
  }

  updateCartCount();

  document.querySelectorAll('[data-gallery-src]').forEach(button => {
    button.addEventListener('click', () => {
      const gallery = button.closest('.product-gallery');
      const main = gallery?.querySelector('.main-image img');
      if (!main) return;
      main.src = button.dataset.gallerySrc;
      gallery.querySelectorAll('.thumb').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    });
  });

  function selectedOptionText(fieldset) {
    const checked = fieldset.querySelector('input[type=radio]:checked');
    if (!checked) return '';
    const label = checked.dataset.optionLabel || checked.value;
    if (checked.dataset.custom !== 'true') return label;
    const custom = fieldset.querySelector('.custom-option-input')?.value.trim();
    return custom ? `${label}: ${custom}` : label;
  }

  function updateOptionCustomField(fieldset) {
    const checked = fieldset.querySelector('input[type=radio]:checked');
    const customInput = fieldset.querySelector('.custom-option-input');
    if (!customInput) return;
    const show = checked?.dataset.custom === 'true';
    customInput.hidden = !show;
    customInput.disabled = !show;
  }

  function updateComposite(form) {
    const checks = [...form.querySelectorAll('input[name=component]')];
    const selected = checks.filter(input => input.checked);
    const badge = form.querySelector('[data-derived-count]');
    if (badge) badge.textContent = `${selected.length} mâm`;
    for (const check of checks) {
      const item = check.closest('.component-item');
      if (!item) continue;
      item.classList.toggle('selected', check.checked);
      const subOption = item.querySelector('[data-component-sub-option]');
      if (subOption) {
        subOption.hidden = !check.checked;
        subOption.querySelectorAll('input').forEach(input => { input.disabled = !check.checked; });
      }
      const custom = item.querySelector('.custom-component-input');
      if (custom) {
        const show = check.checked && check.value === 'khac';
        custom.hidden = !show;
        custom.disabled = !show;
      }
    }
  }

  function compositeSummary(form) {
    const selected = [...form.querySelectorAll('input[name=component]:checked')];
    if (!selected.length) return 'Chưa chọn lễ vật';
    const parts = selected.map(check => {
      const item = check.closest('.component-item');
      let label = check.dataset.componentLabel || check.value;
      const sub = item?.querySelector('[data-component-sub-option] input:checked:not(:disabled)');
      if (sub?.dataset.optionLabel) label += ` (${sub.dataset.optionLabel})`;
      if (check.value === 'khac') {
        const custom = item?.querySelector('.custom-component-input')?.value.trim();
        if (custom) label += `: ${custom}`;
      }
      return label;
    });
    return `${selected.length} mâm · ${parts.join(' · ')}`;
  }

  function variantOrSimpleSummary(form) {
    const parts = [];
    form.querySelectorAll('[data-option-group]').forEach(fieldset => {
      const value = selectedOptionText(fieldset);
      if (value) parts.push(`${fieldset.dataset.groupLabel}: ${value}`);
    });
    const quantity = form.querySelector('[data-quantity-field] input[type=number]');
    if (quantity) {
      const unit = quantity.closest('[data-quantity-field]')?.dataset.unit || '';
      parts.push(`Số lượng: ${quantity.value}${unit ? ` ${unit}` : ''}`);
    }
    return parts.join(' · ') || 'Sẵn sàng để chọn';
  }

  function updateSummary(form) {
    const target = form.querySelector('[data-summary-detail]');
    if (!target) return;
    target.textContent = form.dataset.productType === 'composite' ? compositeSummary(form) : variantOrSimpleSummary(form);
    const product = catalog[form.dataset.productId];
    if (!product) return;
    let price = product.price?.display_text || 'Giá liên hệ';
    if (product.type !== 'composite') {
      const options = {};
      form.querySelectorAll('[data-option-group]').forEach(fieldset => {
        const checked = fieldset.querySelector('input[type=radio]:checked');
        if (checked) options[checked.name] = { id: checked.value };
      });
      const quantityInput = form.querySelector('[data-quantity-field] input[type=number]');
      const quantity = Number(quantityInput?.value || product.quantity?.default_value || 1);
      price = quotedPrice(product, quantity, { options });
    }
    const summaryPrice = form.querySelector('[data-summary-price]');
    const productPrice = form.closest('.product-config')?.querySelector('[data-product-price]');
    if (summaryPrice) summaryPrice.textContent = price;
    if (productPrice) productPrice.textContent = price;
  }

  document.querySelectorAll('form[data-product-form]').forEach(form => {
    form.querySelectorAll('[data-option-group]').forEach(fieldset => updateOptionCustomField(fieldset));
    if (form.dataset.productType === 'composite') updateComposite(form);
    updateSummary(form);

    form.addEventListener('change', event => {
      if (event.target.matches('[data-option-group] input[type=radio]')) {
        const fieldset = event.target.closest('[data-option-group]');
        if (fieldset) updateOptionCustomField(fieldset);
      }
      if (event.target.matches('input[name=component]')) updateComposite(form);
      updateSummary(form);
    });

    form.addEventListener('input', event => {
      if (event.target.matches('input[type=number]')) {
        const min = Math.max(1, Number(event.target.min || 1));
        if (event.target.value !== '' && Number(event.target.value) < min) event.target.value = String(min);
      }
      updateSummary(form);
    });
  });

  document.querySelectorAll('[data-qty-change]').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.parentElement?.querySelector('input[type=number]');
      if (!input) return;
      const step = Math.max(1, Number(input.step || 1));
      const min = Math.max(1, Number(input.min || 1));
      const delta = Number(button.dataset.qtyChange) * step;
      const current = Number(input.value || min);
      if (delta < 0 && current <= min) {
        const form = button.closest('form[data-product-form]');
        if (form) showProductMessage(form, `Tối thiểu ${min} ${form.querySelector('[data-quantity-field]')?.dataset.unit || 'sản phẩm'}.`);
      }
      input.value = String(Math.max(min, current + delta));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  document.querySelectorAll('[data-qty-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const field = button.closest('[data-quantity-field]');
      const input = field?.querySelector('input[type=number]');
      if (!input) return;
      input.value = String(button.dataset.qtyPreset);
      field.querySelectorAll('[data-qty-preset]').forEach(item => item.classList.toggle('active', item === button));
      input.dispatchEvent(new Event('input', { bubbles:true }));
    });
  });

  function showProductMessage(form, message, isError = false) {
    const note = form.querySelector('[data-cart-action-note]');
    if (!note) return;
    note.textContent = message;
    note.hidden = false;
    note.classList.toggle('error', isError);
  }

  function collectProductItem(form) {
    const product = catalog[form.dataset.productId];
    if (!product) throw new Error('Sản phẩm chưa sẵn sàng để thêm vào giỏ.');
    const configuration = {};
    let quantity = 1;

    if (product.type === 'composite') {
      const components = [];
      for (const check of form.querySelectorAll('input[name=component]:checked')) {
        const component = product.components.find(item => item.id === check.value);
        if (!component) continue;
        const item = { id: component.id };
        if (component.sub_option) {
          const input = check.closest('.component-item')?.querySelector(`[data-component-sub-option] input[name="${component.id}_${component.sub_option.id}"]:checked:not(:disabled)`);
          if (!input) throw new Error(`Vui lòng chọn ${component.sub_option.name.toLowerCase()} cho ${component.label}.`);
          item.sub_options = { [component.sub_option.id]: { id: input.value } };
        }
        if (component.allow_custom_text) {
          const custom = check.closest('.component-item')?.querySelector('.custom-component-input')?.value.trim();
          if (!custom) throw new Error(`Vui lòng ghi rõ ${component.label.toLowerCase()}.`);
          item.custom_text = custom;
        }
        components.push(item);
      }
      if (!components.length) throw new Error('Vui lòng chọn ít nhất một lễ vật.');
      configuration.components = components;
      quantity = components.length;
      const receiveDate = form.querySelector('input[name=receive_date]')?.value || '';
      if (receiveDate) configuration.receive_date = receiveDate;
    } else {
      const options = {};
      for (const fieldset of form.querySelectorAll('[data-option-group]')) {
        const checked = fieldset.querySelector('input[type=radio]:checked');
        if (!checked) throw new Error(`Vui lòng chọn ${fieldset.dataset.groupLabel || 'lựa chọn sản phẩm'}.`);
        const selected = { id: checked.value };
        if (checked.dataset.custom === 'true') {
          const custom = fieldset.querySelector('.custom-option-input')?.value.trim();
          if (!custom) throw new Error(`Vui lòng ghi rõ ${fieldset.dataset.groupLabel?.toLowerCase() || 'lựa chọn khác'}.`);
          selected.custom_text = custom;
        }
        options[fieldset.querySelector('input[type=radio]')?.name || fieldset.dataset.groupLabel] = selected;
      }
      configuration.options = options;
      const quantityInput = form.querySelector('[data-quantity-field] input[type=number]');
      if (quantityInput) {
        quantity = Number(quantityInput.value);
        const min = Number(quantityInput.min || 1);
        const step = Number(quantityInput.step || 1);
        if (!Number.isInteger(quantity) || quantity < min || (quantity - min) % step !== 0) throw new Error('Số lượng không hợp lệ.');
      }
    }

    const note = form.querySelector('textarea[name=note]')?.value.trim() || '';
    if (note) configuration.note = note;

    return { line_id: newLineId(), product_id: product.id, quantity, configuration };
  }

  document.querySelectorAll('[data-add-to-cart]').forEach(button => {
    button.addEventListener('click', () => {
      const form = button.closest('form[data-product-form]');
      if (!form) return;
      try {
        const item = collectProductItem(form);
        const cart = readCart();
        cart.push(item);
        saveCart(cart);
        showProductMessage(form, 'Đã thêm vào giỏ hàng.');
      } catch (error) {
        showProductMessage(form, error.message || 'Chưa thể thêm sản phẩm.', true);
      }
    });
  });

  function editControlHtml(item, product) {
    const config = item.configuration || {};
    if (product.type === 'composite') {
      const selectedIds = new Set((config.components || []).map(component => component.id));
      const components = product.components.map(component => {
        const selected = (config.components || []).find(item => item.id === component.id) || {};
        const sub = component.sub_option ? `<select data-edit-sub="${esc(component.id)}" ${selectedIds.has(component.id) ? '' : 'disabled'}>${component.sub_option.options.map(option => `<option value="${esc(option.id)}"${selected.sub_options?.[component.sub_option.id]?.id === option.id ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select>` : '';
        const custom = component.allow_custom_text ? `<input data-edit-custom="${esc(component.id)}" value="${esc(selected.custom_text || '')}" placeholder="${esc(component.custom_placeholder || 'Ghi rõ…')}" ${selectedIds.has(component.id) ? '' : 'disabled'}>` : '';
        return `<div class="cart-edit-component"><label><input type="checkbox" data-edit-component value="${esc(component.id)}"${selectedIds.has(component.id) ? ' checked' : ''}> ${esc(component.label)}</label>${sub}${custom}</div>`;
      }).join('');
      return `<div class="cart-edit-components">${components}</div><label>Ghi chú<textarea data-edit-note maxlength="1000">${esc(config.note || '')}</textarea></label>`;
    }

    const optionGroups = (product.option_groups || []).map(group => {
      const selected = config.options?.[group.id];
      const selectedId = typeof selected === 'object' ? selected.id : selected;
      const option = group.options.find(value => value.id === selectedId) || group.options[0];
      const select = `<label>${esc(group.name)}<select data-edit-option="${esc(group.id)}">${group.options.map(value => `<option value="${esc(value.id)}"${value.id === option?.id ? ' selected' : ''}>${esc(value.label)}</option>`).join('')}</select></label>`;
      const customOption = option?.allow_custom_text ? `<label data-edit-custom-wrap="${esc(group.id)}">Ghi rõ<input data-edit-option-custom="${esc(group.id)}" value="${esc(typeof selected === 'object' ? selected.custom_text || '' : '')}"></label>` : `<label data-edit-custom-wrap="${esc(group.id)}" hidden>Ghi rõ<input data-edit-option-custom="${esc(group.id)}"></label>`;
      return select + customOption;
    }).join('');
    const quantity = product.quantity?.enabled ? `<label>Số lượng<input type="number" data-edit-quantity min="${Number(product.quantity.min_value || 1)}" step="${Number(product.quantity.step || 1)}" value="${Number(item.quantity || product.quantity.default_value || 1)}"></label>` : '';
    return `${optionGroups}${quantity}<label>Ghi chú<textarea data-edit-note maxlength="1000">${esc(config.note || '')}</textarea></label>`;
  }

  function cartItemHtml(item) {
    const product = catalog[item.product_id];
    const display = itemDisplay(item);
    const quantityControl = product.type !== 'composite' && product.quantity?.enabled
      ? `<div class="cart-line-quantity" aria-label="Số lượng"><button type="button" data-cart-qty="-1" aria-label="Giảm số lượng">−</button><strong>${Number(item.quantity || 1)}</strong><button type="button" data-cart-qty="1" aria-label="Tăng số lượng">+</button></div>`
      : '';
    return `<article class="cart-item" data-cart-line="${esc(item.line_id)}"><img class="cart-thumb" src="${esc(product.main_image)}" alt=""><div class="cart-item-body"><div class="cart-item-head"><div><h2>${esc(display.title)}</h2><p>${esc(display.detail)}</p>${display.subdetail ? `<small>${esc(display.subdetail)}</small>` : ''}${display.quantityText ? `<small>${esc(display.quantityText)}</small>` : ''}</div><div class="cart-item-side">${quantityControl}<strong>${esc(display.price)}</strong></div></div><div class="cart-item-actions"><details class="cart-edit"><summary>${product.type === 'composite' ? 'Sửa lễ vật' : 'Sửa lựa chọn'}</summary><div class="cart-edit-form">${editControlHtml(item, product)}<div class="cart-edit-actions"><button type="button" class="btn btn-primary btn-small" data-save-line>Lưu thay đổi</button></div></div></details><button type="button" class="text-danger" data-remove-line>Xóa</button></div></div></article>`;
  }

  function collectEditedItem(container, current) {
    const product = catalog[current.product_id];
    const configuration = {};
    let quantity = 1;
    if (product.type === 'composite') {
      const components = [];
      for (const check of container.querySelectorAll('[data-edit-component]:checked')) {
        const component = product.components.find(item => item.id === check.value);
        if (!component) continue;
        const clean = { id: component.id };
        if (component.sub_option) {
          const sub = container.querySelector(`[data-edit-sub="${component.id}"]`);
          if (!sub?.value) throw new Error(`Vui lòng chọn ${component.sub_option.name.toLowerCase()} cho ${component.label}.`);
          clean.sub_options = { [component.sub_option.id]: { id: sub.value } };
        }
        if (component.allow_custom_text) {
          const custom = container.querySelector(`[data-edit-custom="${component.id}"]`)?.value.trim();
          if (!custom) throw new Error(`Vui lòng ghi rõ ${component.label.toLowerCase()}.`);
          clean.custom_text = custom;
        }
        components.push(clean);
      }
      if (!components.length) throw new Error('Vui lòng chọn ít nhất một lễ vật.');
      configuration.components = components;
      quantity = components.length;
    } else {
      const options = {};
      for (const group of product.option_groups || []) {
        const select = container.querySelector(`[data-edit-option="${group.id}"]`);
        if (!select?.value) throw new Error(`Vui lòng chọn ${group.name}.`);
        const option = group.options.find(value => value.id === select.value);
        const selected = { id: select.value };
        if (option?.allow_custom_text) {
          const custom = container.querySelector(`[data-edit-option-custom="${group.id}"]`)?.value.trim();
          if (!custom) throw new Error(`Vui lòng ghi rõ ${group.name.toLowerCase()}.`);
          selected.custom_text = custom;
        }
        options[group.id] = selected;
      }
      configuration.options = options;
      const qty = container.querySelector('[data-edit-quantity]');
      if (qty) {
        quantity = Number(qty.value);
        const min = Number(qty.min || 1);
        const step = Number(qty.step || 1);
        if (!Number.isInteger(quantity) || quantity < min || (quantity - min) % step !== 0) throw new Error('Số lượng không hợp lệ.');
      }
    }
    const note = container.querySelector('[data-edit-note]')?.value.trim() || '';
    if (note) configuration.note = note;
    return { ...current, quantity, configuration };
  }

  function bindCartEditDependencies(root) {
    root.querySelectorAll('[data-edit-component]').forEach(check => {
      check.addEventListener('change', () => {
        const row = check.closest('.cart-edit-component');
        row?.querySelectorAll('select,input[data-edit-custom]').forEach(input => { input.disabled = !check.checked; });
      });
    });
    root.querySelectorAll('[data-edit-option]').forEach(select => {
      select.addEventListener('change', () => {
        const line = select.closest('[data-cart-line]');
        const product = catalog[readCart().find(item => item.line_id === line?.dataset.cartLine)?.product_id];
        const group = product?.option_groups?.find(item => item.id === select.dataset.editOption);
        const option = group?.options.find(item => item.id === select.value);
        const wrap = line?.querySelector(`[data-edit-custom-wrap="${select.dataset.editOption}"]`);
        if (wrap) wrap.hidden = !option?.allow_custom_text;
      });
    });
  }

  function renderCartPage() {
    const root = document.querySelector('[data-cart-page]');
    if (!root) return;
    const cart = readCart();
    const list = root.querySelector('[data-cart-list]');
    const empty = root.querySelector('[data-cart-empty]');
    const summary = root.querySelector('[data-cart-summary]');
    if (!cart.length) {
      list.innerHTML = '';
      empty.hidden = false;
      summary.hidden = true;
      return;
    }
    empty.hidden = true;
    summary.hidden = false;
    list.innerHTML = cart.map(cartItemHtml).join('');
    root.querySelector('[data-cart-line-count]').textContent = String(cart.length);
    const summaryCount = root.querySelector('[data-cart-summary-count]');
    if (summaryCount) summaryCount.textContent = String(cart.length);
    bindCartEditDependencies(root);
  }

  document.addEventListener('click', event => {
    const quickQty = event.target.closest('[data-cart-qty]');
    if (quickQty) {
      const line = quickQty.closest('[data-cart-line]')?.dataset.cartLine;
      const cart = readCart();
      const index = cart.findIndex(item => item.line_id === line);
      if (index >= 0) {
        const product = catalog[cart[index].product_id];
        const min = Number(product?.quantity?.min_value || 1);
        const step = Number(product?.quantity?.step || 1);
        const delta = Number(quickQty.dataset.cartQty || 0) * step;
        cart[index].quantity = Math.max(min, Number(cart[index].quantity || min) + delta);
        saveCart(cart);
        renderCartPage();
        renderCheckoutPage();
      }
      return;
    }
    const remove = event.target.closest('[data-remove-line]');
    if (remove) {
      const line = remove.closest('[data-cart-line]')?.dataset.cartLine;
      saveCart(readCart().filter(item => item.line_id !== line));
      renderCartPage();
      renderCheckoutPage();
      return;
    }
    const save = event.target.closest('[data-save-line]');
    if (save) {
      const container = save.closest('[data-cart-line]');
      const lineId = container?.dataset.cartLine;
      const cart = readCart();
      const index = cart.findIndex(item => item.line_id === lineId);
      if (index < 0) return;
      try {
        cart[index] = collectEditedItem(container, cart[index]);
        saveCart(cart);
        renderCartPage();
      } catch (error) {
        const area = save.closest('.cart-edit-form');
        let message = area.querySelector('.edit-error');
        if (!message) {
          message = document.createElement('p');
          message.className = 'edit-error';
          message.setAttribute('role', 'alert');
          area.prepend(message);
        }
        message.textContent = error.message || 'Không thể lưu thay đổi.';
      }
    }
  });

  function checkoutItemHtml(item, compact = false) {
    const product = catalog[item.product_id];
    const display = itemDisplay(item);
    const actions = compact ? '' : `<div class="checkout-item-actions"><a href="/gio-hang/">Sửa</a><button type="button" data-remove-line>Xóa</button></div>`;
    return `<div class="checkout-item${compact ? ' compact' : ''}"${compact ? '' : ` data-cart-line="${esc(item.line_id)}"`}><img src="${esc(product.main_image)}" alt=""><div><strong>${esc(display.title)}</strong><p>${esc(display.detail)}</p>${display.quantityText ? `<small>${esc(display.quantityText)}</small>` : ''}${actions}</div><span>${esc(display.price)}</span></div>`;
  }

  function todayLocalISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function isValidVietnamPhone(value) {
    const normalized = String(value || '').trim().replace(/[\s.()-]/g, '');
    return /^(?:0\d{9}|\+84\d{9})$/.test(normalized);
  }

  function renderCheckoutPage() {
    const root = document.querySelector('[data-checkout-default]');
    if (!root) return;
    const cart = readCart();
    const items = root.querySelector('[data-checkout-items]');
    const empty = root.querySelector('[data-checkout-empty]');
    const summary = root.querySelector('[data-order-summary-items]');
    items.innerHTML = cart.map(item => checkoutItemHtml(item)).join('');
    summary.innerHTML = cart.map(item => checkoutItemHtml(item, true)).join('');
    empty.hidden = cart.length > 0;
    root.querySelector('[data-order-line-count]').textContent = String(cart.length);
    const form = root.querySelector('[data-order-form]');
    const submit = root.querySelector('[data-order-submit]');
    if (submit) submit.disabled = cart.length === 0;
    const dateInput = form?.elements.receive_date;
    if (dateInput) {
      const today = todayLocalISO();
      dateInput.min = today;
      if (!dateInput.value) {
        const carried = cart.map(item => item.configuration?.receive_date).find(Boolean);
        if (carried && carried >= today) dateInput.value = carried;
      }
      if (dateInput.value && dateInput.value < today) dateInput.value = '';
    }
  }

  function orderRequestId() {
    let value = sessionStorage.getItem(ORDER_REQUEST_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(ORDER_REQUEST_KEY, value);
    }
    return value;
  }

  const orderForm = document.querySelector('[data-order-form]');
  if (orderForm) {
    const phoneInput = orderForm.elements.phone;
    const dateInput = orderForm.elements.receive_date;
    const dateHint = orderForm.querySelector('[data-order-date-hint]');
    const submit = orderForm.querySelector('[data-order-submit]');
    const submitDefaultHtml = submit?.innerHTML || 'Gửi yêu cầu đặt hàng';

    const fieldError = field => orderForm.querySelector(`[data-field-error="${CSS.escape(field.name)}"]`);
    const clearFieldError = field => {
      field.removeAttribute('aria-invalid');
      const error = fieldError(field);
      if (error) { error.textContent = ''; error.hidden = true; }
    };
    const setFieldError = (field, message) => {
      field.setAttribute('aria-invalid', 'true');
      const error = fieldError(field);
      if (error) { error.textContent = message; error.hidden = false; }
    };
    const validatePhone = () => {
      if (!phoneInput) return true;
      const valid = isValidVietnamPhone(phoneInput.value);
      phoneInput.setCustomValidity(valid ? '' : 'Vui lòng nhập số điện thoại hợp lệ, ví dụ 0901234567.');
      return valid;
    };
    const updateUrgentDateHint = () => {
      if (!dateInput || !dateHint) return;
      dateHint.classList.remove('warning');
      dateHint.textContent = 'Shop khuyến nghị đặt trước 3–5 ngày.';
      if (!dateInput.value) return;
      const today = new Date(`${todayLocalISO()}T00:00:00`);
      const selected = new Date(`${dateInput.value}T00:00:00`);
      const days = Math.round((selected - today) / 86400000);
      if (days >= 0 && days < 3) {
        dateHint.textContent = 'Ngày nhận khá gấp. Shop sẽ xác nhận khả năng chuẩn bị sau khi nhận yêu cầu.';
        dateHint.classList.add('warning');
      }
    };
    const validateField = field => {
      clearFieldError(field);
      if (field === phoneInput) validatePhone();
      if (field.validity.valid) return true;
      let message = field.validationMessage || 'Vui lòng kiểm tra thông tin này.';
      if (field.validity.valueMissing) message = 'Vui lòng nhập thông tin này.';
      if (field === phoneInput && !isValidVietnamPhone(field.value)) message = 'Vui lòng nhập số điện thoại hợp lệ, ví dụ 0901234567.';
      setFieldError(field, message);
      return false;
    };

    for (const field of orderForm.querySelectorAll('input,textarea,select')) {
      field.addEventListener('input', () => {
        clearFieldError(field);
        if (field === phoneInput) field.setCustomValidity('');
        if (field === dateInput) updateUrgentDateHint();
      });
      field.addEventListener('blur', () => {
        if (field.required || field === phoneInput) validateField(field);
      });
    }
    dateInput?.addEventListener('change', updateUrgentDateHint);
    updateUrgentDateHint();

    orderForm.addEventListener('submit', async event => {
      event.preventDefault();
      const cart = readCart();
      const errorBox = orderForm.querySelector('[data-order-error]');
      if (!cart.length) {
        errorBox.textContent = 'Giỏ hàng đang trống.';
        errorBox.hidden = false;
        return;
      }
      const fields = [...orderForm.querySelectorAll('input,textarea,select')].filter(field => field.required || field === phoneInput);
      const invalidFields = fields.filter(field => !validateField(field));
      const firstInvalid = invalidFields[0];
      if (firstInvalid) {
        errorBox.textContent = 'Vui lòng kiểm tra lại các thông tin được đánh dấu.';
        errorBox.hidden = false;
        firstInvalid.focus();
        return;
      }
      errorBox.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Đang gửi…';
      const body = {
        request_id: orderRequestId(),
        customer_name: orderForm.elements.customer_name.value,
        phone: orderForm.elements.phone.value,
        address: orderForm.elements.address.value,
        receive_date: orderForm.elements.receive_date.value,
        note: orderForm.elements.note.value,
        items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity, configuration: item.configuration }))
      };
      try {
        const response = await fetch('/api/v2/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 429 || result.code === 'rate_limited') {
          document.querySelector('[data-checkout-default]').hidden = true;
          document.querySelector('[data-order-rate-limit]').hidden = false;
          return;
        }
        if (!response.ok || !result.success) throw new Error(result.message || 'Không thể gửi yêu cầu đặt hàng.');
        saveCart([], { preserveRequestId: true });
        sessionStorage.removeItem(ORDER_REQUEST_KEY);
        document.querySelector('[data-checkout-default]').hidden = true;
        document.querySelector('[data-order-success]').hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        errorBox.textContent = error.message || 'Không thể gửi yêu cầu đặt hàng. Vui lòng thử lại.';
        errorBox.hidden = false;
      } finally {
        submit.disabled = false;
        submit.innerHTML = submitDefaultHtml;
      }
    });
  }

  document.querySelector('[data-return-order]')?.addEventListener('click', () => {
    document.querySelector('[data-order-rate-limit]').hidden = true;
    document.querySelector('[data-checkout-default]').hidden = false;
  });

  const facebookSection = document.querySelector('[data-facebook-section]');
  const facebookPosts = facebookSection?.querySelector('[data-facebook-posts]');
  const facebookPageLink = facebookSection?.querySelector('[data-facebook-page-link]');

  function safeExternalUrl(value, { facebookOnly = false } = {}) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:') return '';
      if (facebookOnly && !/(^|\.)facebook\.com$/i.test(url.hostname)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function facebookExcerpt(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'Xem bài viết mới của Shop trên Facebook.';
    return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
  }

  function facebookDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }).format(date);
  }

  async function loadFacebookLatest() {
    if (!facebookSection || !facebookPosts || !facebookPageLink) return;
    try {
      const response = await fetch('/api/facebook-latest', { headers:{ Accept:'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      const posts = Array.isArray(payload?.posts) ? payload.posts.slice(0, 2) : [];
      const rendered = posts.map(post => {
        const permalink = safeExternalUrl(post?.permalink_url, { facebookOnly:true });
        if (!permalink) return '';
        const image = safeExternalUrl(post?.image);
        const date = facebookDate(post?.created_time);
        const copy = facebookExcerpt(post?.message);
        return `<article class="home-facebook-post${image ? '' : ' no-image'}">${image ? `<a class="home-facebook-image" href="${esc(permalink)}" target="_blank" rel="noopener" aria-label="Xem bài viết trên Facebook"><img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>` : ''}<div class="home-facebook-body">${date ? `<time datetime="${esc(post.created_time)}">${esc(date)}</time>` : ''}<p>${esc(copy)}</p><a class="home-facebook-link" href="${esc(permalink)}" target="_blank" rel="noopener">Xem bài trên Facebook →</a></div></article>`;
      }).filter(Boolean);
      if (!rendered.length) return;
      const pageUrl = safeExternalUrl(payload?.page_url, { facebookOnly:true });
      if (!pageUrl) return;
      facebookPosts.innerHTML = rendered.join('');
      facebookPageLink.href = pageUrl;
      facebookSection.hidden = false;
    } catch {
      // Fanpage là nội dung bổ sung: nếu API lỗi, giữ Home nguyên vẹn và không hiện thông báo kỹ thuật.
    }
  }

  loadFacebookLatest();

  const quickModal = document.querySelector('[data-quick-modal]');
  const quickTitle = quickModal?.querySelector('[data-quick-title]');
  const quickDesc = quickModal?.querySelector('[data-quick-desc]');
  const quickOptions = quickModal?.querySelector('[data-quick-options]');
  const quickQuantity = quickModal?.querySelector('[data-quick-quantity]');
  const quickUnit = quickModal?.querySelector('[data-quick-unit]');
  const quickDetail = quickModal?.querySelector('[data-quick-detail]');
  const quickPrice = quickModal?.querySelector('[data-quick-price]');
  const quickNote = quickModal?.querySelector('[data-quick-note]');
  let quickProductId = null;
  let quickReturnFocus = null;

  function quickConfiguration() {
    const options = {};
    quickOptions?.querySelectorAll('[data-quick-group]').forEach(group => {
      const selected = group.querySelector('input[type=radio]:checked');
      if (selected) options[selected.name.replace(/^quick_/, '')] = { id: selected.value };
    });
    return { options };
  }

  function updateQuickPrice() {
    const product = catalog[quickProductId];
    if (!product || !quickPrice) return;
    const quantity = Number(quickQuantity?.value || product.quantity?.default_value || 1);
    quickPrice.textContent = quotedPrice(product, quantity, quickConfiguration());
  }

  function closeQuickModal() {
    if (!quickModal || quickModal.hidden) return;
    quickModal.hidden = true;
    quickProductId = null;
    document.body.classList.remove('modal-open');
    const returnTarget = quickReturnFocus;
    quickReturnFocus = null;
    if (returnTarget && document.contains(returnTarget)) returnTarget.focus();
  }

  function openQuickModal(productId) {
    if (!quickModal) return;
    const product = catalog[productId];
    if (!product || product.type === 'composite') return;
    quickReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    quickProductId = productId;
    quickTitle.textContent = product.name;
    quickDesc.textContent = product.short_description || '';
    quickDetail.href = `/${product.slug}/`;
    quickQuantity.min = String(product.quantity?.min_value || 1);
    quickQuantity.step = String(product.quantity?.step || 1);
    quickQuantity.value = String(product.quantity?.default_value || 1);
    quickUnit.textContent = product.quantity?.unit || '';
    quickOptions.innerHTML = (product.option_groups || []).map(group => {
      const hasDefault = group.options.some(option => option.default);
      const rows = group.options.map((option,index) => `<label><input type="radio" name="quick_${esc(group.id)}" value="${esc(option.id)}" data-quick-option-label="${esc(option.label)}" data-quick-custom="${option.allow_custom_text ? 'true' : 'false'}"${option.default || (!hasDefault && index === 0) ? ' checked' : ''}><span>${esc(option.label)}</span></label>`).join('');
      const custom = group.options.some(option => option.allow_custom_text) ? `<input class="quick-modal-custom" type="text" data-quick-custom-input="${esc(group.id)}" placeholder="${esc(group.options.find(option => option.allow_custom_text)?.custom_placeholder || 'Ghi rõ lựa chọn…')}" hidden>` : '';
      return `<fieldset class="option-group" data-quick-group="${esc(group.id)}"><legend>${esc(group.name)}</legend><div class="quick-modal-options">${rows}</div>${custom}</fieldset>`;
    }).join('');
    quickNote.hidden = true;
    quickModal.hidden = false;
    document.body.classList.add('modal-open');
    updateQuickPrice();
    quickModal.querySelector('.quick-modal-close, input, button, a')?.focus();
  }

  document.querySelectorAll('[data-home-quick-add]').forEach(button => {
    button.addEventListener('click', () => openQuickModal(button.dataset.homeQuickAdd));
  });
  quickModal?.querySelectorAll('[data-quick-close]').forEach(el => el.addEventListener('click', closeQuickModal));
  document.addEventListener('keydown', event => {
    if (!quickModal || quickModal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...quickModal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => !el.hidden && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  quickOptions?.addEventListener('change', event => {
    const group = event.target.closest('[data-quick-group]');
    if (!group) return;
    const selected = group.querySelector('input[type=radio]:checked');
    const custom = group.querySelector('[data-quick-custom-input]');
    if (custom) custom.hidden = selected?.dataset.quickCustom !== 'true';
    updateQuickPrice();
  });
  quickModal?.querySelectorAll('[data-quick-qty]').forEach(button => {
    button.addEventListener('click', () => {
      const min = Math.max(1, Number(quickQuantity.min || 1));
      const step = Math.max(1, Number(quickQuantity.step || 1));
      quickQuantity.value = String(Math.max(min, Number(quickQuantity.value || min) + Number(button.dataset.quickQty) * step));
      updateQuickPrice();
    });
  });
  quickQuantity?.addEventListener('input', updateQuickPrice);
  quickModal?.querySelector('[data-quick-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    const product = catalog[quickProductId];
    if (!product) return;
    try {
      const options = {};
      for (const group of product.option_groups || []) {
        const fieldset = quickOptions.querySelector(`[data-quick-group="${CSS.escape(group.id)}"]`);
        const selected = fieldset?.querySelector('input[type=radio]:checked');
        if (!selected) throw new Error(`Vui lòng chọn ${group.name.toLowerCase()}.`);
        const value = { id: selected.value };
        if (selected.dataset.quickCustom === 'true') {
          const custom = fieldset.querySelector('[data-quick-custom-input]')?.value.trim();
          if (!custom) throw new Error(`Vui lòng ghi rõ ${group.name.toLowerCase()}.`);
          value.custom_text = custom;
        }
        options[group.id] = value;
      }
      const min = Number(product.quantity?.min_value || 1);
      const step = Number(product.quantity?.step || 1);
      const quantity = Number(quickQuantity.value);
      if (!Number.isInteger(quantity) || quantity < min || (quantity - min) % step !== 0) throw new Error('Số lượng không hợp lệ.');
      const cart = readCart();
      cart.push({ line_id:newLineId(), product_id:product.id, quantity, configuration:{ options } });
      saveCart(cart);
      quickNote.textContent = 'Đã thêm vào giỏ hàng.';
      quickNote.classList.remove('error');
      quickNote.hidden = false;
      setTimeout(closeQuickModal, 700);
    } catch (error) {
      quickNote.textContent = error.message || 'Không thể thêm vào giỏ hàng.';
      quickNote.classList.add('error');
      quickNote.hidden = false;
    }
  });

  renderCartPage();
  renderCheckoutPage();
})();
