# Shop Uyên Ương V2 – Preview → Production

Tài liệu này chỉ dùng ở giai đoạn cutover. Phase II.7 **không tự triển khai Production, không xóa V1 và không migration D1**.

## 1. Trước Preview

- Giữ commit Production hiện tại để rollback.
- Chụp snapshot D1 trước mọi thay đổi Production.
- Xác nhận domain chính `https://shopuyenuong.vn` đang trỏ đúng dự án Cloudflare Pages trước khi dùng canonical Production.
- Preview phải dùng nhánh riêng; không cho Preview ghi vào `main`.
- Cấu hình `GITHUB_CONTENT_TOKEN`, `GITHUB_CONTENT_BRANCH`, D1 binding `DB`, Telegram secrets theo môi trường.

## 2. Nghiệm thu Preview

- Chưa đăng nhập: `/admin/*` và `/admin/api/*` phải bị Cloudflare Access chặn.
- Đăng nhập hợp lệ: tạo/sửa Product D, upload ảnh, viết bài, đổi slug và Publish được hoàn toàn trong Admin.
- Đổi slug phải tạo 301 từ URL cũ đến URL mới, sitemap/canonical chỉ chứa URL mới.
- Kiểm thử Giỏ hàng → Đặt hàng → D1 → Telegram → Success / Rate-limit.
- Retry cùng `request_id` không tạo đơn trùng.
- Telegram lỗi không làm mất đơn đã lưu D1.
- Kiểm PC/laptop, tablet, mobile; đặc biệt Product Editor và Media trên điện thoại.
- Kiểm URL V1 trong `_redirects` đều trả 301 đúng đích.

## 3. Trước Production

- Toàn bộ test CI Node 24 phải pass.
- `node v2/scripts/build.mjs --check` và build thật phải pass.
- `v2/release/cutover-plan.json` phải khớp output hiện tại.
- Không có URL `.html` trong sitemap hoặc internal links V2.
- Cart, Order, Admin có `noindex`; API trả `X-Robots-Tag: noindex, nofollow` ở endpoint V2.
- Không xóa V1 trước khi Production V2 đã nghiệm thu.

## 4. Cutover

Chỉ thực hiện sau phê duyệt riêng:

1. Ghi nhận commit Production trước cutover.
2. Đưa output V2 từ `v2-preview/` vào public root theo cutover plan.
3. Đưa `_redirects` và `_headers` V2 vào root.
4. Giữ Functions/D1/Access; không migration dữ liệu đơn nếu chưa có migration riêng được duyệt.
5. Deploy Preview/Production theo pipeline đã nghiệm thu.
6. Chạy smoke test ngay sau deploy.

## 5. Rollback

Nếu có lỗi nghiêm trọng:

- Quay lại commit Production trước cutover.
- Không rollback/xóa dữ liệu D1 đã phát sinh nếu chưa xác định rõ ảnh hưởng.
- Kiểm tra đơn phát sinh trong thời gian cutover trước khi thao tác tiếp.
