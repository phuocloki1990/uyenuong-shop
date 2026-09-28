// functions/api/orders/index.js
// POST public: ghi D1, tạo mã đơn, gửi Telegram tại server.

const MAX_MESSAGE = 3900;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}

const string = value =>
  String(value ?? '').trim();


function formatDateVN(value) {
  const parts =
    string(value).split('-');

  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : string(value);
}


function normalizedItems(items) {
  return items.map(item => ({
    id: string(item.id),
    name: string(item.name),
    option: string(item.option),
    quantity: Number(item.quantity),
    price_text:
      string(item.price_text) ||
      'Giá liên hệ'
  }));
}


/* ========================================
   KIỂM TRA DỮ LIỆU ĐƠN HÀNG
   ======================================== */

function validate(body) {

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return 'Dữ liệu đơn hàng không hợp lệ.';
  }

  const fields = [
    ['request_id', 128],
    ['customer_name', 150],
    ['phone', 35],
    ['receive_date', 10],
    ['address', 600]
  ];

  for (const [key, max] of fields) {

    const value =
      string(body[key]);

    if (
      !value ||
      value.length > max
    ) {
      return `Thông tin ${key} không hợp lệ.`;
    }
  }

  if (
    string(body.note).length > 1000
  ) {
    return 'Ghi chú quá dài (tối đa 1.000 ký tự).';
  }

  const date =
    string(body.receive_date);

  const parsed =
    new Date(`${date}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    return 'Ngày nhận không hợp lệ.';
  }

  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 30
  ) {
    return 'Số dòng sản phẩm không hợp lệ (tối đa 30).';
  }

  for (const item of body.items) {

    if (
      !item ||
      typeof item !== 'object' ||
      !string(item.id) ||
      string(item.id).length > 80 ||
      !string(item.name) ||
      string(item.name).length > 180 ||
      string(item.option).length > 250 ||
      string(item.price_text).length > 100 ||
      !Number.isInteger(
        Number(item.quantity)
      ) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 100000
    ) {
      return 'Thông tin sản phẩm hoặc số lượng không hợp lệ.';
    }
  }

  return '';
}


/* ========================================
   ĐỊNH DẠNG THÔNG BÁO TELEGRAM

   Tạo tại server từ đơn đã lưu.
   Không nhận text tùy ý từ browser.
   ======================================== */

function notificationText(order) {

  const items =
    Array.isArray(order.items)
      ? order.items
      : [];

  const lines = [
    `Mã đơn: ${order.order_code}`,
    '',
    '🛒 ĐƠN HÀNG MỚI - SHOP UYÊN ƯƠNG',
    '',
    '📦 SẢN PHẨM',
    ''
  ];

  for (const item of items) {

    const id =
      string(item.id);

    const quantity =
      Number(item.quantity);

    const unit =
      id === 'mamqua'
        ? 'gói'
        : id === 'phuclinh'
          ? 'cái'
          : id.startsWith('phuthe')
            ? 'bánh'
            : 'sản phẩm';

    const label =
      id === 'mamqua'
        ? 'Gói'
        : id === 'phuclinh'
          ? 'Hương vị'
          : id.startsWith('phuthe')
            ? 'Đóng gói'
            : 'Quy cách';

    let option =
      string(item.option);

    /*
      Dữ liệu giỏ cũ có thể đã ghép
      số lượng vào phần quy cách.
      Không hiển thị số lượng hai lần.
    */

    if (id === 'phuclinh') {

      const suffix =
        ` · ${quantity} cái`;

      if (
        option.endsWith(suffix)
      ) {
        option =
          option.slice(
            0,
            -suffix.length
          );
      }
    }

    const rawPrice =
      string(item.price_text);

    const price =
      !rawPrice ||
      rawPrice === 'Giá liên hệ'
        ? 'Liên hệ'
        : rawPrice;

    lines.push(
      `• ${string(item.name)}`,
      `  ${label}: ${option || 'Theo yêu cầu'}`,
      `  Số lượng: ${quantity} ${unit}`,
      `  Giá: ${price}`,
      ''
    );
  }

  lines.push(
    `👤 Tên: ${string(order.customer_name)}`,
    `📞 SĐT: ${string(order.phone)}`,
    `📅 Ngày nhận: ${formatDateVN(order.receive_date)}`,
    `📍 Địa chỉ: ${string(order.address)}`,
    `📝 Ghi chú: ${string(order.note) || 'Không có'}`
  );

  return lines.join('\n');
}


/* ========================================
   LẤY ĐƠN TỪ D1
   ======================================== */

async function loadOrder(env, id) {

  const row =
    await env.DB
      .prepare(`
        SELECT *
        FROM orders
        WHERE id = ?1
        LIMIT 1
      `)
      .bind(id)
      .first();

  if (!row) {
    throw new Error(
      'Không tìm thấy đơn vừa tạo.'
    );
  }

  let items;

  try {

    items =
      JSON.parse(
        row.items_json ||
        '[]'
      );

  } catch {

    items = [];
  }

  return {
    ...row,
    items
  };
}


/* ========================================
   TẠO MÃ ĐƠN CHÍNH THỨC

   UU-YYYYMMDD-001
   UU-YYYYMMDD-002

   Giữ cách tính thứ tự theo ngày VN.
   ======================================== */

async function finalizeCode(
  env,
  order
) {

  if (
    !order.order_code.startsWith(
      'TMP-'
    )
  ) {
    return order;
  }

  const sequence =
    await env.DB
      .prepare(`
        SELECT

          strftime(
            '%Y%m%d',
            current_order.created_at,
            '+7 hours'
          ) AS date_part,

          (
            SELECT COUNT(*)

            FROM orders AS counted_order

            WHERE
              date(
                counted_order.created_at,
                '+7 hours'
              ) =
              date(
                current_order.created_at,
                '+7 hours'
              )

              AND counted_order.id <=
                  current_order.id

          ) AS daily_sequence

        FROM orders AS current_order

        WHERE
          current_order.id = ?1

        LIMIT 1
      `)
      .bind(order.id)
      .first();

  if (
    !sequence?.date_part ||
    !sequence.daily_sequence
  ) {
    throw new Error(
      'Không thể tạo mã đơn.'
    );
  }

  const code =
    `UU-${sequence.date_part}-${String(
      sequence.daily_sequence
    ).padStart(3, '0')}`;

  await env.DB
    .prepare(`
      UPDATE orders

      SET
        order_code = ?1,
        updated_at = CURRENT_TIMESTAMP

      WHERE
        id = ?2
        AND order_code LIKE 'TMP-%'
    `)
    .bind(
      code,
      order.id
    )
    .run();

  return loadOrder(
    env,
    order.id
  );
}


/* ========================================
   GỬI TELEGRAM TẠI SERVER

   telegram_sent:
   0 = chưa gửi / gửi thất bại
   2 = đang gửi
   1 = đã gửi thành công
   ======================================== */

async function sendTelegram(
  env,
  order
) {

  if (
    !env.TELEGRAM_BOT_TOKEN ||
    !env.TELEGRAM_CHAT_ID
  ) {

    console.error(
      'Missing Telegram configuration'
    );

    return false;
  }

  /*
    Đánh dấu đang gửi.

    Chỉ một request được nhận việc
    gửi thông báo cho một đơn.

    Cho phép phục hồi trạng thái 2
    bị treo quá 2 phút.
  */

  const claim =
    await env.DB
      .prepare(`
        UPDATE orders

        SET
          telegram_sent = 2,
          updated_at = CURRENT_TIMESTAMP

        WHERE
          id = ?1

          AND (
            telegram_sent = 0

            OR (
              telegram_sent = 2

              AND updated_at <
                datetime(
                  'now',
                  '-2 minutes'
                )
            )
          )
      `)
      .bind(order.id)
      .run();

  if (
    Number(
      claim.meta?.changes || 0
    ) === 0
  ) {

    const latest =
      await loadOrder(
        env,
        order.id
      );

    return Number(
      latest.telegram_sent
    ) === 1;
  }

  let delivered =
    false;

  try {

    const response =
      await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              chat_id:
                env.TELEGRAM_CHAT_ID,

              text:
                notificationText(
                  order
                )
            }),

          signal:
            AbortSignal.timeout(
              10000
            )
        }
      );

    const result =
      await response.json();

    delivered =
      response.ok &&
      result?.ok === true;

    if (!delivered) {

      console.error(
        'Telegram API returned error',
        result
      );
    }

  } catch (error) {

    console.error(
      'Telegram delivery failed',
      error
    );
  }

  /*
    Ghi kết quả về D1.
  */

  try {

    await env.DB
      .prepare(`
        UPDATE orders

        SET
          telegram_sent = ?1,
          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = ?2
          AND telegram_sent = 2
      `)
      .bind(
        delivered ? 1 : 0,
        order.id
      )
      .run();

  } catch (error) {

    console.error(
      'Unable to store telegram_sent',
      error
    );

    return false;
  }

  return delivered;
}


/* ========================================
   XỬ LÝ POST /api/orders
   ======================================== */

async function processOrder(context) {

  const {
    request,
    env
  } = context;

  const contentType =
    request.headers.get(
      'content-type'
    ) || '';

  if (
    !contentType.includes(
      'application/json'
    )
  ) {

    return json(
      {
        success: false,
        message:
          'Yêu cầu phải là JSON.'
      },
      415
    );
  }

  let raw;

  try {

    raw =
      await request.text();

  } catch {

    return json(
      {
        success: false,
        message:
          'Không đọc được dữ liệu.'
      },
      400
    );
  }

  if (
    raw.length > 65000
  ) {

    return json(
      {
        success: false,
        message:
          'Đơn hàng quá dài.'
      },
      413
    );
  }

  let body;

  try {

    body =
      JSON.parse(raw);

  } catch {

    return json(
      {
        success: false,
        message:
          'JSON không hợp lệ.'
      },
      400
    );
  }

  const problem =
    validate(body);

  if (problem) {

    return json(
      {
        success: false,
        message:
          problem
      },
      400
    );
  }

  const payload = {

    request_id:
      string(
        body.request_id
      ),

    customer_name:
      string(
        body.customer_name
      ),

    phone:
      string(
        body.phone
      ),

    receive_date:
      string(
        body.receive_date
      ),

    address:
      string(
        body.address
      ),

    note:
      string(
        body.note
      ),

    items:
      normalizedItems(
        body.items
      )
  };

  /*
    Telegram giới hạn kích thước tin.
    Không cắt giữa chừng làm mất
    sản phẩm hoặc thông tin khách.
  */

  const previewText =
    notificationText({
      ...payload,
      order_code:
        'UU-00000000-000000'
    });

  if (
    previewText.length >
    MAX_MESSAGE
  ) {

    return json(
      {
        success: false,
        message:
          'Đơn có quá nhiều nội dung để thông báo. Vui lòng rút ngắn ghi chú hoặc số sản phẩm.'
      },
      400
    );
  }

  try {

    /*
      Tìm theo request_id trước.
      Đây là cơ chế chống gửi lại đơn.
    */

    let order =
      await env.DB
        .prepare(`
          SELECT *
          FROM orders
          WHERE request_id = ?1
          LIMIT 1
        `)
        .bind(
          payload.request_id
        )
        .first();

    let duplicate =
      Boolean(order);

    if (!order) {

      const temporaryOrderCode =
        `TMP-${crypto.randomUUID()}`;

      try {

        const inserted =
          await env.DB
            .prepare(`
              INSERT INTO orders (

                order_code,
                request_id,
                customer_name,
                phone,
                receive_date,
                address,
                note,
                items_json,
                status,
                source,
                telegram_sent,
                created_at,
                updated_at

              ) VALUES (

                ?1,
                ?2,
                ?3,
                ?4,
                ?5,
                ?6,
                ?7,
                ?8,

                'new',
                'website',
                0,

                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP

              )
            `)
            .bind(
              temporaryOrderCode,
              payload.request_id,
              payload.customer_name,
              payload.phone,
              payload.receive_date,
              payload.address,
              payload.note,
              JSON.stringify(
                payload.items
              )
            )
            .run();

        const id =
          Number(
            inserted.meta?.last_row_id
          );

        if (
          !Number.isInteger(id) ||
          id <= 0
        ) {

          throw new Error(
            'Không xác định được ID đơn.'
          );
        }

        order =
          await loadOrder(
            env,
            id
          );

      } catch (error) {

        /*
          Nếu 2 yêu cầu trùng request_id
          đến gần như đồng thời và D1
          có UNIQUE(request_id), lấy lại
          đơn đã được ghi.
        */

        const concurrent =
          await env.DB
            .prepare(`
              SELECT *
              FROM orders
              WHERE request_id = ?1
              LIMIT 1
            `)
            .bind(
              payload.request_id
            )
            .first();

        if (!concurrent) {

          throw error;
        }

        order =
          concurrent;

        duplicate =
          true;
      }
    }

    /*
      Nếu lần trước bị ngắt sau khi
      INSERT mã TMP, cho phép hoàn tất
      mã đơn ở lần gọi lại.
    */

    order =
      await finalizeCode(
        env,
        order
      );

    /*
      Chỉ gửi Telegram từ đơn đã lưu
      và đã có mã chính thức.
    */

    const task =
      sendTelegram(
        env,
        order
      ).catch(error => {

        console.error(
          'Notify task failed',
          error
        );

        return false;
      });

    const telegramSent =
      await task;

    return json({

      success:
        true,

      duplicate,

      id:
        order.id,

      order_code:
        order.order_code,

      telegram_sent:
        telegramSent,

      notification_text:
        notificationText(
          order
        )
    });

  } catch (error) {

    console.error(
      'Create order error:',
      error
    );

    return json(
      {
        success: false,
        message:
          'Không thể ghi nhận đơn hàng. Vui lòng thử lại.'
      },
      500
    );
  }
}


/* ========================================
   POST PUBLIC DUY NHẤT
   ======================================== */

export function onRequestPost(context) {

  const task =
    processOrder(context);

  /*
    Cloudflare tiếp tục theo dõi tác vụ
    kể cả khi phía trình duyệt rời trang
    sau lúc request đã tới server.
  */

  context.waitUntil?.(
    task
  );

  return task;
}
