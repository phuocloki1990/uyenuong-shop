import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_CATALOG } from '../../functions/_generated/v2-product-catalog.mjs';
import { OrderValidationError, normalizeOrderPayload, notificationText } from '../../functions/_shared/v2-order-policy.mjs';

function baseBody(items) {
  return {
    request_id: 'req-12345678',
    customer_name: 'Khách hàng',
    phone: '0901234567',
    receive_date: '2026-10-05',
    address: 'Bình Chánh, TP.HCM',
    note: '',
    items
  };
}

test('server derives trusted product name, price and option labels instead of browser text', () => {
  const payload = normalizeOrderPayload(baseBody([{
    product_id: 'banh-phu-the',
    name: 'Tên giả',
    price_text: '1đ',
    quantity: 20,
    configuration: { options: { packaging: { id: 'la-dua' } } }
  }]), PRODUCT_CATALOG);
  assert.equal(payload.items[0].name, 'Bánh phu thê');
  assert.equal(payload.items[0].price_text, 'Giá liên hệ');
  assert.equal(payload.items[0].option, 'Quy cách đóng gói: Lá dừa');
  assert.equal(payload.items[0].quantity, 20);
});

test('invalid product or option is rejected', () => {
  assert.throws(() => normalizeOrderPayload(baseBody([{
    product_id: 'khong-ton-tai', quantity: 1, configuration: { options: {} }
  }]), PRODUCT_CATALOG), error => error instanceof OrderValidationError && error.code === 'unknown_product');

  assert.throws(() => normalizeOrderPayload(baseBody([{
    product_id: 'banh-phu-the', quantity: 20,
    configuration: { options: { packaging: { id: 'hop-khong-ton-tai' } } }
  }]), PRODUCT_CATALOG), error => error instanceof OrderValidationError && error.code === 'invalid_option');
});

test('bánh phục linh hybrid pricing uses only approved 2 vị rules and falls back to contact', () => {
  const priced30 = normalizeOrderPayload(baseBody([{
    product_id: 'banh-phuc-linh', quantity: 30,
    configuration: { options: { 'flavor-count': { id: '2-vi' } } }
  }]), PRODUCT_CATALOG);
  assert.equal(priced30.items[0].option, 'Số vị: 2 vị');
  assert.equal(priced30.items[0].line_total, 180000);
  assert.equal(priced30.items[0].price_text, '180.000đ');

  const priced50 = normalizeOrderPayload(baseBody([{
    product_id: 'banh-phuc-linh', quantity: 50,
    configuration: { options: { 'flavor-count': { id: '2-vi' } } }
  }]), PRODUCT_CATALOG);
  assert.equal(priced50.items[0].line_total, 230000);
  assert.equal(priced50.items[0].price_text, '230.000đ');

  for (const [optionId, quantity] of [['2-vi',31],['5-vi',30]]) {
    const contact = normalizeOrderPayload(baseBody([{
      product_id: 'banh-phuc-linh', quantity,
      configuration: { options: { 'flavor-count': { id: optionId } } }
    }]), PRODUCT_CATALOG);
    assert.equal(contact.items[0].line_total, null);
    assert.equal(contact.items[0].price_text, 'Giá liên hệ');
  }
});

test('composite quantity is derived from selected components and client quantity is ignored', () => {
  const payload = normalizeOrderPayload(baseBody([{
    product_id: 'mam-qua-cuoi',
    quantity: 999,
    configuration: {
      receive_date: '2026-10-04',
      components: [
        { id: 'banh-phu-the', sub_options: { packaging: { id: 'hop-giay' } } },
        { id: 'trau-cau' },
        { id: 'khac', custom_text: 'Mứt cưới' }
      ]
    }
  }]), PRODUCT_CATALOG);
  assert.equal(payload.items[0].quantity, 3);
  assert.match(payload.items[0].option, /^3 mâm ·/);
  assert.match(payload.items[0].option, /Bánh phu thê \(Hộp giấy\)/);
  assert.match(payload.items[0].option, /Lễ vật khác: Mứt cưới/);
  assert.equal(payload.items[0].configuration.receive_date, '2026-10-05');
});

test('composite requires at least one component and valid sub-option', () => {
  assert.throws(() => normalizeOrderPayload(baseBody([{
    product_id: 'mam-qua-cuoi', configuration: { components: [] }
  }]), PRODUCT_CATALOG), error => error instanceof OrderValidationError && error.code === 'missing_components');

  assert.throws(() => normalizeOrderPayload(baseBody([{
    product_id: 'mam-qua-cuoi',
    configuration: { components: [{ id: 'banh-phu-the', sub_options: { packaging: { id: 'sai' } } }] }
  }]), PRODUCT_CATALOG), error => error instanceof OrderValidationError && error.code === 'invalid_option');
});

test('request, receive date and quantity validation are enforced', () => {
  assert.throws(() => normalizeOrderPayload({ ...baseBody([]), items: [{
    product_id: 'banh-phu-the', quantity: 19,
    configuration: { options: { packaging: { id: 'hop-giay' } } }
  }] }, PRODUCT_CATALOG), error => error instanceof OrderValidationError && error.code === 'invalid_quantity');

  assert.throws(() => normalizeOrderPayload({ ...baseBody([{
    product_id: 'banh-phu-the', quantity: 20,
    configuration: { options: { packaging: { id: 'hop-giay' } } }
  }]), receive_date: '2026-02-31' }, PRODUCT_CATALOG), error => error instanceof OrderValidationError && error.code === 'invalid_receive_date');
});


test('checkout receive date is authoritative for composite items (rule A)', () => {
  const payload = normalizeOrderPayload(baseBody([{
    product_id: 'mam-qua-cuoi',
    configuration: {
      receive_date: '2026-10-04',
      components: [{ id: 'trau-cau' }]
    }
  }]), PRODUCT_CATALOG);
  assert.equal(payload.receive_date, '2026-10-05');
  assert.equal(payload.items[0].configuration.receive_date, '2026-10-05');
});

test('telegram text is generated only from normalized order data', () => {
  const payload = normalizeOrderPayload(baseBody([{
    product_id: 'banh-phu-the', quantity: 20,
    configuration: { options: { packaging: { id: 'hop-giay' } }, note: 'Gói riêng giúp Shop' }
  }]), PRODUCT_CATALOG);
  const message = notificationText({ ...payload, order_code: 'UU-20261001-001' });
  assert.match(message, /Bánh phu thê/);
  assert.match(message, /Quy cách đóng gói: Hộp giấy/);
  assert.doesNotMatch(message, /Tên giả|1đ/);
  assert.match(message, /Ghi chú SP: Gói riêng giúp Shop/);
});
