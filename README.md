# Shop Uyên Ương

Website tĩnh được quản lý bằng Pages CMS + GitHub Actions; đơn hàng sử dụng Cloudflare Pages Functions và D1. README này mô tả mã nguồn hiện có; không phải xác nhận cấu hình Cloudflare Production.

## Nguồn dữ liệu và quy trình build

- Sản phẩm: `content/products/*.json`; bài viết: `content/articles/*.json`; chuyên mục: `content/categories/*.json`.
- Cấu hình Pages CMS: `.pages.yml`; builder: `scripts/build.mjs`.
- Builder tạo HTML, sitemap, redirect, catalog cho trình duyệt và `scripts/generated/product-catalog.mjs` cho API server. Hai catalog sinh từ **cùng dữ liệu CMS đã published**.
- Không chỉnh trực tiếp file generated hoặc `.cms-build-manifest.json`. Builder từ chối ghi đè file generated bị sửa ngoài CMS.
- Giỏ hàng/đặt hàng: `assets/js/app.js`, `dat-hang.html`, `gio-hang.html`.
- API tạo đơn: `functions/api/orders/index.js`; quy tắc đơn và giá: `scripts/order-policy.mjs`; Admin: `/admin/` và `/admin/api/`.
- Không thay đổi bảng D1 hoặc dữ liệu đơn đã lưu ở bước B1.

## Kiểm tra trước khi triển khai

```sh
node --version  # Workflow dùng Node.js 24
node --test scripts/build.test.mjs scripts/order-policy.test.mjs scripts/order-rate-limit.test.mjs scripts/content-branch.test.mjs
node scripts/build.mjs --check
node scripts/build.mjs
node scripts/build.mjs --check
```

Trong GitHub Actions, workflow thực sự chạy là `.github/workflows/rebuild-content.yml` (bản `rebuild-content.yml` tại gốc chỉ là bản sao tham khảo). Workflow phải được commit với Node.js 24 và phải commit luôn `scripts/generated/product-catalog.mjs` để API không dùng catalog cũ khi CMS đổi giá hoặc trạng thái sản phẩm.

**Đọc `B1-BAO-CAO-VA-NGHIEM-THU.md` trước khi đưa bản B1 lên Production.** Các kiểm tra Cloudflare Access, WAF/giới hạn tần suất và kết nối D1/Telegram trên Production cần làm riêng; bài kiểm thử cục bộ không thay thế được kiểm tra hạ tầng.

## Cập nhật trước merge B1 (22/09/2026)

- Phải giữ `scripts/order-rate-limit.test.mjs` (đúng đuôi `.mjs`); xóa file nhập sai tên `scripts/order-rate-limit.test` nếu có. Node có thể bỏ qua đường dẫn test không tồn tại mà không báo lỗi ở một số phiên bản.
- Ba API `/admin/api/content` dùng nhánh `main` trên domain Production hiện tại và dùng `GITHUB_CONTENT_BRANCH` trên domain Preview. Môi trường Preview thiếu cấu hình hoặc trỏ nhầm `main` phải từ chối truy cập GitHub.
- Các file này cần kiểm thử CMS Preview trước khi merge. Cấu hình Cloudflare Access và D1/Secret Production phải nghiệm thu riêng.
