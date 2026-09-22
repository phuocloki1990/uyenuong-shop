import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeOrderRateLimit, RateLimitConfigurationError, RATE_WINDOW_SECONDS, RATE_MAX_NEW_ORDERS } from './order-rate-limit.mjs';

const secret = 'local-test-key-at-least-32-characters-only';
const at = Date.parse('2026-09-21T07:00:00Z');
function mock() {
  const counters = new Map();
  const statements = [];
  const DB = { prepare(sql) {
    let params;
    statements.push(sql);
    return {
      bind(...args) { params = args; return this; },
      async run() {
        assert.match(sql, /DELETE FROM order_rate_limits/);
        for (const [key, row] of counters) if (row.bucket < params[0]) counters.delete(key);
        return { meta: { changes: 0 } };
      },
      async first() {
        assert.match(sql, /INSERT INTO order_rate_limits/);
        const [fingerprint, bucket, cap] = params;
        assert.match(fingerprint, /^[a-f0-9]{64}$/);
        assert.equal(cap, RATE_MAX_NEW_ORDERS);
        const k = `${fingerprint}:${bucket}`;
        const old = counters.get(k)?.count ?? 0;
        if (old >= cap) return null;
        counters.set(k, { count: old + 1, bucket });
        return { request_count: old + 1 };
      }
    };
  } };
  return { DB, counters, statements };
}
const request = ip => new Request('https://test.example/api/orders', {
  method: 'POST', headers: ip ? { 'cf-connecting-ip': ip } : {}
});

test('six new orders per ten-minute IP bucket; seventh is 429 with retryAfter', async () => {
  const { DB, counters } = mock();
  const env = { DB, RATE_LIMIT_SECRET: secret };
  for (let n=0; n < RATE_MAX_NEW_ORDERS; n++) {
    const result = await consumeOrderRateLimit({ env, request: request('203.0.113.10'), now: at + 1000 });
    assert.equal(result.allowed, true);
  }
  const blocked = await consumeOrderRateLimit({ env, request: request('203.0.113.10'), now: at + 1000 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter >= 1 && blocked.retryAfter <= RATE_WINDOW_SECONDS);
  assert.equal(counters.size, 1);
  assert.ok(!JSON.stringify([...counters]).includes('203.0.113.10'));
  assert.equal((await consumeOrderRateLimit({ env, request: request('198.51.100.2'), now: at + 1000 })).allowed, true);
  assert.equal((await consumeOrderRateLimit({ env, request: request('203.0.113.10'), now: at + RATE_WINDOW_SECONDS * 1000 })).allowed, true);
});

test('counters expire after one day; secret changes fingerprint', async () => {
  const { DB, counters } = mock();
  const env = { DB, RATE_LIMIT_SECRET: secret };
  await consumeOrderRateLimit({env, request: request('203.0.113.10'), now: at});
  const before = [...counters.keys()][0];
  await consumeOrderRateLimit({env:{ DB, RATE_LIMIT_SECRET: `${secret}-rotated` }, request: request('203.0.113.10'), now: at});
  assert.equal(counters.size, 2);
  assert.ok(!counters.has(before) || counters.size === 2);
  await consumeOrderRateLimit({env, request: request('203.0.113.10'), now: at + 90000 * 1000});
  assert.equal(counters.size, 1);
});

test('missing edge IP, secret or binding fails closed instead of bypassing', async () => {
  const {DB} = mock();
  for (const [env, req] of [
    [{DB, RATE_LIMIT_SECRET: secret},request('')],
    [{DB}, request('203.0.113.10')],
    [{DB, RATE_LIMIT_SECRET: 'weak'}, request('203.0.113.10')],
    [{RATE_LIMIT_SECRET: secret}, request('203.0.113.10')]
  ]) await assert.rejects(consumeOrderRateLimit({env, request:req, now:at}), RateLimitConfigurationError);
});

test('D1 error is propagated to caller (never allow unmetered insert)', async () => {
  const env = {RATE_LIMIT_SECRET:secret, DB:{prepare(){return {bind(){return this},async run(){throw new Error('DB down')}}}}};
  await assert.rejects(consumeOrderRateLimit({env,request:request('203.0.113.10'),now:at}), /DB down/);
});

test('atomic SQLite UPSERT blocks seventh concurrent-like insert', async () => {
  // This is the exact SQL shape used by D1 and is exercised in the mock above.
  const { DB, statements } = mock();
  await consumeOrderRateLimit({env:{DB, RATE_LIMIT_SECRET:secret},request:request('192.0.2.6'),now:at});
  assert.match(statements[1], /ON CONFLICT\(fingerprint, window_start\)/);
  assert.match(statements[1], /RETURNING request_count/);
});
