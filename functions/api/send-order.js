export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.TELEGRAM_BOT_TOKEN) {
      return Response.json(
        {
          ok: false,
          message: 'Thiếu TELEGRAM_BOT_TOKEN.'
        },
        { status: 500 }
      );
    }

    if (!env.TELEGRAM_CHAT_ID) {
      return Response.json(
        {
          ok: false,
          message: 'Thiếu TELEGRAM_CHAT_ID.'
        },
        { status: 500 }
      );
    }

    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return Response.json(
        {
          ok: false,
          message: 'Dữ liệu gửi lên không hợp lệ.'
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const text = String(body?.text || '').trim();

    if (!text) {
      return Response.json(
        {
          ok: false,
          message: 'Nội dung đơn hàng đang trống.'
        },
        { status: 400 }
      );
    }

    if (text.length > 10000) {
      return Response.json(
        {
          ok: false,
          message: 'Nội dung đơn hàng quá dài.'
        },
        { status: 400 }
      );
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: text
        })
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error('Telegram API error:', telegramData);

      return Response.json(
        {
          ok: false,
          message: 'Không gửi được Telegram.'
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      message: 'Đã gửi Telegram thành công.'
    });

  } catch (error) {
    console.error('send-order error:', error);

    return Response.json(
      {
        ok: false,
        message: 'Có lỗi khi gửi đơn hàng.'
      },
      { status: 500 }
    );
  }
}

export function onRequest(context) {
  return Response.json(
    {
      ok: false,
      message: 'Method not allowed.'
    },
    {
      status: 405,
      headers: {
        Allow: 'POST'
      }
    }
  );
}
