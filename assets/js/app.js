(function () {
  const CART_KEY = 'uyen_uong_cart_v3';

  // API lưu đơn hàng vào Cloudflare D1.
  const ORDER_DB_API_URL = '/api/orders';

  // Worker hiện tại chỉ dùng để gửi thông báo Telegram.
  // Bot Token và Chat ID vẫn nằm an toàn phía Worker.
  const ORDER_API_URL =
    'https://uyenuong-order-api.phuoc-loki1990.workers.dev';

  const products = {
    phuthe: {
      id: 'phuthe',
      name: 'Bánh phu thê',
      image: '/assets/images/Anh1.jpg'
    },

    phuthehue: {
      id: 'phuthehue',
      name: 'Bánh phu thê Huế',
      image: '/assets/images/Anh1.jpg'
    },

    phuthebac: {
      id: 'phuthebac',
      name: 'Bánh phu thê miền Bắc',
      image: '/assets/images/Banner.jpg'
    },

    mamqua: {
      id: 'mamqua',
      name: 'Mâm quả cưới hỏi',
      image: '/assets/images/mam-qua-cuoi-1.jpg'
    },

    phuclinh: {
      id: 'phuclinh',
      name: 'Bánh phục linh',
      image: '/assets/images/banh-phuc-linh-1.jpg'
    }
  };

  function money(n) {
    return Number(n || 0).toLocaleString('vi-VN') + 'đ';
  }

  function phucLinhPrice(flavor, qty) {
    qty = Number(qty) || 0;

    if (flavor === '2 vị' && qty === 30) {
      return 180000;
    }

    if (flavor === '2 vị' && qty === 50) {
      return 230000;
    }

    return 0;
  }

  function getCart() {
    try {
      return JSON.parse(
        localStorage.getItem(CART_KEY) || '[]'
      );
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify(cart)
    );

    updateCartCount();
  }

  function updateCartCount() {
    const count = getCart().reduce(
      (sum, item) =>
        sum + Number(item.qty || 0),
      0
    );

    document
      .querySelectorAll('[data-cart-count]')
      .forEach(el => {
        el.textContent = count;
      });
  }

  function itemLabel(item) {
    return (
      item.variant ||
      [item.size, item.wrap]
        .filter(Boolean)
        .join(' · ') ||
      'Theo yêu cầu'
    );
  }

  function itemPrice(item) {
    if (
      item.id === 'phuclinh' &&
      item.flavor
    ) {
      const price =
        phucLinhPrice(
          item.flavor,
          item.qty
        );

      return price
        ? money(price)
        : 'Giá liên hệ';
    }

    return Number(item.price) > 0
      ? money(
          Number(item.price) *
          Number(item.qty || 1)
        )
      : (
          item.priceText ||
          'Shop xác nhận'
        );
  }

  function addCart(item) {
    const cart = getCart();

    const key = [
      item.id,
      item.variant || '',
      item.size || '',
      item.wrap || '',
      item.flavor || ''
    ].join('|');

    const found =
      cart.find(i => i.key === key);

    if (found) {
      if (
        item.id === 'phuclinh' &&
        item.flavor
      ) {
        found.qty =
          Number(found.qty || 0) +
          Number(item.qty || 0);
      } else {
        found.qty += item.qty;
      }
    } else {
      cart.push({
        ...item,
        key
      });
    }

    saveCart(cart);
  }

  function removeCart(key) {
    saveCart(
      getCart().filter(
        item => item.key !== key
      )
    );

    renderCart();
  }

  function updateQty(key, qty) {
    const cart = getCart();

    const item =
      cart.find(i => i.key === key);

    if (item) {
      const min =
        Number(item.minQty || 1);

      item.qty = Math.max(
        min,
        Number(qty) || min
      );

      saveCart(cart);
      renderCart();
    }
  }

  function cartTotal() {
    return getCart().reduce(
      (sum, item) => {
        if (
          item.id === 'phuclinh' &&
          item.flavor
        ) {
          return (
            sum +
            phucLinhPrice(
              item.flavor,
              item.qty
            )
          );
        }

        return (
          sum +
          (Number(item.price) || 0) *
          (Number(item.qty) || 0)
        );
      },
      0
    );
  }

  function hasUnknownPrice() {
    return getCart().some(item => {
      if (
        item.id === 'phuclinh' &&
        item.flavor
      ) {
        return !phucLinhPrice(
          item.flavor,
          item.qty
        );
      }

      return !(
        Number(item.price) > 0
      );
    });
  }

  function toggleMenu() {
    document
      .getElementById('mobileMenu')
      ?.classList.toggle('open');
  }

  window.toggleMenu =
    toggleMenu;

  document.addEventListener(
    'click',
    event => {
      const menu =
        document.getElementById(
          'mobileMenu'
        );

      const btn =
        document.querySelector(
          '.menu-btn'
        );

      if (
        innerWidth <= 740 &&
        menu?.classList.contains(
          'open'
        ) &&
        !menu.contains(
          event.target
        ) &&
        !btn?.contains(
          event.target
        )
      ) {
        menu.classList.remove(
          'open'
        );
      }
    }
  );

  /* =============================
     GALLERY SẢN PHẨM
     ============================= */

  document
    .querySelectorAll(
      '[data-thumb]'
    )
    .forEach(btn =>
      btn.addEventListener(
        'click',
        () => {
          const main =
            document.getElementById(
              'mainProductImage'
            );

          if (main) {
            main.src =
              btn.dataset.thumb;
          }

          document
            .querySelectorAll(
              '[data-thumb]'
            )
            .forEach(b =>
              b.classList.remove(
                'active'
              )
            );

          btn.classList.add(
            'active'
          );
        }
      )
    );

  /* =============================
     NÚT SỐ LƯỢNG
     ============================= */

  document
    .querySelectorAll(
      '[data-qty-minus]'
    )
    .forEach(btn =>
      btn.addEventListener(
        'click',
        () => {
          const input =
            btn.parentElement
              .querySelector(
                'input'
              );

          const min =
            Number(
              input.min || 1
            );

          input.value =
            Math.max(
              min,
              (
                Number(
                  input.value
                ) || min
              ) - 1
            );

          input.dispatchEvent(
            new Event(
              'input',
              {
                bubbles: true
              }
            )
          );
        }
      )
    );

  document
    .querySelectorAll(
      '[data-qty-plus]'
    )
    .forEach(btn =>
      btn.addEventListener(
        'click',
        () => {
          const input =
            btn.parentElement
              .querySelector(
                'input'
              );

          const min =
            Number(
              input.min || 1
            );

          input.value =
            Math.max(
              min,
              (
                Number(
                  input.value
                ) || min
              ) + 1
            );

          input.dispatchEvent(
            new Event(
              'input',
              {
                bubbles: true
              }
            )
          );
        }
      )
    );

  /* =============================
     TRANG CHI TIẾT SẢN PHẨM
     ============================= */

  const productForm =
    document.getElementById(
      'product-purchase'
    );

  if (productForm) {
    const productId =
      productForm.dataset.product;

    const productPriceHint =
      document.getElementById(
        'product-phuclinh-price'
      );

    function updateProductPhucLinhPrice() {
      if (
        productId !== 'phuclinh' ||
        !productPriceHint
      ) {
        return;
      }

      const flavor =
        productForm
          .querySelector(
            '[name="flavor"]'
          )
          ?.value || '';

      const qty =
        Number(
          productForm
            .querySelector(
              '[name="qty"]'
            )
            ?.value || 0
        );

      const price =
        phucLinhPrice(
          flavor,
          qty
        );

      productPriceHint.textContent =
        price
          ? `${flavor} · ${qty} cái: ${money(price)}.`
          : `${flavor || 'Bánh phục linh'} · ${qty || 0} cái: Giá liên hệ. Shop sẽ báo giá khi xác nhận.`;
    }

    productForm
      .querySelector(
        '[name="flavor"]'
      )
      ?.addEventListener(
        'change',
        updateProductPhucLinhPrice
      );

    productForm
      .querySelector(
        '[name="qty"]'
      )
      ?.addEventListener(
        'input',
        updateProductPhucLinhPrice
      );

    updateProductPhucLinhPrice();

    function buildItem() {
      const fd =
        new FormData(
          productForm
        );

      const id =
        productId;

      const base =
        products[id];

      const qty =
        Math.max(
          Number(
            productForm
              .querySelector(
                'input[name="qty"]'
              )
              ?.min || 1
          ),
          Number(
            fd.get('qty')
          ) || 1
        );

      if (
        id === 'phuthe' ||
        id === 'phuthehue' ||
        id === 'phuthebac'
      ) {
        const wrap =
          fd.get('wrap');

        return {
          id,
          name: base.name,
          image: base.image,
          wrap,
          variant:
            [wrap]
              .filter(Boolean)
              .join(' · ') ||
            'Theo yêu cầu',
          qty,
          minQty: 20,
          price: 0,
          priceText:
            'Giá liên hệ'
        };
      }

      if (
        id === 'mamqua'
      ) {
        const pkg =
          fd.get('package');

        return {
          id,
          name: base.name,
          image: base.image,
          variant: pkg,
          qty,
          minQty: 1,
          price: 0,
          priceText:
            'Giá liên hệ'
        };
      }

      if (
        id === 'phuclinh'
      ) {
        const flavor =
          fd.get('flavor') ||
          '2 vị';

        const price =
          phucLinhPrice(
            flavor,
            qty
          );

        return {
          id,
          name: base.name,
          image: base.image,
          flavor,
          variant:
            `${flavor} · ${qty} cái`,
          qty,
          minQty: 1,
          price,
          priceText:
            price
              ? ''
              : 'Giá liên hệ'
        };
      }

      return {
        id,
        name: base.name,
        image: base.image,
        variant:
          'Theo yêu cầu',
        qty,
        minQty: 1,
        price: 0,
        priceText:
          'Shop xác nhận'
      };
    }

    productForm
      .querySelector(
        '[data-add-cart]'
      )
      ?.addEventListener(
        'click',
        () => {
          addCart(
            buildItem()
          );

          const btn =
            productForm
              .querySelector(
                '[data-add-cart]'
              );

          const old =
            btn.textContent;

          btn.textContent =
            'Đã thêm vào giỏ';

          setTimeout(
            () => {
              btn.textContent =
                old;
            },
            1400
          );
        }
      );

    productForm
      .querySelector(
        '[data-buy-now]'
      )
      ?.addEventListener(
        'click',
        () => {
          const item =
            buildItem();

          sessionStorage.setItem(
            'uyen_uong_buy_now',
            JSON.stringify(
              [item]
            )
          );

          location.href =
            '/dat-hang.html?source=buy-now';
        }
      );
  }

  /* =============================
     GIỎ HÀNG
     ============================= */

  function renderCart() {
    const list =
      document.getElementById(
        'cart-list'
      );

    const empty =
      document.getElementById(
        'cart-empty'
      );

    const summary =
      document.getElementById(
        'cart-summary'
      );

    if (!list) return;

    const cart =
      getCart();

    list.innerHTML = '';

    if (!cart.length) {
      empty.hidden = false;
      summary.hidden = true;
      return;
    }

    empty.hidden = true;
    summary.hidden = false;

    cart.forEach(item => {
      const el =
        document.createElement(
          'div'
        );

      el.className =
        'cart-item';

      const min =
        Number(
          item.minQty || 1
        );

      const qtyLabel =
        item.id ===
          'phuclinh' &&
        item.flavor
          ? 'Số bánh'
          : 'Số lượng';

      el.innerHTML = `
        <img
          src="${item.image}"
          alt="${item.name}"
        >

        <div>
          <h3>
            ${item.name}
          </h3>

          <p>
            ${itemLabel(item)}
          </p>

          <div
            class="cart-item-controls"
          >
            <span
              class="small"
            >
              ${qtyLabel}:
            </span>

            <input
              class="mini-qty"
              type="number"
              min="${min}"
              value="${item.qty}"
              aria-label="Số lượng"
            >

            <button
              class="remove-btn"
              type="button"
            >
              Xóa
            </button>
          </div>
        </div>

        <div
          class="cart-item-price"
        >
          ${itemPrice(item)}
        </div>
      `;

      el
        .querySelector(
          'input'
        )
        .addEventListener(
          'change',
          event =>
            updateQty(
              item.key,
              event.target.value
            )
        );

      el
        .querySelector(
          '.remove-btn'
        )
        .addEventListener(
          'click',
          () =>
            removeCart(
              item.key
            )
        );

      list.appendChild(el);
    });

    const total =
      cartTotal();

    const unknown =
      hasUnknownPrice();

    const totalEl =
      document.querySelector(
        '[data-cart-total]'
      );

    const label =
      document.querySelector(
        '.summary-row.total span:first-child'
      );

    if (totalEl) {
      if (
        total &&
        unknown
      ) {
        totalEl.textContent =
          money(total) +
          ' + món chờ báo giá';
      } else if (total) {
        totalEl.textContent =
          money(total);
      } else {
        totalEl.textContent =
          'Shop xác nhận';
      }
    }

    if (label) {
      label.textContent =
        unknown
          ? 'Tạm tính'
          : 'Tổng cộng';
    }
  }

  renderCart();

  /* =============================
     CHECKOUT
     ============================= */

  function getCheckoutItems() {
    const params =
      new URLSearchParams(
        location.search
      );

    if (
      params.get('source') ===
      'buy-now'
    ) {
      try {
        return JSON.parse(
          sessionStorage.getItem(
            'uyen_uong_buy_now'
          ) || '[]'
        );
      } catch (e) {
        return [];
      }
    }

    return getCart();
  }

  const orderForm =
    document.getElementById(
      'order-form'
    );

  if (orderForm) {
    const params =
      new URLSearchParams(
        location.search
      );

    const items =
      getCheckoutItems();

    const wrap =
      document.getElementById(
        'selected-products'
      );

    if (items.length) {
      items.forEach(item => {
        const d =
          document.createElement(
            'div'
          );

        d.className =
          'selected-product';

        const qtyText =
          item.id ===
            'phuclinh' &&
          item.flavor
            ? ''
            : ` · SL ${item.qty}`;

        d.innerHTML = `
          <div
            class="selected-product-head"
          >
            <div>
              <strong>
                ${item.name}
              </strong>

              <p>
                ${itemLabel(item)}
                ${qtyText}
              </p>
            </div>

            <strong>
              ${itemPrice(item)}
            </strong>
          </div>
        `;

        wrap.appendChild(d);
      });
    } else if (
      params.get('product')
    ) {
      const p =
        products[
          params.get(
            'product'
          )
        ];

      if (p) {
        const d =
          document.createElement(
            'div'
          );

        d.className =
          'selected-product';

        d.innerHTML = `
          <strong>
            ${p.name}
          </strong>

          <p>
            Chọn chi tiết bên dưới.
          </p>
        `;

        wrap.appendChild(d);

        document
          .querySelector(
            `[data-option="${p.id}"] input[type="checkbox"]`
          )
          ?.click();
      }
    } else {
      wrap.innerHTML =
        '<p class="muted">Chưa có sản phẩm từ giỏ hàng. Bạn vẫn có thể chọn món bên dưới.</p>';
    }

    document
      .querySelectorAll(
        '.order-option input[type="checkbox"]'
      )
      .forEach(cb =>
        cb.addEventListener(
          'change',
          () => {
            const option =
              cb.closest(
                '.order-option'
              );

            option.classList.toggle(
              'open',
              cb.checked
            );

            option
              .querySelectorAll(
                'select,input[type="number"]'
              )
              .forEach(el => {
                el.required =
                  cb.checked;
              });
          }
        )
      );

    const phutheRegion =
      document.getElementById(
        'phuthe-region'
      );

    const phutheWrap =
      document.getElementById(
        'phuthe-wrap'
      );

    function syncPhutheWrap() {
      if (
        !phutheRegion ||
        !phutheWrap
      ) {
        return;
      }

      const region =
        phutheRegion.value;

      if (
        region === 'Huế'
      ) {
        phutheWrap.innerHTML = `
          <option value="">
            -- Chọn kiểu đóng gói --
          </option>

          <option value="Hộp giấy">
            Hộp giấy
          </option>

          <option value="Lá dừa">
            Lá dừa
          </option>
        `;
      } else if (
        region ===
        'Miền Bắc'
      ) {
        phutheWrap.innerHTML = `
          <option value="Hộp giấy">
            Hộp giấy
          </option>
        `;
      } else {
        phutheWrap.innerHTML = `
          <option value="">
            -- Chọn dòng bánh trước --
          </option>
        `;
      }
    }

    phutheRegion
      ?.addEventListener(
        'change',
        syncPhutheWrap
      );

    syncPhutheWrap();

    const plFlavor =
      document.getElementById(
        'phuclinh-flavor'
      );

    const plQty =
      document.getElementById(
        'phuclinh-qty'
      );

    const plHint =
      document.getElementById(
        'phuclinh-price-hint'
      );

    function updateCheckoutPhucLinhPrice() {
      if (!plHint) return;

      const flavor =
        plFlavor?.value || '';

      const qty =
        Number(
          plQty?.value || 0
        );

      const price =
        phucLinhPrice(
          flavor,
          qty
        );

      if (
        !flavor ||
        !qty
      ) {
        plHint.textContent =
          'Nhập số lượng để xem giá nếu trùng đúng quy cách đang niêm yết.';
      } else if (price) {
        plHint.textContent =
          `Giá niêm yết cho ${flavor} · ${qty} cái: ${money(price)}.`;
      } else {
        plHint.textContent =
          `${flavor} · ${qty} cái chưa có giá niêm yết. Shop sẽ báo giá khi xác nhận.`;
      }
    }

    plFlavor
      ?.addEventListener(
        'change',
        updateCheckoutPhucLinhPrice
      );

    plQty
      ?.addEventListener(
        'input',
        updateCheckoutPhucLinhPrice
      );

    updateCheckoutPhucLinhPrice();

    const receive =
      document.querySelector(
        'input[name="receive_date"]'
      );

    if (receive) {
      const tomorrow =
        new Date(
          Date.now() +
          86400000
        );

      receive.min =
        tomorrow
          .toISOString()
          .slice(0, 10);
    }

    /* =============================
       GỬI ĐƠN HÀNG
       LUỒNG:
       1. Kiểm tra dữ liệu
       2. Lưu D1 trước
       3. Nếu là đơn mới -> gửi Telegram
       4. D1 lưu thành công = đơn đã được ghi nhận
       ============================= */

    orderForm.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        if (
          !orderForm
            .reportValidity()
        ) {
          document.dispatchEvent(
            new CustomEvent(
              'order-send-failed'
            )
          );

          return;
        }

        const fd =
          new FormData(
            orderForm
          );

        /* Request ID được giữ nguyên
           trong cùng một lần đặt hàng
           để chống tạo trùng đơn. */

        const requestId =
          sessionStorage.getItem(
            'uyen_uong_request_id'
          ) ||
          crypto.randomUUID();

        sessionStorage.setItem(
          'uyen_uong_request_id',
          requestId
        );

        const orderPayload = {
          request_id:
            requestId,

          customer_name:
            String(
              fd.get('name') || ''
            ).trim(),

          phone:
            String(
              fd.get('phone') || ''
            ).trim(),

          receive_date:
            String(
              fd.get(
                'receive_date'
              ) || ''
            ),

          address:
            String(
              fd.get('address') || ''
            ).trim(),

          note:
            String(
              fd.get('note') || ''
            ).trim(),

          items: []
        };

        const lines = [
          'YÊU CẦU ĐẶT HÀNG - SHOP UYÊN ƯƠNG',
          ''
        ];

        /* Các món đã có từ
           Giỏ hàng / Đặt ngay */

        items.forEach(item => {
          const qtyText =
            item.id ===
              'phuclinh' &&
            item.flavor
              ? ''
              : ` | SL ${item.qty}`;

          lines.push(
            `- ${item.name}: ${itemLabel(item)}${qtyText} | ${itemPrice(item)}`
          );

          orderPayload
            .items
            .push({
              id:
                item.id || '',

              name:
                item.name || '',

              option:
                itemLabel(item),

              quantity:
                Number(
                  item.qty || 1
                ),

              price_text:
                itemPrice(item)
            });
        });

        /* Mâm quả chọn thêm
           tại checkout */

        if (
          fd.get(
            'want_mamqua'
          )
        ) {
          const mamquaOption =
            String(
              fd.get(
                'mamqua_option'
              ) ||
              'chưa chọn gói'
            );

          lines.push(
            `- Mâm quả cưới: ${mamquaOption} | Giá liên hệ`
          );

          orderPayload
            .items
            .push({
              id: 'mamqua',
              name:
                'Mâm quả cưới',
              option:
                mamquaOption,
              quantity: 1,
              price_text:
                'Giá liên hệ'
            });
        }

        /* Bánh phu thê
           chọn thêm tại checkout */

        if (
          fd.get(
            'want_phuthe'
          )
        ) {
          const region =
            String(
              fd.get(
                'phuthe_region'
              ) || ''
            );

          const wrapOption =
            String(
              fd.get(
                'phuthe_wrap'
              ) || ''
            );

          const qty =
            Number(
              fd.get(
                'phuthe_qty'
              ) || 0
            );

          if (qty < 20) {
            alert(
              'Bánh phu thê nhận đặt tối thiểu 20 bánh.'
            );

            document.dispatchEvent(
              new CustomEvent(
                'order-send-failed'
              )
            );

            return;
          }

          lines.push(
            `- Bánh phu thê: ${region}, ${wrapOption}, ${qty} bánh | Giá liên hệ`
          );

          orderPayload
            .items
            .push({
              id: 'phuthe',
              name:
                'Bánh phu thê',

              option:
                [
                  region,
                  wrapOption
                ]
                  .filter(Boolean)
                  .join(' · '),

              quantity:
                qty,

              price_text:
                'Giá liên hệ'
            });
        }

        /* Bánh phục linh
           chọn thêm tại checkout */

        if (
          fd.get(
            'want_phuclinh'
          )
        ) {
          const flavor =
            String(
              fd.get(
                'phuclinh_flavor'
              ) || ''
            );

          const qty =
            Number(
              fd.get(
                'phuclinh_qty'
              ) || 0
            );

          const price =
            phucLinhPrice(
              flavor,
              qty
            );

          const priceText =
            price
              ? money(price)
              : 'Giá liên hệ';

          lines.push(
            `- Bánh phục linh: ${flavor}, ${qty} cái | ${priceText}`
          );

          orderPayload
            .items
            .push({
              id: 'phuclinh',

              name:
                'Bánh phục linh',

              option:
                flavor,

              quantity:
                qty,

              price_text:
                priceText
            });
        }

        /* Không cho gửi
           yêu cầu rỗng */

        if (
          !orderPayload
            .items
            .length
        ) {
          alert(
            'Bạn chưa chọn sản phẩm để đặt hàng.'
          );

          document.dispatchEvent(
            new CustomEvent(
              'order-send-failed'
            )
          );

          return;
        }

        const status =
          document.getElementById(
            'copy-status'
          );

        /* =============================
           BƯỚC 1: LƯU ĐƠN VÀO D1
           ============================= */

        let orderResult =
          null;

        try {
          const dbResponse =
            await fetch(
              ORDER_DB_API_URL,
              {
                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json'
                },

                body:
                  JSON.stringify(
                    orderPayload
                  )
              }
            );

          try {
            orderResult =
              await dbResponse
                .json();
          } catch (e) {
            orderResult =
              null;
          }

          if (
            !dbResponse.ok ||
            orderResult
              ?.success !== true
          ) {
            throw new Error(
              orderResult
                ?.message ||
              'Không thể lưu đơn hàng.'
            );
          }
        } catch (error) {
          console.error(
            'D1 order API error:',
            error
          );

          if (status) {
            status.textContent =
              'Chưa thể ghi nhận yêu cầu. Vui lòng thử lại.';
          }

          document.dispatchEvent(
            new CustomEvent(
              'order-send-failed'
            )
          );

          return;
        }

        const orderCode =
          orderResult
            .order_code;

        /* Hiện mã đơn trong modal
           nếu dat-hang.html có
           phần tử này */

        const codeEl =
          document.getElementById(
            'confirmed-order-code'
          );

        if (codeEl) {
          codeEl.textContent =
            orderCode;
        }

        /* Thêm mã đơn vào nội dung
           hiển thị và Telegram */

        lines.unshift(
          `MÃ ĐƠN: ${orderCode}`,
          ''
        );

        lines.push(
          '',
          `Khách hàng: ${orderPayload.customer_name}`,
          `SĐT: ${orderPayload.phone}`,
          `Ngày nhận: ${orderPayload.receive_date}`,
          `Địa chỉ: ${orderPayload.address}`,
          `Ghi chú: ${orderPayload.note || 'Không có'}`
        );

        const text =
          lines.join('\n');

        const preview =
          document.getElementById(
            'order-preview'
          );

        if (preview) {
          preview.textContent =
            text;

          preview.classList.add(
            'show'
          );
        }

        /* =============================
           BƯỚC 2: GỬI TELEGRAM

           Nếu D1 báo duplicate=true:
           không gửi Telegram lần nữa.
           ============================= */

        let telegramOk =
          false;

        if (
          orderResult
            .duplicate === true
        ) {
          telegramOk = true;
        } else {
          try {
            const telegramResponse =
              await fetch(
                ORDER_API_URL,
                {
                  method:
                    'POST',

                  headers: {
                    'Content-Type':
                      'application/json'
                  },

                  body:
                    JSON.stringify({
                      message:
                        text
                    })
                }
              );

            let telegramResult =
              null;

            try {
              telegramResult =
                await telegramResponse
                  .json();
            } catch (e) {
              telegramResult =
                null;
            }

            telegramOk =
              telegramResponse.ok &&
              telegramResult
                ?.ok === true;

          } catch (error) {
            console.error(
              'Telegram API error:',
              error
            );

            telegramOk =
              false;
          }
        }

        /* =============================
           D1 ĐÃ LƯU THÀNH CÔNG
           => KHÁCH KHÔNG ĐƯỢC
           GỬI LẠI

           Telegram chỉ là kênh báo,
           không phải nơi lưu đơn chính.
           ============================= */

        if (status) {
          if (
            orderResult
              .duplicate === true
          ) {
            status.textContent =
              `Yêu cầu ${orderCode} đã được ghi nhận trước đó. Bạn không cần gửi lại.`;
          } else if (
            telegramOk
          ) {
            status.textContent =
              `Yêu cầu ${orderCode} đã được ghi nhận và gửi thông báo đến Shop. Shop sẽ liên hệ lại để xác nhận.`;
          } else {
            status.textContent =
              `Yêu cầu ${orderCode} đã được ghi nhận thành công. Thông báo Telegram hiện chưa gửi được, nhưng đơn hàng của bạn đã được lưu.`;
          }
        }

        const successBox =
          document.getElementById(
            'order-success'
          );

        successBox
          ?.classList
          .add('show');

        /* Khi D1 đã ghi nhận
           thì coi là thành công.
           Xóa request ID để lần
           đặt hàng tiếp theo có
           request ID mới. */

        sessionStorage.removeItem(
          'uyen_uong_request_id'
        );
      }
    );
  }

  updateCartCount();
})();


