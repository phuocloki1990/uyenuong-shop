const ALLOWED_STATUSES = [
  'new',
  'processing',
  'completed',
  'cancelled'
];

function json(data, status = 200) {
  return Response.json(data, { status });
}

function isAdmin(request, env) {
  const auth =
    request.headers.get('Authorization') || '';

  if (!env.ADMIN_API_KEY) {
    return false;
  }

  return auth ===
    `Bearer ${env.ADMIN_API_KEY}`;
}


/* ========================================
   POST /api/orders
   KHÁCH TẠO ĐƠN
   Không yêu cầu quyền Admin
   ======================================== */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body =
      await request.json();

    const requestId =
      String(
        body.request_id || ''
      ).trim();

    const customerName =
      String(
        body.customer_name || ''
      ).trim();

    const phone =
      String(
        body.phone || ''
      ).trim();

    const receiveDate =
      String(
        body.receive_date || ''
      ).trim();

    const address =
      String(
        body.address || ''
      ).trim();

    const note =
      String(
        body.note || ''
      ).trim();

    const items =
      Array.isArray(body.items)
        ? body.items
        : [];

    if (
      !requestId ||
      !customerName ||
      !phone ||
      !receiveDate ||
      !address ||
      !items.length
    ) {
      return json(
        {
          success: false,
          message:
            'Thiếu thông tin bắt buộc.'
        },
        400
      );
    }

    /*
      Chống gửi trùng:
      nếu request_id đã tồn tại,
      trả lại mã đơn cũ.
    */

    const existing =
      await env.DB
        .prepare(`
          SELECT
            id,
            order_code
          FROM orders
          WHERE request_id = ?1
          LIMIT 1
        `)
        .bind(requestId)
        .first();

    if (existing) {
      return json({
        success: true,
        duplicate: true,
        order_code:
          existing.order_code,
        id:
          existing.id
      });
    }

    /*
      Tạo mã đơn:
      UU-YYYYMMDD-HHMMSS-XXXX
    */

    const now =
      new Date();

    const datePart =
      now
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '');

    const timePart =
      now
        .toISOString()
        .slice(11, 19)
        .replaceAll(':', '');

    const randomPart =
      crypto
        .randomUUID()
        .replaceAll('-', '')
        .slice(0, 4)
        .toUpperCase();

    const orderCode =
      `UU-${datePart}-${timePart}-${randomPart}`;

    const itemsJson =
      JSON.stringify(items);

    const result =
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
          )
          VALUES (
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
          orderCode,
          requestId,
          customerName,
          phone,
          receiveDate,
          address,
          note,
          itemsJson
        )
        .run();

    return json({
      success: true,
      duplicate: false,
      id:
        result.meta.last_row_id,
      order_code:
        orderCode
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
          'Không thể ghi nhận đơn hàng.'
      },
      500
    );
  }
}


/* ========================================
   GET /api/orders
   ADMIN LẤY DANH SÁCH ĐƠN
   ======================================== */

export async function onRequestGet(context) {
  const { request, env } = context;

  if (
    !isAdmin(request, env)
  ) {
    return json(
      {
        success: false,
        message:
          'Không có quyền truy cập.'
      },
      401
    );
  }

  try {
    const url =
      new URL(request.url);

    const status =
      String(
        url.searchParams.get(
          'status'
        ) || ''
      ).trim();

    const search =
      String(
        url.searchParams.get(
          'search'
        ) || ''
      ).trim();

    const rawLimit =
      Number(
        url.searchParams.get(
          'limit'
        ) || 50
      );

    const rawOffset =
      Number(
        url.searchParams.get(
          'offset'
        ) || 0
      );

    const limit =
      Math.min(
        Math.max(
          rawLimit || 50,
          1
        ),
        100
      );

    const offset =
      Math.max(
        rawOffset || 0,
        0
      );

    let where =
      'WHERE 1 = 1';

    const binds = [];

    if (
      status &&
      ALLOWED_STATUSES.includes(
        status
      )
    ) {
      binds.push(status);

      where +=
        ` AND status = ?${binds.length}`;
    }

    if (search) {
      binds.push(
        `%${search}%`
      );

      const n =
        binds.length;

      where += `
        AND (
          order_code LIKE ?${n}
          OR phone LIKE ?${n}
          OR customer_name LIKE ?${n}
        )
      `;
    }

    binds.push(limit);

    const limitIndex =
      binds.length;

    binds.push(offset);

    const offsetIndex =
      binds.length;

    const query = `
      SELECT
        id,
        order_code,
        customer_name,
        phone,
        receive_date,
        address,
        note,
        items_json,
        status,
        source,
        telegram_sent,
        internal_note,
        created_at,
        updated_at
      FROM orders

      ${where}

      ORDER BY
        CASE status
          WHEN 'new' THEN 1
          WHEN 'processing' THEN 2
          WHEN 'completed' THEN 3
          WHEN 'cancelled' THEN 4
          ELSE 5
        END,
        created_at DESC

      LIMIT ?${limitIndex}
      OFFSET ?${offsetIndex}
    `;

    const result =
      await env.DB
        .prepare(query)
        .bind(...binds)
        .all();

    const orders =
      (result.results || [])
        .map(order => {
          let items = [];

          try {
            items =
              JSON.parse(
                order.items_json ||
                '[]'
              );
          } catch (e) {
            items = [];
          }

          return {
            ...order,
            items,
            items_json:
              undefined
          };
        });

    return json({
      success: true,
      orders,
      count:
        orders.length
    });

  } catch (error) {
    console.error(
      'Get orders error:',
      error
    );

    return json(
      {
        success: false,
        message:
          'Không thể tải danh sách đơn.'
      },
      500
    );
  }
}
