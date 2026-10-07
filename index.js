// Legacy V1 order endpoint intentionally disabled after V2 cutover.

function gone() {
  return Response.json(
    { success: false, message: 'Phiên đặt hàng cũ đã ngừng sử dụng. Vui lòng tải lại trang và thử đặt hàng lại.' },
    { status: 410, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } }
  );
}

export function onRequest() {
  return gone();
}