/* =========================================
   POPUP XÁC NHẬN ĐƠN HÀNG
   ========================================= */

(function () {
  const form =
    document.getElementById(
      'order-form'
    );

  if (!form) return;

  const submitBtn =
    form.querySelector(
      'button[type="submit"]'
    );

  const successBox =
    document.getElementById(
      'order-success'
    );

  const modal =
    document.getElementById(
      'order-confirm-modal'
    );

  const closeBtn =
    document.getElementById(
      'close-order-confirm'
    );

  let submitting =
    false;

  let confirmed =
    false;

  /* =============================
     KHÓA NÚT KHI ĐANG GỬI
     ============================= */

  form.addEventListener(
    'submit',
    function (event) {
      if (
        submitting ||
        confirmed
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      submitting = true;

      if (submitBtn) {
        submitBtn.disabled =
          true;

        submitBtn.textContent =
          'Đang gửi yêu cầu...';
      }
    },
    true
  );

  /* =============================
     GỬI THẤT BẠI
     -> CHO PHÉP THỬ LẠI
     ============================= */

  document.addEventListener(
    'order-send-failed',
    function () {
      if (confirmed) {
        return;
      }

      submitting =
        false;

      if (submitBtn) {
        submitBtn.disabled =
          false;

        submitBtn.textContent =
          'Gửi yêu cầu đặt hàng';
      }
    }
  );

  /* =============================
     D1 GHI NHẬN THÀNH CÔNG
     ============================= */

  function showOrderConfirmed() {
    if (confirmed) {
      return;
    }

    confirmed =
      true;

    submitting =
      false;

    if (submitBtn) {
      submitBtn.disabled =
        true;

      submitBtn.textContent =
        '✓ Yêu cầu đã được ghi nhận';
    }

    /* Xóa giỏ hàng chỉ sau khi
       D1 xác nhận đã lưu đơn */

    localStorage.removeItem(
      'uyen_uong_cart_v3'
    );

    sessionStorage.removeItem(
      'uyen_uong_buy_now'
    );

    document
      .querySelectorAll(
        '[data-cart-count]'
      )
      .forEach(
        function (el) {
          el.textContent =
            '0';
        }
      );

    if (modal) {
      modal.classList.add(
        'show'
      );

      modal.setAttribute(
        'aria-hidden',
        'false'
      );

      document.body
        .classList
        .add(
          'order-modal-open'
        );
    }
  }

  /* =============================
     THEO DÕI BOX THÀNH CÔNG
     ============================= */

  if (successBox) {
    const observer =
      new MutationObserver(
        function () {
          if (
            successBox
              .classList
              .contains(
                'show'
              )
          ) {
            showOrderConfirmed();
          }
        }
      );

    observer.observe(
      successBox,
      {
        attributes: true,

        attributeFilter: [
          'class'
        ]
      }
    );

    if (
      successBox
        .classList
        .contains('show')
    ) {
      showOrderConfirmed();
    }
  }

  /* =============================
     ĐÓNG POPUP
     ============================= */

  function closeModal() {
    if (!modal) {
      return;
    }

    modal.classList.remove(
      'show'
    );

    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body
      .classList
      .remove(
        'order-modal-open'
      );

    successBox
      ?.scrollIntoView({
        behavior:
          'smooth',

        block:
          'center'
      });
  }

  closeBtn
    ?.addEventListener(
      'click',
      closeModal
    );

  modal
    ?.querySelector(
      '.order-confirm-backdrop'
    )
    ?.addEventListener(
      'click',
      closeModal
    );
})();
