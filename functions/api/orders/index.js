function json(data, status = 200) {
  return Response.json(data, { status });
}


/* ========================================
   POST /api/orders
   KHÁCH TẠO ĐƠN

   API công khai dành cho website đặt hàng.
   Phần quản trị đã chuyển sang:
   /admin/api/orders
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


    /* =====================================
       VALIDATE
       ===================================== */

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


    /* =====================================
       CHỐNG GỬI TRÙNG

       Nếu request_id đã tồn tại,
       trả lại đúng đơn cũ.
       ===================================== */

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


    /* =====================================
       TẠO MÃ ĐƠN TẠM

       Insert trước để D1 cấp ID.

       Sau đó hệ thống tạo mã chính thức:

       UU-YYYYMMDD-001
       UU-YYYYMMDD-002
       UU-YYYYMMDD-003

       Thứ tự tính theo ngày
       Việt Nam UTC+7.
       ===================================== */

    const temporaryOrderCode =
      `TMP-${crypto.randomUUID()}`;


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
          temporaryOrderCode,
          requestId,
          customerName,
          phone,
          receiveDate,
          address,
          note,
          itemsJson
        )
        .run();


    const orderId =
      result.meta.last_row_id;


    if (!orderId) {
      throw new Error(
        'Không thể xác định ID đơn hàng.'
      );
    }


    /* =====================================
       TÍNH SỐ THỨ TỰ ĐƠN TRONG NGÀY

       Dùng ID để xác định thứ tự nhằm
       tránh hai đơn cùng lúc lấy chung
       một số thứ tự.
       ===================================== */

    const orderSequence =
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
        .bind(orderId)
        .first();


    if (
      !orderSequence ||
      !orderSequence.date_part ||
      !orderSequence.daily_sequence
    ) {
      throw new Error(
        'Không thể tạo mã đơn.'
      );
    }


    const sequencePart =
      String(
        orderSequence.daily_sequence
      ).padStart(
        3,
        '0'
      );


    const orderCode =
      `UU-${orderSequence.date_part}-${sequencePart}`;


    /* =====================================
       CẬP NHẬT MÃ ĐƠN CHÍNH THỨC
       ===================================== */

    await env.DB
      .prepare(`
        UPDATE orders

        SET
          order_code = ?1,
          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = ?2
      `)
      .bind(
        orderCode,
        orderId
      )
      .run();


    /* =====================================
       RESPONSE
       ===================================== */

    return json({
      success: true,
      duplicate: false,
      id:
        orderId,
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
