export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    const {
      request_id,
      customer_name,
      phone,
      receive_date,
      address,
      note,
      items
    } = body;

    if (
      !request_id ||
      !customer_name ||
      !phone ||
      !receive_date ||
      !address ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return Response.json(
        {
          success: false,
          message: "Thiếu thông tin bắt buộc."
        },
        { status: 400 }
      );
    }

    // Nếu request_id đã tồn tại thì trả lại đơn cũ,
    // không tạo thêm đơn mới.
    const existing = await env.DB
      .prepare(`
        SELECT order_code
        FROM orders
        WHERE request_id = ?1
        LIMIT 1
      `)
      .bind(request_id)
      .first();

    if (existing) {
      return Response.json({
        success: true,
        duplicate: true,
        order_code: existing.order_code
      });
    }

    const now = new Date();

    const datePart =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");

    const timePart =
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");

    const randomPart = crypto.randomUUID()
      .replace(/-/g, "")
      .slice(0, 4)
      .toUpperCase();

    const orderCode =
      `UU-${datePart}-${timePart}-${randomPart}`;

    const itemsJson = JSON.stringify(items);

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
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
          'new',
          'website',
          0,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `)
      .bind(
        orderCode,
        request_id,
        customer_name.trim(),
        phone.trim(),
        receive_date,
        address.trim(),
        note?.trim() || "",
        itemsJson
      )
      .run();

    return Response.json({
      success: true,
      duplicate: false,
      order_code: orderCode
    });

  } catch (error) {
    console.error("Create order error:", error);

    return Response.json(
      {
        success: false,
        message: "Không thể ghi nhận đơn hàng."
      },
      { status: 500 }
    );
  }
}
