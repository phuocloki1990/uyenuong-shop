const ALLOWED_STATUSES = [
  'new',
  'processing',
  'completed',
  'cancelled'
];

function json(data, status = 200) {
  return Response.json(data, { status });
}


/* ========================================
   GET /admin/api/orders
   ADMIN LẤY DANH SÁCH ĐƠN

   Quyền truy cập được bảo vệ bởi
   Cloudflare Access tại /admin/*
   ======================================== */

export async function onRequestGet(context) {
  const { request, env } = context;

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
      'Get admin orders error:',
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
