import test from 'node:test';
import assert from 'node:assert/strict';
import { products } from './generated/product-catalog.mjs';
import { normalizeTrustedItems, minReceiveDate, vnDate } from './order-policy.mjs';
import { onRequestPost } from '../functions/api/orders/index.js';

const cake = (id = 'phuthehue', quantity = 20, wrap = 'Hộp giấy') => ({
  id, name: 'GIẢ MẠO', options: { wrap }, quantity, price_text: '1đ'
});
const linh = (flavor = '2 vị', quantity = 30) => ({
  id: 'phuclinh', name: 'GIẢ MẠO', options: { flavor }, quantity, price_text: '1đ'
});
const mam = (packageName = 'Gói 4 mâm') => ({
  id: 'mamqua', options: { package: packageName }, quantity: 1
});

const normalize = (...items) => normalizeTrustedItems(items);

test('catalog snapshot comes from published CMS products', () => {
  assert.deepEqual(Object.keys(products).sort(), ['mamqua', 'phuclinh', 'phuthebac', 'phuthehue'].sort());
  assert.equal(products.phuthehue.quantity.min, 20);
  assert.equal(products.phuthebac.option_groups[0].values.length, 1);
  assert.equal(products.mamqua.option_groups[0].values.length, 4);
});

test('ignore forged name/price; price is the exact CMS rule total', () => {
  assert.deepEqual(normalize(linh())[0], {
    id: 'phuclinh', name: 'Bánh phục linh', option: '2 vị', options: { flavor: '2 vị' },
    quantity: 30, line_total: 180000, price_text: '180.000đ'
  });
  assert.equal(normalize(linh('2 vị', 50))[0].line_total, 230000);
  assert.equal(normalize(linh('5 vị', 30))[0].line_total, null);
  assert.equal(normalize(linh('2 vị', 31))[0].price_text, 'Giá liên hệ');
  assert.equal(normalize(cake())[0].price_text, 'Giá liên hệ');
});

test('quantity, options and identity are validated against trusted catalog', () => {
  for (const item of [
    cake('phuthehue', 19), cake('phuthebac', 20, 'Lá dừa'),
    cake('phuthebac', 20.5), cake('unknown'),
    linh('7 vị'), {...linh(), quantity: '30'},
    mam('Gói 5 mâm')
  ]) assert.throws(() => normalize(item));
  assert.equal(normalize(cake('phuthebac', 105))[0].id, 'phuthebac');
  assert.equal(normalize(mam('Theo yêu cầu'))[0].line_total, null);
});

test('older form/cart options can be migrated without changing historic orders', () => {
  const old = normalize(
    {id:'phuthe', option:'Huế · Lá dừa', quantity:65, name:'Bánh phu thê'},
    {id:'mamqua', option:'4 mâm', quantity:1},
    {id:'phuclinh', option:'2 vị · 30 cái', quantity:30}
  );
  assert.equal(old[0].id, 'phuthehue');
  assert.equal(old[0].option, 'Lá dừa');
  assert.equal(old[1].option, 'Gói 4 mâm');
  assert.equal(old[2].line_total, 180000);
});

test('Vietnamese calendar boundaries, advance notice and leap day', () => {
  const beforeMidnight = new Date('2026-09-21T16:59:59Z');
  const afterMidnight = new Date('2026-09-21T17:00:01Z');
  assert.equal(vnDate(beforeMidnight), '2026-09-21');
  assert.equal(vnDate(afterMidnight), '2026-09-22');
  assert.equal(minReceiveDate(normalize(cake()), beforeMidnight), '2026-09-22');
  assert.equal(minReceiveDate(normalize(mam()), beforeMidnight), '2026-09-24');
  assert.equal(minReceiveDate(normalize(mam(), cake()), afterMidnight), '2026-09-25');
  assert.equal(minReceiveDate(normalize(mam()), new Date('2028-02-27T03:00:00Z')), '2028-03-01');
});

test('the public API rejects tampered orders before any D1 write', async () => {
  const valid = {
    request_id: 'case-001', customer_name: 'Khách hàng', phone: '0901234567',
    receive_date: '2099-01-01', address: 'TP.HCM', note: '',
    items: [linh('7 vị')]
  };
  for (const body of [
    valid,
    {...valid, items:[cake('phuthehue', 1)]},
    {...valid, items:[{...linh(), quantity:'30'}]},
    {...valid, items:[{...linh(), id:'missing'}]}
  ]) {
    const context = {
      request: new Request('https://example.com/api/orders', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
      }),
      env: {DB: {prepare(){throw new Error('D1 must not be called');}}}
    };
    const response = await onRequestPost(context);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
});

test('valid API request writes CMS-derived values and preserves request idempotency', async () => {
  const saved = [];
  const DB = {
    prepare(sql) {
      let params = [];
      return {
        bind(...args) {params = args; return this;},
        async first() {
          if (/WHERE request_id/.test(sql)) return saved.find(row => row.request_id === params[0]) || null;
          if (/WHERE id = \?1/.test(sql) && /SELECT \*/.test(sql)) return saved.find(row => row.id === params[0]) || null;
          if (/daily_sequence/.test(sql)) return {date_part:'20990101', daily_sequence: 1};
          throw new Error(`Unexpected SELECT: ${sql}`);
        },
        async run() {
          if (/INSERT INTO orders/.test(sql)) {
            const [order_code, request_id, customer_name, phone, receive_date, address, note, items_json] = params;
            const id = saved.length + 1;
            saved.push({id, order_code, request_id, customer_name, phone, receive_date,
              address, note, items_json, telegram_sent:0});
            return {meta:{last_row_id:id}};
          }
          if (/SET\s+order_code/.test(sql)) {
            saved.find(row => row.id === params[1]).order_code = params[0];
            return {meta:{changes:1}};
          }
          throw new Error(`Unexpected UPDATE: ${sql}`);
        }
      };
    }
  };
  const body = {
    request_id:'one-order', customer_name:'Khách hàng', phone:'0901234567',
    receive_date:'2099-01-01', address:'TP.HCM', note:'',
    items:[{...linh(), price_text:'1đ', name:'Tên gian lận'}]
  };
  const send = async () => {
    const context = {
      request:new Request('https://example.com/api/orders', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
      }), env:{DB}
    };
    const response = await onRequestPost(context);
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await send();
  assert.equal(first.success, true);
  assert.equal(first.duplicate, false);
  assert.equal(JSON.parse(saved[0].items_json)[0].price_text, '180.000đ');
  assert.equal(JSON.parse(saved[0].items_json)[0].name, 'Bánh phục linh');
  const second = await send();
  assert.equal(second.duplicate, true);
  assert.equal(saved.length, 1);
  assert.equal(second.order_code, first.order_code);
});
