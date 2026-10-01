# Shop Uyên Ương V2 — Triển khai Preview an toàn

Mục tiêu của bước này là đưa V2 lên **một môi trường Preview riêng**, không thay website V1 đang chạy và không đưa V2 vào `main`.

## 1. Mô hình an toàn được chọn

Dùng:

- Nhánh GitHub riêng: `v2-preview`
- Một Cloudflare Pages project riêng cho V2 Preview
- Build command: `node v2/scripts/build.mjs`
- Build output directory: `v2-preview`
- Node.js: `24`
- Biến `V2_DEPLOY_TARGET=preview` để toàn bộ Preview nhận `X-Robots-Tag: noindex, nofollow`

Không thay cấu hình Pages project Production hiện tại trong giai đoạn Preview.

## 2. GitHub

1. Từ commit Production hiện tại, tạo branch `v2-preview`.
2. Đưa toàn bộ source của checkpoint Phase II.9 vào branch này.
3. Không merge vào `main`.
4. Workflow `rebuild-v2-preview.yml` chỉ chạy cho branch `v2-preview`.

Sau khi Admin Preview lưu nội dung, API chỉ được phép ghi lại branch `v2-preview`.

## 3. Cloudflare Pages project riêng

Tạo một Pages project riêng, ví dụ `uyenuong-shop-v2-preview`, kết nối cùng repository.

Cấu hình:

- Production branch của project Preview: `v2-preview`
- Framework preset: None
- Root directory: repository root
- Build command: `node v2/scripts/build.mjs`
- Build output directory: `v2-preview`

Environment/Secrets của project Preview:

- `NODE_VERSION=24`
- `V2_DEPLOY_TARGET=preview`
- `GITHUB_CONTENT_BRANCH=v2-preview`
- `GITHUB_CONTENT_TOKEN=<secret>`
- D1 binding `DB` → database Preview riêng
- Telegram token/chat → ưu tiên kênh test

Không sử dụng D1 Production để thử đơn nếu chưa có phê duyệt riêng.

## 4. Access

Public Preview có thể để truy cập để kiểm giao diện.

Bắt buộc bảo vệ:

- `/admin/*`
- `/admin/api/*`

bằng Cloudflare Access trước khi thử chức năng Admin.

Không được để Admin API công khai chỉ vì đây là Preview.

## 5. Noindex Preview

Khi `V2_DEPLOY_TARGET=preview`, builder tạo rule:

```text
/*
  X-Robots-Tag: noindex, nofollow
```

Vì vậy Preview không được index ngay cả khi dùng một Pages project riêng.

Trước Production, không đặt `V2_DEPLOY_TARGET=preview`.

## 6. QA tự động sau deploy

Khi đã có URL Preview, chạy:

```sh
PREVIEW_BASE_URL=https://<preview-url> node v2/scripts/live-preview-qa.mjs
```

Script sẽ kiểm:

- HTTPS
- Preview không phải host Production
- public canonical routes trả 200
- toàn Preview có noindex
- Cart/Order noindex
- Admin và Admin API bị Access chặn khi chưa đăng nhập
- public Order API không mở GET ngoài ý muốn
- toàn bộ URL V1 trong `_redirects` trả 301 đúng đích

PASS tự động vẫn chưa thay thế kiểm bằng mắt và test D1/Telegram/Admin có đăng nhập.

## 7. Nghiệm thu thủ công bắt buộc

Thực hiện checklist `PREVIEW-QA-CHECKLIST.md`:

- PC 1440px
- Tablet 768px
- Mobile 390px
- Product configurators
- Cart → Checkout → D1 → Telegram
- Admin tạo Product D
- Upload ảnh từ điện thoại
- Đổi slug và kiểm redirect
- Orders đổi trạng thái

## 8. Điều kiện dừng

Dừng Preview và không sang Production nếu:

- Workflow đỏ
- Access chưa chặn Admin
- D1 binding chưa xác minh
- Telegram chưa kiểm
- redirect thật không trả 301
- có lỗi blocker trên mobile/checkout/admin

## 9. Production

Chỉ bắt đầu cutover Production sau một phê duyệt riêng.

Phase Preview không:

- merge `v2-preview` vào `main`
- thay root Production
- xóa V1
- migration D1 Production
- thay domain/canonical Production
