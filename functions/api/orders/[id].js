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
    request.headers.get(
      'Authorization'
    ) || '';

  if (!env.ADMIN_API_KEY) {
    return false;
  }

  return auth ===
    `Bearer ${env.ADMIN_API_KEY}`;
}


/* ========================================
   GET /api/orders/:id
   XEM CHI TIẾT 1 ĐƠN
   ======================================== */

export async function onRequestGet(context) {
  const {
    request,
    env,
    params
  } = context;

  if (
    !isAdmin(
      request,
      env
    )
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

  const id =
    Number(params.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return json(
      {
        success: false,
        message:
          'ID đơn hàng không hợp lệ.'
      },
      400
    );
  }

  try {
    const order =
      await env.DB
        .prepare(`
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
          WHERE id = ?1
          LIMIT 1
        `)
        .bind(id)
        .first();

    if (!order) {
      return json(
        {
          success: false,
          message:
            'Không tìm thấy đơn hàng.'
        },
        404
      );
    }

    try {
      order.items =
        JSON.parse(
          order.items_json ||
          '[]'
        );
    } catch (e) {
      order.items = [];
    }

    delete order.items_json;

    return json({
      success: true,
      order
    });

  } catch (error) {
    console.error(
      'Get order detail error:',
      error
    );

    return json(
      {
        success: false,
        message:
          'Không thể tải đơn hàng.'
      },
      500
    );
  }
}


/* ========================================
   PATCH /api/orders/:id

   Cập nhật:
   - trạng thái
   - ghi chú nội bộ
   ======================================== */

export async function onRequestPatch(context) {
  const {
    request,
    env,
    params
  } = context;

  if (
    !isAdmin(
      request,
      env
    )
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

  const id =
    Number(params.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return json(
      {
        success: false,
        message:
          'ID đơn hàng không hợp lệ.'
      },
      400
    );
  }

  try {
    const body =
      await request.json();

    const status =
      String(
        body.status || ''
      ).trim();

    const internalNote =
      String(
        body.internal_note || ''
      ).trim();

    if (
      !ALLOWED_STATUSES.includes(
        status
      )
    ) {
      return json(
        {
          success: false,
          message:
            'Trạng thái không hợp lệ.'
        },
        400
      );
    }

    const existing =
      await env.DB
        .prepare(`
          SELECT id
          FROM orders
          WHERE id = ?1
          LIMIT 1
        `)
        .bind(id)
        .first();

    if (!existing) {
      return json(
        {
          success: false,
          message:
            'Không tìm thấy đơn hàng.'
        },
        404
      );
    }

    await env.DB
      .prepare(`
        UPDATE orders
        SET
          status = ?1,
          internal_note = ?2,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?3
      `)
      .bind(
        status,
        internalNote,
        id
      )
      .run();

    return json({
      success: true,
      id,
      status,
      internal_note:
        internalNote
    });

  } catch (error) {
    console.error(
      'Update order error:',
      error
    );

    return json(
      {
        success: false,
        message:
          'Không thể cập nhật đơn hàng.'
      },
      500
    );
  }
}
