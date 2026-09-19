/*
  SHOP UYÊN ƯƠNG - APP.JS

  Khởi tạo sau khi DOM đã sẵn sàng để đảm bảo
  các nút sản phẩm, giỏ hàng và form đặt hàng
  luôn tìm thấy phần tử HTML trước khi gắn sự kiện.
*/
(function () {
  function bootUyenUongApp() {
    (function () {
      const CART_KEY = 'uyen_uong_cart_v3';

      // API lưu đơn hàng vào Cloudflare D1.
      const ORDER_DB_API_URL = '/api/orders';

      // API gửi thông báo Telegram qua Cloudflare Pages Function.
      // Bot Token và Chat ID chỉ nằm ở Variables and Secrets của Cloudflare.
      const ORDER_API_URL =
        '/api/send-order';

      const products = window.UUCMS?.products || {};

      const html = value =>
        String(value ?? '').replace(
          /[&<>"']/g,
          c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          }[c])
        );

      function itemChoices(item) {
        if (item.options) {
          return item.options;
        }

        return {
          wrap: item.wrap || '',
          flavor: item.flavor || '',
          package: item.variant || ''
        };
      }

      function itemTotal(item) {
        const p = products[item.id];

        if (
          !p ||
          !window.UUCMS
        ) {
          return null;
        }

        return window.UUCMS.quote(
          p,
          itemChoices(item),
          Number(item.qty)
        );
      }

      function money(n) {
        return (
          Number(n || 0)
            .toLocaleString('vi-VN') +
          'đ'
        );
      }

      function phucLinhPrice(
        flavor,
        qty
      ) {
        const p =
          products.phuclinh;

        return (
          p &&
          window.UUCMS
            ? window.UUCMS.quote(
                p,
                { flavor },
                Number(qty)
              )
            : null
        );
      }

      function createRequestId() {
        if (
          window.crypto &&
          typeof window.crypto.randomUUID ===
            'function'
        ) {
          return window.crypto.randomUUID();
        }

        return (
          'uu-' +
          Date.now().toString(36) +
          '-' +
          Math.random()
            .toString(36)
            .slice(2, 12)
        );
      }

      function getCart() {
        try {
          return JSON.parse(
            localStorage.getItem(
              CART_KEY
            ) || '[]'
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
        const count =
          getCart().reduce(
            (sum, item) =>
              sum +
              Number(
                item.qty || 0
              ),
            0
          );

        document
          .querySelectorAll(
            '[data-cart-count]'
          )
          .forEach(el => {
            el.textContent =
              count;
          });
      }

      function itemLabel(item) {
        if (item.options) {
          return (
            Object.values(
              item.options
            )
              .filter(Boolean)
              .join(' · ') +
            (
              item.flavor
                ? ' · ' +
                  item.qty +
                  ' cái'
                : ''
            )
          );
        }

        if (item.flavor) {
          return (
            item.flavor +
            ' · ' +
            item.qty +
            ' cái'
          );
        }

        return (
          item.variant ||
          [
            item.size,
            item.wrap
          ]
            .filter(Boolean)
            .join(' · ') ||
          'Theo yêu cầu'
        );
      }

      function itemPrice(item) {
        const total =
          itemTotal(item);

        return total === null
          ? 'Giá liên hệ'
          : money(total);
      }

      function addCart(item) {
        const cart =
          getCart();

        const options =
          itemChoices(item);

        const key =
          JSON.stringify([
            item.id,
            Object.entries(
              options
            ).sort(),
            item.qty
          ]);

        // Exact bundles are independent lines;
        // do not merge two 30-piece bundles into 60 pieces.
        cart.push({
          ...item,
          key:
            key +
            ':' +
            createRequestId()
        });

        saveCart(cart);
      }

      function removeCart(key) {
        saveCart(
          getCart().filter(
            item =>
              item.key !== key
          )
        );

        renderCart();
      }

      function updateQty(
        key,
        qty
      ) {
        const cart =
          getCart();

        const item =
          cart.find(
            i =>
              i.key === key
          );

        if (item) {
          const q =
            products[item.id]
              ?.quantity || {
              min:
                item.minQty || 1,

              step:
                item.stepQty || 1
            };

          const value =
            Number(qty);

          if (
            !Number.isInteger(
              value
            ) ||
            value < q.min ||
            (
              value -
              q.min
            ) %
              q.step
          ) {
            renderCart();
            return;
          }

          item.qty =
            value;

          saveCart(cart);
          renderCart();
        }
      }

      function cartTotal() {
        return getCart()
          .reduce(
            (sum, item) =>
              sum +
              (
                itemTotal(
                  item
                ) ?? 0
              ),
            0
          );
      }

      function hasUnknownPrice() {
        return getCart()
          .some(
            item =>
              itemTotal(
                item
              ) === null
          );
      }

      function toggleMenu() {
        document
          .getElementById(
            'mobileMenu'
          )
          ?.classList.toggle(
            'open'
          );
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
            menu?.classList
              .contains(
                'open'
              ) &&
            !menu.contains(
              event.target
            ) &&
            !btn?.contains(
              event.target
            )
          ) {
            menu.classList
              .remove(
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
        .forEach(
          btn =>
            btn.addEventListener(
              'click',
              () => {
                const main =
                  document
                    .getElementById(
                      'mainProductImage'
                    );

                if (main) {
                  main.src =
                    btn.dataset
                      .thumb;
                }

                document
                  .querySelectorAll(
                    '[data-thumb]'
                  )
                  .forEach(
                    b =>
                      b.classList
                        .remove(
                          'active'
                        )
                  );

                btn.classList
                  .add(
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
        .forEach(
          btn =>
            btn.addEventListener(
              'click',
              event => {
                event
                  .preventDefault();

                const input =
                  btn.parentElement
                    .querySelector(
                      'input'
                    );

                if (!input) {
                  return;
                }

                const min =
                  Number(
                    input.min ||
                    1
                  );

                input.value =
                  Math.max(
                    min,
                    (
                      Number(
                        input.value
                      ) || min
                    ) -
                      Number(
                        input.step ||
                        1
                      )
                  );

                input.dispatchEvent(
                  new Event(
                    'input',
                    {
                      bubbles:
                        true
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
        .forEach(
          btn =>
            btn.addEventListener(
              'click',
              event => {
                event
                  .preventDefault();

                const input =
                  btn.parentElement
                    .querySelector(
                      'input'
                    );

                if (!input) {
                  return;
                }

                const min =
                  Number(
                    input.min ||
                    1
                  );

                input.value =
                  Math.max(
                    min,
                    (
                      Number(
                        input.value
                      ) || min
                    ) +
                      Number(
                        input.step ||
                        1
                      )
                  );

                input.dispatchEvent(
                  new Event(
                    'input',
                    {
                      bubbles:
                        true
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
        /*
          Phòng trường hợp HTML dùng tên product khác nhau.

          Giá trị chuẩn:
          phuthe
          phuthehue
          phuthebac
          mamqua
          phuclinh
        */

        function normalizeProductId(
          value
        ) {
          const raw =
            String(
              value || ''
            )
              .trim()
              .toLowerCase();

          const aliases = {
            phuthe:
              'phuthe',

            'phu-the':
              'phuthe',

            phuthehue:
              'phuthehue',

            'phu-the-hue':
              'phuthehue',

            phuthebac:
              'phuthebac',

            'phu-the-bac':
              'phuthebac',

            'phu-the-mien-bac':
              'phuthebac',

            mamqua:
              'mamqua',

            'mam-qua':
              'mamqua',

            'mam-qua-cuoi':
              'mamqua',

            'mam-qua-cuoi-hoi':
              'mamqua',

            phuclinh:
              'phuclinh',

            'phuc-linh':
              'phuclinh',

            'banh-phuc-linh':
              'phuclinh'
          };

          return (
            aliases[raw] ||
            raw
          );
        }

        const productId =
          normalizeProductId(
            productForm
              .dataset
              .product
          );

        const productPriceHint =
          document.getElementById(
            'product-price-hint'
          );

        /*
          Không cho form sản phẩm
          tự submit/reload trang.
        */

        productForm.addEventListener(
          'submit',
          event => {
            event
              .preventDefault();
          }
        );

        function updateProductPrice() {
          const p =
            products[
              productId
            ];

          if (
            !p ||
            !productPriceHint
          ) {
            return;
          }

          const fd =
            new FormData(
              productForm
            );

          const options =
            Object.fromEntries(
              p.option_groups
                .map(
                  g => [
                    g.key,
                    String(
                      fd.get(
                        g.key
                      ) || ''
                    )
                  ]
                )
            );

          const qty =
            Number(
              fd.get('qty')
            );

          const price =
            window.UUCMS
              .quote(
                p,
                options,
                qty
              );

          productPriceHint
            .textContent =
              price === null
                ? 'Giá liên hệ. Shop sẽ báo giá khi xác nhận đủ quy cách và số lượng.'
                : `${Object.values(options).join(' · ')} · ${qty} ${p.quantity.unit}: ${money(price)}.`;
        }

        productForm
          .addEventListener(
            'change',
            updateProductPrice
          );

        productForm
          .addEventListener(
            'input',
            updateProductPrice
          );

        updateProductPrice();

        function buildItem() {
          const fd =
            new FormData(
              productForm
            );

          const p =
            products[
              productId
            ];

          if (!p) {
            throw new Error(
              'Sản phẩm không còn được xuất bản'
            );
          }

          const options =
            Object.fromEntries(
              p.option_groups
                .map(
                  g => [
                    g.key,
                    String(
                      fd.get(
                        g.key
                      ) || ''
                    ).trim()
                  ]
                )
            );

          const qty =
            Number(
              fd.get('qty')
            );

          if (
            !p.option_groups
              .every(
                g =>
                  g.values
                    .includes(
                      options[
                        g.key
                      ]
                    )
              )
          ) {
            throw new Error(
              'Chưa chọn đủ quy cách'
            );
          }

          const q =
            p.quantity;

          if (
            !Number.isInteger(
              qty
            ) ||
            qty < q.min ||
            (
              qty -
              q.min
            ) %
              q.step
          ) {
            throw new Error(
              'Số lượng không hợp lệ'
            );
          }

          return {
            id:
              p.id,

            name:
              p.name,

            image:
              p.image,

            options,

            wrap:
              options.wrap ||
              '',

            flavor:
              options.flavor ||
              '',

            variant:
              Object.values(
                options
              ).join(' · '),

            qty,

            minQty:
              q.min,

            stepQty:
              q.step,

            price:
              p.price_mode ===
              'fixed'
                ? p.base_price
                : 0,

            priceText:
              'Giá liên hệ'
          };
        }

        const addCartBtn =
          productForm
            .querySelector(
              '[data-add-cart]'
            );

        const buyNowBtn =
          productForm
            .querySelector(
              '[data-buy-now]'
            );

        /*
          Nếu HTML quên type="button",
          JS vẫn ép thành button để
          không submit form.
        */

        if (
          addCartBtn &&
          addCartBtn.tagName ===
            'BUTTON'
        ) {
          addCartBtn.type =
            'button';
        }

        if (
          buyNowBtn &&
          buyNowBtn.tagName ===
            'BUTTON'
        ) {
          buyNowBtn.type =
            'button';
        }

        function canUseProductForm() {
          if (
            typeof productForm
              .reportValidity ===
              'function'
          ) {
            return productForm
              .reportValidity();
          }

          return true;
        }

        /* =============================
           THÊM VÀO GIỎ
           ============================= */

        addCartBtn
          ?.addEventListener(
            'click',
            event => {
              event
                .preventDefault();

              event
                .stopPropagation();

              if (
                !canUseProductForm()
              ) {
                return;
              }

              try {
                const item =
                  buildItem();

                addCart(
                  item
                );

                const oldText =
                  addCartBtn
                    .textContent;

                addCartBtn
                  .disabled =
                    true;

                addCartBtn
                  .textContent =
                    '✓ Đã thêm vào giỏ';

                updateCartCount();

                setTimeout(
                  () => {
                    addCartBtn
                      .disabled =
                        false;

                    addCartBtn
                      .textContent =
                        oldText;
                  },
                  1400
                );
              } catch (
                error
              ) {
                console.error(
                  'Lỗi thêm vào giỏ:',
                  error
                );

                addCartBtn
                  .disabled =
                    false;

                alert(
                  'Có lỗi khi thêm sản phẩm vào giỏ. Vui lòng tải lại trang và thử lại.'
                );
              }
            }
          );

        /* =============================
           ĐẶT NGAY
           ============================= */

        buyNowBtn
          ?.addEventListener(
            'click',
            event => {
              event
                .preventDefault();

              event
                .stopPropagation();

              if (
                !canUseProductForm()
              ) {
                return;
              }

              try {
                const item =
                  buildItem();

                sessionStorage
                  .setItem(
                    'uyen_uong_buy_now',
                    JSON.stringify(
                      [item]
                    )
                  );

                buyNowBtn
                  .disabled =
                    true;

                buyNowBtn
                  .textContent =
                    'Đang chuyển...';

                window.location
                  .assign(
                    '/dat-hang.html?source=buy-now'
                  );
              } catch (
                error
              ) {
                console.error(
                  'Lỗi đặt ngay:',
                  error
                );

                buyNowBtn
                  .disabled =
                    false;

                buyNowBtn
                  .textContent =
                    'Đặt ngay';

                alert(
                  'Có lỗi khi chuyển sang trang đặt hàng. Vui lòng tải lại trang và thử lại.'
                );
              }
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

        if (!list) {
          return;
        }

        const cart =
          getCart();

        list.innerHTML =
          '';

        if (!cart.length) {
          if (empty) {
            empty.hidden =
              false;
          }

          if (summary) {
            summary.hidden =
              true;
          }

          return;
        }

        if (empty) {
          empty.hidden =
            true;
        }

        if (summary) {
          summary.hidden =
            false;
        }

        cart.forEach(
          item => {
            const el =
              document
                .createElement(
                  'div'
                );

            el.className =
              'cart-item';

            const min =
              Number(
                item.minQty ||
                1
              );

            const qtyLabel =
              item.id ===
                'phuclinh' &&
              item.flavor
                ? 'Số bánh'
                : 'Số lượng';

            el.innerHTML = `
              <img
                src="${html(item.image)}"
                alt="${html(item.name)}"
              >

              <div>
                <h3>
                  ${html(item.name)}
                </h3>

                <p>
                  ${html(itemLabel(item))}
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
                    step="${products[item.id]?.quantity.step || item.stepQty || 1}"
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
                ${html(itemPrice(item))}
              </div>
            `;

            el
              .querySelector(
                'input'
              )
              ?.addEventListener(
                'change',
                event =>
                  updateQty(
                    item.key,
                    event.target
                      .value
                  )
              );

            el
              .querySelector(
                '.remove-btn'
              )
              ?.addEventListener(
                'click',
                () =>
                  removeCart(
                    item.key
                  )
              );

            list.appendChild(
              el
            );
          }
        );

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
            totalEl
              .textContent =
                money(total) +
                ' + món chờ báo giá';
          } else if (total) {
            totalEl
              .textContent =
                money(total);
          } else {
            totalEl
              .textContent =
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
          params.get(
            'source'
          ) === 'buy-now'
        ) {
          try {
            return JSON.parse(
              sessionStorage
                .getItem(
                  'uyen_uong_buy_now'
                ) ||
              '[]'
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

        if (wrap) {
          if (
            items.length
          ) {
            items.forEach(
              item => {
                const d =
                  document
                    .createElement(
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
                        ${html(item.name)}
                      </strong>

                      <p>
                        ${html(itemLabel(item))}
                        ${qtyText}
                      </p>
                    </div>

                    <strong>
                      ${html(itemPrice(item))}
                    </strong>
                  </div>
                `;

                wrap.appendChild(
                  d
                );
              }
            );
          } else if (
            params.get(
              'product'
            )
          ) {
            const rawProduct =
              params.get(
                'product'
              );

            const aliases = {
              'mam-qua':
                'mamqua',

              'mam-qua-cuoi':
                'mamqua',

              'mam-qua-cuoi-hoi':
                'mamqua',

              'phu-the':
                'phuthe',

              'phu-the-hue':
                'phuthehue',

              'phu-the-bac':
                'phuthebac',

              'phu-the-mien-bac':
                'phuthebac',

              'phuc-linh':
                'phuclinh',

              'banh-phuc-linh':
                'phuclinh'
            };

            const normalized =
              aliases[
                rawProduct
              ] ||
              rawProduct;

            const p =
              products[
                normalized
              ];

            if (p) {
              const d =
                document
                  .createElement(
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

              wrap.appendChild(
                d
              );

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
        }

        document
          .querySelectorAll(
            '.order-option input[type="checkbox"]'
          )
          .forEach(
            cb =>
              cb.addEventListener(
                'change',
                () => {
                  const option =
                    cb.closest(
                      '.order-option'
                    );

                  if (!option) {
                    return;
                  }

                  option.classList
                    .toggle(
                      'open',
                      cb.checked
                    );

                  option
                    .querySelectorAll(
                      'select,input[type="number"]'
                    )
                    .forEach(
                      el => {
                        el.required =
                          cb.checked;
                      }
                    );
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
            region ===
            'Huế'
          ) {
            phutheWrap
              .innerHTML = `
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
            phutheWrap
              .innerHTML = `
                <option value="Hộp giấy">
                  Hộp giấy
                </option>
              `;
          } else {
            phutheWrap
              .innerHTML = `
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
          if (!plHint) {
            return;
          }

          const flavor =
            plFlavor?.value ||
            '';

          const qty =
            Number(
              plQty?.value ||
              0
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
          } else if (
            price
          ) {
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
              .slice(
                0,
                10
              );
        }

        /* =============================
           GỬI ĐƠN HÀNG

           LUỒNG:
           1. Kiểm tra dữ liệu
           2. Lưu D1
           3. Nếu là đơn mới thì gửi Telegram
           4. D1 lưu thành công = đơn được ghi nhận
           ============================= */

        orderForm
          .addEventListener(
            'submit',
            async event => {
              event
                .preventDefault();

              if (
                typeof orderForm
                  .reportValidity ===
                  'function' &&
                !orderForm
                  .reportValidity()
              ) {
                document
                  .dispatchEvent(
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

              /*
                Request ID được giữ nguyên
                trong cùng một lần đặt hàng
                để chống tạo trùng đơn.
              */

              const requestId =
                sessionStorage
                  .getItem(
                    'uyen_uong_request_id'
                  ) ||
                createRequestId();

              sessionStorage
                .setItem(
                  'uyen_uong_request_id',
                  requestId
                );

              const orderPayload = {
                request_id:
                  requestId,

                customer_name:
                  String(
                    fd.get(
                      'name'
                    ) || ''
                  ).trim(),

                phone:
                  String(
                    fd.get(
                      'phone'
                    ) || ''
                  ).trim(),

                receive_date:
                  String(
                    fd.get(
                      'receive_date'
                    ) || ''
                  ),

                address:
                  String(
                    fd.get(
                      'address'
                    ) || ''
                  ).trim(),

                note:
                  String(
                    fd.get(
                      'note'
                    ) || ''
                  ).trim(),

                items: []
              };

              const lines = [
                '🛒 ĐƠN HÀNG MỚI - SHOP UYÊN ƯƠNG',
                '',
                '📦 SẢN PHẨM',
                ''
              ];

              /* Các món từ giỏ / đặt ngay */

              items.forEach(
                item => {
                  const p =
                    products[
                      item.id
                    ];

                  const options =
                    itemChoices(
                      item
                    );

                  const optionText =
                    Object.values(
                      options
                    )
                      .filter(
                        Boolean
                      )
                      .join(
                        ' · '
                      );

                  const optionLabel =
                    item.id ===
                    'mamqua'
                      ? 'Gói'
                      : (
                          item.id ===
                          'phuclinh'
                            ? 'Hương vị'
                            : (
                                [
                                  'phuthe',
                                  'phuthehue',
                                  'phuthebac'
                                ].includes(
                                  item.id
                                )
                                  ? 'Đóng gói'
                                  : 'Quy cách'
                              )
                        );

                  const unit =
                    item.id ===
                    'mamqua'
                      ? 'gói'
                      : (
                          item.id ===
                          'phuclinh'
                            ? 'cái'
                            : (
                                p
                                  ?.quantity
                                  ?.unit ||
                                'sản phẩm'
                              )
                        );

                  const currentPrice =
                    itemPrice(
                      item
                    );

                  const priceText =
                    currentPrice ===
                    'Giá liên hệ'
                      ? 'Liên hệ'
                      : currentPrice;

                  lines.push(
                    `• ${item.name}`,
                    `  ${optionLabel}: ${optionText || 'Theo yêu cầu'}`,
                    `  Số lượng: ${item.qty} ${unit}`,
                    `  Giá: ${priceText}`,
                    ''
                  );

                  orderPayload
                    .items
                    .push({
                      id:
                        item.id ||
                        '',

                      name:
                        item.name ||
                        '',

                      option:
                        itemLabel(
                          item
                        ),

                      quantity:
                        Number(
                          item.qty ||
                          1
                        ),

                      price_text:
                        currentPrice
                    });
                }
              );

              /* Mâm quả chọn thêm tại checkout */

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
                  '• Mâm quả cưới',
                  `  Gói: ${mamquaOption}`,
                  '  Số lượng: 1 gói',
                  '  Giá: Liên hệ',
                  ''
                );

                orderPayload
                  .items
                  .push({
                    id:
                      'mamqua',

                    name:
                      'Mâm quả cưới',

                    option:
                      mamquaOption,

                    quantity:
                      1,

                    price_text:
                      'Giá liên hệ'
                  });
              }

              /* Bánh phu thê chọn thêm */

              if (
                fd.get(
                  'want_phuthe'
                )
              ) {
                const region =
                  String(
                    fd.get(
                      'phuthe_region'
                    ) ||
                    ''
                  );

                const wrapOption =
                  String(
                    fd.get(
                      'phuthe_wrap'
                    ) ||
                    ''
                  );

                const qty =
                  Number(
                    fd.get(
                      'phuthe_qty'
                    ) ||
                    0
                  );

                if (
                  qty < 20
                ) {
                  alert(
                    'Bánh phu thê nhận đặt tối thiểu 20 bánh.'
                  );

                  document
                    .dispatchEvent(
                      new CustomEvent(
                        'order-send-failed'
                      )
                    );

                  return;
                }

                lines.push(
                  `• Bánh phu thê ${region}`,
                  `  Đóng gói: ${wrapOption}`,
                  `  Số lượng: ${qty} bánh`,
                  '  Giá: Liên hệ',
                  ''
                );

                orderPayload
                  .items
                  .push({
                    id:
                      'phuthe',

                    name:
                      'Bánh phu thê',

                    option:
                      [
                        region,
                        wrapOption
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          ' · '
                        ),

                    quantity:
                      qty,

                    price_text:
                      'Giá liên hệ'
                  });
              }

              /* Bánh phục linh chọn thêm */

              if (
                fd.get(
                  'want_phuclinh'
                )
              ) {
                const flavor =
                  String(
                    fd.get(
                      'phuclinh_flavor'
                    ) ||
                    ''
                  );

                const qty =
                  Number(
                    fd.get(
                      'phuclinh_qty'
                    ) ||
                    0
                  );

                const price =
                  phucLinhPrice(
                    flavor,
                    qty
                  );

                const priceText =
                  price
                    ? money(
                        price
                      )
                    : 'Giá liên hệ';

                lines.push(
                  '• Bánh phục linh',
                  `  Hương vị: ${flavor}`,
                  `  Số lượng: ${qty} cái`,
                  `  Giá: ${priceText === 'Giá liên hệ' ? 'Liên hệ' : priceText}`,
                  ''
                );

                orderPayload
                  .items
                  .push({
                    id:
                      'phuclinh',

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

              /* Không cho gửi đơn rỗng */

              if (
                !orderPayload
                  .items
                  .length
              ) {
                alert(
                  'Bạn chưa chọn sản phẩm để đặt hàng.'
                );

                document
                  .dispatchEvent(
                    new CustomEvent(
                      'order-send-failed'
                    )
                  );

                return;
              }

              const status =
                document
                  .getElementById(
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
                    ?.success !==
                    true
                ) {
                  throw new Error(
                    orderResult
                      ?.message ||
                    'Không thể lưu đơn hàng.'
                  );
                }
              } catch (
                error
              ) {
                console.error(
                  'D1 order API error:',
                  error
                );

                if (status) {
                  status
                    .textContent =
                      'Chưa thể ghi nhận yêu cầu. Vui lòng thử lại.';
                }

                document
                  .dispatchEvent(
                    new CustomEvent(
                      'order-send-failed'
                    )
                  );

                return;
              }

              const orderCode =
                orderResult
                  .order_code;

              const successCodeEl =
                document
                  .getElementById(
                    'success-order-code'
                  );

              if (
                successCodeEl
              ) {
                successCodeEl
                  .textContent =
                    orderCode;
              }

              /* Hiện mã đơn nếu có */

              const codeEl =
                document
                  .getElementById(
                    'confirmed-order-code'
                  );

              if (codeEl) {
                codeEl
                  .textContent =
                    orderCode;
              }

              /* Thêm mã đơn vào Telegram */

              lines.unshift(
                `Mã đơn: ${orderCode}`,
                ''
              );

              function formatDateVN(
                value
              ) {
                if (!value) {
                  return '';
                }

                const parts =
                  String(
                    value
                  ).split('-');

                if (
                  parts.length !==
                  3
                ) {
                  return value;
                }

                return (
                  `${parts[2]}/${parts[1]}/${parts[0]}`
                );
              }

              lines.push(
                '',
                `👤 Tên: ${orderPayload.customer_name}`,
                `📞 SĐT: ${orderPayload.phone}`,
                `📅 Ngày nhận: ${formatDateVN(orderPayload.receive_date)}`,
                `📍 Địa chỉ: ${orderPayload.address}`,
                `📝 Ghi chú: ${orderPayload.note || 'Không có'}`
              );

              const text =
                lines.join(
                  '\n'
                );

              const preview =
                document
                  .getElementById(
                    'order-preview'
                  );

              if (preview) {
                preview
                  .textContent =
                    text;

                preview
                  .classList
                  .add(
                    'show'
                  );
              }

              /* =============================
                 BƯỚC 2: GỬI TELEGRAM
                 ============================= */

              let telegramOk =
                false;

              if (
                orderResult
                  .duplicate ===
                true
              ) {
                telegramOk =
                  true;
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
                            text:
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
                } catch (
                  error
                ) {
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
                 ============================= */

              if (status) {
                if (
                  orderResult
                    .duplicate ===
                  true
                ) {
                  status
                    .textContent =
                      `Yêu cầu ${orderCode} đã được ghi nhận trước đó. Bạn không cần gửi lại.`;
                } else if (
                  telegramOk
                ) {
                  status
                    .textContent =
                      `Yêu cầu ${orderCode} đã được ghi nhận và gửi thông báo đến Shop. Shop sẽ liên hệ lại để xác nhận.`;
                } else {
                  status
                    .textContent =
                      'Shop Uyên Ương đã nhận được yêu cầu của bạn. Shop sẽ liên hệ để xác nhận sản phẩm, giá và thời gian giao nhận.';
                }
              }

              const successBox =
                document
                  .getElementById(
                    'order-success'
                  );

              successBox
                ?.classList
                .add(
                  'show'
                );

              /*
                D1 đã ghi nhận thành công.
                Xóa request ID để đơn sau
                có request ID mới.
              */

              sessionStorage
                .removeItem(
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

      if (!form) {
        return;
      }

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
            event
              .preventDefault();

            event
              .stopImmediatePropagation();

            return;
          }

          submitting =
            true;

          if (submitBtn) {
            submitBtn
              .disabled =
                true;

            submitBtn
              .textContent =
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
            submitBtn
              .disabled =
                false;

            submitBtn
              .textContent =
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
          submitBtn
            .disabled =
              true;

          submitBtn
            .textContent =
              '✓ Yêu cầu đã được ghi nhận';
        }

        /*
          Xóa giỏ hàng chỉ sau khi
          D1 xác nhận đã lưu đơn.
        */

        localStorage
          .removeItem(
            'uyen_uong_cart_v3'
          );

        sessionStorage
          .removeItem(
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
          modal
            .classList
            .add(
              'show'
            );

          modal
            .setAttribute(
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
            attributes:
              true,

            attributeFilter: [
              'class'
            ]
          }
        );

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

      /* =============================
         ĐÓNG POPUP
         ============================= */

      function closeModal() {
        if (!modal) {
          return;
        }

        modal
          .classList
          .remove(
            'show'
          );

        modal
          .setAttribute(
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
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      bootUyenUongApp,
      {
        once: true
      }
    );
  } else {
    bootUyenUongApp();
  }
})();
