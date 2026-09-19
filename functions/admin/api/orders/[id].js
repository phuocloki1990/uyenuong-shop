const ALLOWED_STATUSES = [
  'new',
  'processing',
  'completed',
  'cancelled'
];

function json(data, status = 200) {
  return Response.json(
    data,
    { status }
  );
}


/* ========================================
   GET /admin/api/orders/:id
   XEM CHI TIẾT 1 ĐƠN

   Quyền truy cập được bảo vệ bởi
   Cloudflare Access tại /admin/*
   ======================================== */

export async function onRequestGet(context) {
  const {
    env,
    params
  } = context;

  const id =
    Number(
      params.id
    );

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
      'Get admin order detail error:',
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
   PATCH /admin/api/orders/:id

   Cập nhật:
   - trạng thái
   - ghi chú nội bộ

   Quyền truy cập được bảo vệ bởi
   Cloudflare Access tại /admin/*
   ======================================== */

export async function onRequestPatch(context) {
  const {
    request,
    env,
    params
  } = context;

  const id =
    Number(
      params.id
    );

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
      'Update admin order error:',
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
