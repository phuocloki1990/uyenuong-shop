import test from 'node:test';
import assert from 'node:assert/strict';
import { processOrder } from '../../functions/api/v2/orders/index.js';

class FakePrepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql;
    if (sql.includes("WHERE request_id = ?1")) {
      return this.db.rows.find(row => row.request_id === this.args[0]) || null;
    }
    if (sql.includes("SELECT * FROM orders WHERE id = ?1")) {
      return this.db.rows.find(row => row.id === Number(this.args[0])) || null;
    }
    if (sql.includes("SELECT COUNT(*) AS total") && sql.includes("source = 'website-v2'")) {
      const phone = this.args[0];
      return { total: this.db.rows.filter(row => row.source === 'website-v2' && row.phone === phone).length };
    }
    if (sql.includes("strftime('%Y%m%d'")) {
      const id = Number(this.args[0]);
      const row = this.db.rows.find(value => value.id === id);
      if (!row) return null;
      return { date_part: '20260928', daily_sequence: id };
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }
  async run() {
    const sql = this.sql;
    if (sql.includes('INSERT INTO orders')) {
      const id = this.db.rows.length ? Math.max(...this.db.rows.map(row => row.id)) + 1 : 1;
      const [order_code, request_id, customer_name, phone, receive_date, address, note, items_json] = this.args;
      this.db.rows.push({ id, order_code, request_id, customer_name, phone, receive_date, address, note, items_json, status:'new', source:'website-v2', telegram_sent:0, created_at:'2026-09-28 00:00:00', updated_at:'2026-09-28 00:00:00' });
      return { meta: { last_row_id: id, changes: 1 } };
    }
    if (sql.includes("SET order_code = ?1")) {
      const [code, id] = this.args;
      const row = this.db.rows.find(value => value.id === Number(id));
      if (row && String(row.order_code).startsWith('TMP-')) row.order_code = code;
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (sql.includes('telegram_sent = 2') && !sql.includes('telegram_sent = ?1')) {
      const id = Number(this.args[0]);
      const row = this.db.rows.find(value => value.id === id);
      if (!row || Number(row.telegram_sent) === 1) return { meta: { changes: 0 } };
      row.telegram_sent = 2;
      return { meta: { changes: 1 } };
    }
    if (sql.includes('telegram_sent = ?1')) {
      const [sent, id] = this.args;
      const row = this.db.rows.find(value => value.id === Number(id));
      if (row && Number(row.telegram_sent) === 2) row.telegram_sent = sent;
      return { meta: { changes: row ? 1 : 0 } };
    }
    throw new Error(`Unhandled run SQL: ${sql}`);
  }
}

class FakeDB {
  constructor(rows = []) { this.rows = rows; }
  prepare(sql) { return new FakePrepared(this, sql); }
}

function body(overrides = {}) {
  return {
    request_id: 'req-endpoint-1234',
    customer_name: 'Khách hàng',
    phone: '0901234567',
    receive_date: '2026-10-05',
    address: 'Bình Chánh, TP.HCM',
    note: '',
    items: [{ product_id:'banh-phu-the', quantity:20, name:'Tên giả', price_text:'1đ', configuration:{ options:{ packaging:{ id:'hop-giay' } } } }],
    ...overrides
  };
}

function context(db, payload, telegram = true) {
  return {
    request: new Request('https://example.test/api/v2/orders', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) }),
    env: { DB: db, TELEGRAM_BOT_TOKEN:'token', TELEGRAM_CHAT_ID:'chat' }
  };
}

test('endpoint persists trusted order before Telegram and ignores spoofed browser name/price', async () => {
  const db = new FakeDB();
  const originalFetch = globalThis.fetch;
  let fetchSawSavedOrder = false;
  let telegramBody = null;
  globalThis.fetch = async (_url, options) => {
    fetchSawSavedOrder = db.rows.length === 1 && !String(db.rows[0].order_code).startsWith('TMP-');
    telegramBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok:true }), { status:200, headers:{'content-type':'application/json'} });
  };
  try {
    const response = await processOrder(context(db, body()));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(fetchSawSavedOrder, true, 'D1/order code phải hoàn tất trước khi gửi Telegram');
    assert.equal(db.rows.length, 1);
    const stored = JSON.parse(db.rows[0].items_json);
    assert.equal(stored[0].name, 'Bánh phu thê');
    assert.equal(stored[0].price_text, 'Giá liên hệ');
    assert.doesNotMatch(telegramBody.text, /Tên giả|1đ/);
    assert.equal(db.rows[0].telegram_sent, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('same request_id is idempotent and does not insert a second order', async () => {
  const db = new FakeDB();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok:true }), { status:200, headers:{'content-type':'application/json'} });
  try {
    const first = await processOrder(context(db, body()));
    assert.equal((await first.json()).success, true);
    const second = await processOrder(context(db, body()));
    const result = await second.json();
    assert.equal(result.success, true);
    assert.equal(result.duplicate, true);
    assert.equal(db.rows.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('application rate limit returns 429 before insert and Telegram', async () => {
  const rows = [1,2,3].map(id => ({ id, order_code:`UU-20260928-00${id}`, request_id:`old-${id}-request`, customer_name:'Khách', phone:'0901234567', receive_date:'2026-10-01', address:'TP.HCM', note:'', items_json:'[]', status:'new', source:'website-v2', telegram_sent:1, created_at:'2026-09-28 00:00:00', updated_at:'2026-09-28 00:00:00' }));
  const db = new FakeDB(rows);
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('should not call'); };
  try {
    const response = await processOrder(context(db, body({ request_id:'req-rate-9999' })));
    const result = await response.json();
    assert.equal(response.status, 429);
    assert.equal(result.code, 'rate_limited');
    assert.equal(db.rows.length, 3);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('Telegram failure does not roll back a stored order', async () => {
  const db = new FakeDB();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok:false, description:'fail' }), { status:500, headers:{'content-type':'application/json'} });
  try {
    const response = await processOrder(context(db, body({ request_id:'req-telegram-fail' })));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.telegram_sent, false);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0].telegram_sent, 0);
  } finally { globalThis.fetch = originalFetch; }
});
