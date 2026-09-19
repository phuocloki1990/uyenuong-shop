function json(data, status = 200) {
  return Response.json(
    data,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store'
      }
    }
  );
}


/* ========================================
   GET /admin/api/orders/summary

   Thống kê đơn hàng từ D1.

   Trả về:
   - new
   - processing
   - completed
   - cancelled
   - total

   API thuộc khu /admin/*
   cần được bảo vệ bởi Cloudflare Access.
   ======================================== */

export async function onRequestGet(context) {

  const { env } =
    context;

  try {

    if (
      !env.DB
    ) {
      throw new Error(
        'D1 binding DB is missing'
      );
    }


    const result =
      await env.DB
        .prepare(`
          SELECT
            status,
            COUNT(*) AS total

          FROM orders

          GROUP BY status
        `)
        .all();


    const stats = {
      new: 0,
      processing: 0,
      completed: 0,
      cancelled: 0,
      total: 0
    };


    for (
      const row of
      result.results || []
    ) {

      const count =
        Number(
          row.total || 0
        );


      stats.total +=
        count;


      if (
        Object.prototype
          .hasOwnProperty
          .call(
            stats,
            row.status
          ) &&
        row.status !== 'total'
      ) {

        stats[
          row.status
        ] = count;

      }

    }


    return json({
      success: true,
      stats
    });


  } catch (error) {

    console.error(
      'Order summary error:',
      error
    );


    return json(
      {
        success: false,

        message:
          'Không thể tải thống kê đơn hàng.'
      },
      500
    );

  }

}
