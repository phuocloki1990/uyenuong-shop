// Legacy V1 send-order endpoint intentionally disabled after V2 cutover.

export function onRequest() {
  return Response.json(
    { ok: false, message: 'Phiên gửi đơn cũ đã ngừng sử dụng. Vui lòng tải lại trang và thử đặt hàng lại.' },
    { status: 410, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } }
  );
}
