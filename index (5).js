import { PRODUCT_CATALOG } from '../../../_generated/v2-product-catalog.mjs';
import { OrderValidationError, normalizeOrderPayload, notificationText } from '../../../_shared/v2-order-policy.mjs';

const MAX_MESSAGE = 3900;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_ORDERS = 3;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

async function loadOrder(env, id) {
  const row = await env.DB.prepare(`
    SELECT * FROM orders WHERE id = ?1 LIMIT 1
  `).bind(id).first();
  if (!row) throw new Error('Không tìm thấy đơn vừa tạo.');
  let items = [];
  try { items = JSON.parse(row.items_json || '[]'); } catch { items = []; }
  return { ...row, items };
}

async function loadByRequestId(env, requestId) {
  const row = await env.DB.prepare(`
    SELECT * FROM orders WHERE request_id = ?1 LIMIT 1
  `).bind(requestId).first();
  if (!row) return null;
  let items = [];
  try { items = JSON.parse(row.items_json || '[]'); } catch { items = []; }
  return { ...row, items };
}

async function finalizeCode(env, order) {
  if (!String(order.order_code || '').startsWith('TMP-')) return order;
  const sequence = await env.DB.prepare(`
    SELECT
      strftime('%Y%m%d', current_order.created_at, '+7 hours') AS date_part,
      (
        SELECT COUNT(*)
        FROM orders AS counted_order
        WHERE date(counted_order.created_at, '+7 hours') = date(current_order.created_at, '+7 hours')
          AND counted_order.id <= current_order.id
      ) AS daily_sequence
    FROM orders AS current_order
    WHERE current_order.id = ?1
    LIMIT 1
  `).bind(order.id).first();
  if (!sequence?.date_part || !sequence.daily_sequence) throw new Error('Không thể tạo mã đơn.');
  const code = `UU-${sequence.date_part}-${String(sequence.daily_sequence).padStart(3, '0')}`;
  await env.DB.prepare(`
    UPDATE orders
    SET order_code = ?1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?2 AND order_code LIKE 'TMP-%'
  `).bind(code, order.id).run();
  return loadOrder(env, order.id);
}

async function rateLimited(env, phone) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE source = 'website-v2'
      AND phone = ?1
      AND created_at >= datetime('now', '-${RATE_LIMIT_WINDOW_MINUTES} minutes')
  `).bind(phone).first();
  return Number(row?.total || 0) >= RATE_LIMIT_MAX_ORDERS;
}

async function sendTelegram(env, order) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.error('Missing Telegram configuration');
    return false;
  }

  const claim = await env.DB.prepare(`
    UPDATE orders
    SET telegram_sent = 2, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?1
      AND (
        telegram_sent = 0
        OR (telegram_sent = 2 AND updated_at < datetime('now', '-2 minutes'))
      )
  `).bind(order.id).run();

  if (Number(claim.meta?.changes || 0) === 0) {
    const latest = await loadOrder(env, order.id);
    return Number(latest.telegram_sent) === 1;
  }

  let delivered = false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: notificationText(order) }),
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json();
    delivered = response.ok && result?.ok === true;
    if (!delivered) console.error('Telegram API returned error', result);
  } catch (error) {
    console.error('Telegram delivery failed', error);
  }

  try {
    await env.DB.prepare(`
      UPDATE orders
      SET telegram_sent = ?1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?2 AND telegram_sent = 2
    `).bind(delivered ? 1 : 0, order.id).run();
  } catch (error) {
    console.error('Unable to store telegram_sent', error);
    return false;
  }
  return delivered;
}

export async function processOrder(context) {
  const { request, env } = context;
  if (!env?.DB) return json({ success: false, message: 'Shop đang tạm thời chưa thể nhận đơn trực tuyến. Vui lòng nhắn Zalo hoặc gọi Shop để được hỗ trợ.' }, 503);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return json({ success: false, message: 'Yêu cầu phải là JSON.' }, 415);

  let raw;
  try { raw = await request.text(); } catch { return json({ success: false, message: 'Không đọc được dữ liệu.' }, 400); }
  if (raw.length > 65000) return json({ success: false, message: 'Đơn hàng quá dài.' }, 413);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ success: false, message: 'JSON không hợp lệ.' }, 400); }

  let payload;
  try {
    payload = normalizeOrderPayload(body, PRODUCT_CATALOG);
  } catch (error) {
    if (error instanceof OrderValidationError) return json({ success: false, code: error.code, message: error.message }, 400);
    throw error;
  }

  const preview = notificationText({ ...payload, order_code: 'UU-00000000-000000' });
  if (preview.length > MAX_MESSAGE) return json({ success: false, message: 'Đơn có quá nhiều nội dung để thông báo. Vui lòng rút ngắn ghi chú hoặc số sản phẩm.' }, 400);

  try {
    let order = await loadByRequestId(env, payload.request_id);
    let duplicate = Boolean(order);

    // Retry cùng request_id luôn được lấy lại trước khi áp dụng rate-limit.
    if (!order) {
      if (await rateLimited(env, payload.phone)) {
        return json({ success: false, code: 'rate_limited', message: 'Đã nhận quá nhiều đơn hàng. Vui lòng thử lại sau.' }, 429);
      }

      const temporaryOrderCode = `TMP-${crypto.randomUUID()}`;
      const inserted = await env.DB.prepare(`
        INSERT INTO orders (
          order_code, request_id, customer_name, phone, receive_date, address, note,
          items_json, status, source, telegram_sent, created_at, updated_at
        )
        SELECT
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
          'new', 'website-v2', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE NOT EXISTS (
          SELECT 1 FROM orders WHERE request_id = ?2
        )
      `).bind(
        temporaryOrderCode,
        payload.request_id,
        payload.customer_name,
        payload.phone,
        payload.receive_date,
        payload.address,
        payload.note,
        JSON.stringify(payload.items)
      ).run();

      if (Number(inserted.meta?.changes || 0) > 0) {
        const id = Number(inserted.meta?.last_row_id);
        if (!Number.isInteger(id) || id <= 0) throw new Error('Không xác định được ID đơn.');
        order = await loadOrder(env, id);
      } else {
        order = await loadByRequestId(env, payload.request_id);
        if (!order) throw new Error('Không tìm thấy đơn sau khi chống trùng request_id.');
        duplicate = true;
      }
    }

    order = await finalizeCode(env, order);
    const telegramSent = await sendTelegram(env, order).catch(error => {
      console.error('Notify task failed', error);
      return false;
    });

    return json({
      success: true,
      duplicate,
      id: order.id,
      order_code: order.order_code,
      telegram_sent: telegramSent
    });
  } catch (error) {
    console.error('Create V2 order error:', error);
    return json({ success: false, message: 'Không thể ghi nhận đơn hàng. Vui lòng thử lại.' }, 500);
  }
}

export function onRequestPost(context) {
  const task = processOrder(context);
  context.waitUntil?.(task);
  return task;
}
