// functions/api/send-order.js

/*
  Telegram đã chuyển sang
  POST /api/orders.

  Không còn chấp nhận nội dung
  Telegram tùy ý từ trình duyệt.
*/

export function onRequest() {

  return Response.json(
    {
      ok: false,
      message:
        'Endpoint này đã ngừng hoạt động. Vui lòng đặt hàng qua /api/orders.'
    },
    {
      status: 410,

      headers: {
        'Cache-Control':
          'no-store'
      }
    }
  );
}
