# Shop Uyên Ương V2 – Production checklist

Tài liệu này dùng để kiểm tra pipeline Production hiện tại. Hệ thống chỉ vận hành từ branch `main` và Cloudflare Pages project `uyenuong-shop`.

## 1. Nền tảng Production

- Giữ commit Production hiện tại để rollback khi cần.
- D1 binding `DB`, Telegram secrets, Facebook secrets và `GITHUB_CONTENT_TOKEN` phải nằm trên project Production.
- Admin chỉ ghi nội dung vào branch `main`.
- Canonical Production hiện dùng `https://uyenuong-shop.pages.dev` cho đến khi Shop mua và gắn custom domain thật.

## 2. Nghiệm thu chức năng

- Chưa đăng nhập: `/admin/*` và `/admin/api/*` phải bị Cloudflare Access chặn.
- Đăng nhập hợp lệ: tạo/sửa sản phẩm, upload ảnh, viết bài, đổi slug và cập nhật website được trong Admin.
- Đổi slug phải tạo 301 từ URL cũ đến URL mới; sitemap/canonical chỉ chứa URL mới.
- Kiểm Giỏ hàng → Đặt hàng → D1 → Telegram → Success / Rate-limit.
- Retry cùng `request_id` không tạo đơn trùng.
- Telegram lỗi không làm mất đơn đã lưu D1.
- Kiểm PC/laptop, tablet, mobile ở các luồng chính.
- Kiểm URL V1 trong `_redirects` đều trả 301 đúng đích.

## 3. Build và QA trước khi promote

- Toàn bộ test CI Node 24 phải pass.
- `node v2/scripts/build.mjs --check` và build staging phải pass.
- `v2/release/cutover-plan.json` phải khớp output hiện tại.
- Không có URL `.html` trong sitemap hoặc internal links V2.
- Cart, Order, Admin có `noindex`; API trả `X-Robots-Tag: noindex, nofollow` ở endpoint V2.

## 4. Promote Production

Pipeline Production thực hiện theo thứ tự:

1. Build output vào thư mục staging nội bộ `v2-preview/`.
2. Chạy automated tests và static QA trên staging.
3. Promote output đã kiểm tra vào public root.
4. Giữ Functions, D1 và Cloudflare Access; không migration dữ liệu đơn.
5. Commit output Production bằng GitHub Actions bot và để Cloudflare deploy commit đó.

> `v2-preview/` ở đây chỉ là tên thư mục staging nội bộ của build, không phải branch hoặc Cloudflare Preview project.

## 5. Rollback

Nếu có lỗi nghiêm trọng:

- Quay lại commit Production trước thay đổi.
- Không rollback/xóa dữ liệu D1 đã phát sinh nếu chưa xác định rõ ảnh hưởng.
- Kiểm tra các đơn phát sinh trong thời gian deploy trước khi thao tác tiếp.
