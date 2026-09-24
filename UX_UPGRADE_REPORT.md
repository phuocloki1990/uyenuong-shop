# Shop Uyên Ương — Nâng cấp UX và animation (24/09/2026)

## Phạm vi đã làm
- Giữ nguyên CMS, luồng đặt hàng, API Cloudflare/D1/Telegram, giá và quy tắc báo giá gốc.
- Sửa responsive của header đến 1020px, đồng bộ header giỏ hàng/đặt hàng qua builder và giữ nguyên các đường dẫn sản phẩm/chuyên mục.
- Trang chủ: bánh phu thê nổi bật trước; thay CTA sản phẩm bằng popup chọn đúng option/quantity từ UUCMS; bỏ khối gói mâm quả bị lặp; quy trình ba bước; FAQ bốn câu.
- CSS/JS riêng: css/storefront-ux.css và assets/js/storefront-ux.js (modal/bottom sheet, reveal, hover, phản hồi giỏ, reduced motion).
- Trang tổng quan bánh phu thê cũ không thuộc manifest được giữ nguyên, đồng bộ header và asset UX.
- Nhãn năm trường nhập tại trang đặt hàng liên kết đúng for/id.

## Kiểm tra
- node --check: app.js, storefront-ux.js, build.mjs đạt.
- node --test scripts/build.test.mjs: 12/12 đạt.
- node scripts/build.mjs và node scripts/build.mjs --check: thành công (4 sản phẩm, 3 bài, 6 chuyên mục; không xóa trang generated).
- Chromium qua HTML/CSS/JS nội tuyến (do môi trường chặn điều hướng HTTP/file): 320, 375, 414, 741, 768, 1024, 1440px không phát hiện scroll ngang hay JavaScript pageerror.
- Popup: thêm bánh Huế 65 chiếc/lá dừa vào giỏ được trong browser harness; bánh phục linh 2 vị x30 hiện 180.000đ, x31 chuyển giá liên hệ; Escape đóng modal; trạng thái menu cập nhật đúng.
- Ảnh tải tương đối của popup không được phản ánh chính xác trong bản harness nội tuyến (HTML không chạy trên origin của site); khi chạy Cloudflare Pages, ảnh sử dụng đúng URL /assets/images/....

## Chưa kiểm chứng / cần xác nhận sau
- Chưa chạy browser trên Cloudflare Pages/Preview thực tế; môi trường hiện tại chặn truy cập localhost và file URL.
- Chưa gửi đơn thật tới API, D1 hoặc Telegram; cần test ở môi trường đã cấu hình.
- Mô hình mâm bánh chia sẻ dữ liệu với bánh bán riêng chưa có cấu trúc field chuyên biệt trong ZIP gốc, nên không thêm nghiệp vụ mới khi chưa đủ đặc tả. Popup mâm quả chỉ dùng gói 4/6/8 mâm/theo yêu cầu đang được CMS cung cấp.
- Ngày cần nhận vẫn cho gửi yêu cầu gấp; FAQ nhắc đặt mâm quả trước 3–5 ngày; chưa chặn đơn gấp khi chưa có quy tắc chấp nhận/từ chối chốt.
- Các cảnh báo builder gốc: fallback card_highlights, bài viết thiếu ngày đăng và trang HTML legacy ngoài manifest vẫn được giữ, không ngầm sửa nội dung nghiệp vụ.

## Bàn giao
Đây là bản ZIP mã nguồn thay thế toàn bộ để kiểm tra trên Preview trước khi hợp nhất nhánh main. Không triển khai production tự động.
