// B1.6: D1-based backstop for VALID new public orders (not a general WAF).
// No raw IP addresses or phone numbers are stored in D1.
export const RATE_WINDOW_SECONDS = 10 * 60;
export const RATE_MAX_NEW_ORDERS = 6;

export class RateLimitConfigurationError extends Error {}

export async function consumeOrderRateLimit({ env, request, now = Date.now() }) {
  // Cloudflare supplies this header at its edge; never trust X-Forwarded-For.
  const ip = request.headers.get('cf-connecting-ip')?.trim();
  const secret = env.RATE_LIMIT_SECRET;
  if (!ip || typeof secret !== 'string' || secret.length < 32) {
    throw new RateLimitConfigurationError('Missing CF client IP or RATE_LIMIT_SECRET.');
  }
  if (!env.DB?.prepare) {
    throw new RateLimitConfigurationError('Missing D1 DB binding.');
  }

  const material = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', material.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, material.encode(ip)));
  const fingerprint = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  const seconds = Math.floor(now / 1000);
  const windowStart = Math.floor(seconds / RATE_WINDOW_SECONDS) * RATE_WINDOW_SECONDS;
  const retryAfter = Math.max(1, windowStart + RATE_WINDOW_SECONDS - seconds);

  // Keep at most 24 hours of pseudonymous counters, without modifying orders.
  await env.DB.prepare('DELETE FROM order_rate_limits WHERE window_start < ?1')
    .bind(windowStart - 86400).run();

  // Atomic SQLite write: concurrent requests cannot both pass when count reaches 6.
  // When over limit, WHERE prevents update and RETURNING produces no row.
  const row = await env.DB.prepare(`
    INSERT INTO order_rate_limits (fingerprint, window_start, request_count)
    VALUES (?1, ?2, 1)
    ON CONFLICT(fingerprint, window_start)
    DO UPDATE SET request_count = request_count + 1
      WHERE request_count < ?3
    RETURNING request_count
  `).bind(fingerprint, windowStart, RATE_MAX_NEW_ORDERS).first();

  return { allowed: Boolean(row), retryAfter };
}
