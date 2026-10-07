# Phase II.8 — QA & Preview Verification Report

Ngày kiểm tra: 2026-09-28

## Phạm vi

- Public V2: Home, 3 Product Detail, Cẩm nang Hub, Article Detail, Cart, Checkout, Contact.
- Commerce: trusted catalog, validation, idempotency, rate-limit, D1-before-Telegram.
- Admin V2: 9 route, content/media/order/settings flow ở mức automated/static test.
- SEO: canonical, sitemap, robots, noindex, redirects, slug history.
- Responsive/accessibility: static DOM/CSS checks cho desktop/tablet/mobile breakpoints, reduced motion, labels và navigation basics.
- Regression: V1 test suite giữ nguyên.

## Kết quả tự động

- 73/73 test pass.
- `node v2/scripts/build.mjs --check`: pass.
- Build V2 thực tế: pass.
- Preview static QA: 20 HTML, 26 internal link, 12 local asset; 0 lỗi.
- Local HTTP smoke test: 32 route/asset; 0 lỗi HTTP.
- GitHub workflow YAML: parse hợp lệ.
- JS syntax: pass qua test/build pipeline.
- Không còn internal public link `.html` trong V2.
- Không còn các legacy business term đã khóa bỏ trong runtime V2.
- Không còn Pages CMS/Git/Cloudflare terminology trong Admin UI.

## Accessibility / responsive fix trực tiếp từ QA

Phát hiện 9 control filter/search của Admin chưa có accessible name. Đã sửa bằng `aria-label` trong source renderer và build lại các Admin page tương ứng.

Sau sửa, static accessibility scan đạt:

- `lang=vi`: đạt.
- viewport meta: đạt.
- title/meta description theo phạm vi: đạt.
- H1 chính: có trên toàn bộ page.
- image `alt` attribute: đạt.
- form control accessible label: đạt.
- button accessible name: đạt.
- link rỗng/hash-only: không có.
- Admin/Cart/Order noindex: đạt.
- Site CSS có tablet/mobile breakpoint và `prefers-reduced-motion`.
- Admin CSS có mobile drawer/breakpoint và `prefers-reduced-motion`.

Contrast chính được kiểm tĩnh:

- `#8b1e28` trên trắng: khoảng 9.07:1.
- `#8b1e28` trên nền `#f8f5f0`: khoảng 8.34:1.
- text chính `#2e2926` trên trắng: khoảng 14.37:1.
- text muted `#766e68` trên trắng: khoảng 5.00:1.

Các cặp màu chính này đạt WCAG AA cho body text.

## Regression / surgical-change check

So với checkpoint Phase II.7:

- Không file V1 nào bị sửa.
- Chỉ thay đổi `render-admin.mjs`, workflow V2, các generated Admin HTML tương ứng và thêm QA/checklist Phase II.8.
- Không xóa file.
- Không thay đổi business flow, data model, D1 schema, Telegram flow hoặc public design structure.

## Chưa thể nghiệm thu trong môi trường cục bộ

Các mục dưới đây **chưa được coi là pass** cho đến khi chạy trên Cloudflare Preview thật:

- Pixel/visual comparison trên browser thật PC/tablet/mobile.
- Cloudflare Access chặn `/admin/*` ở Preview.
- D1 binding Preview và dữ liệu schema thật.
- Telegram secret/chat thật.
- HTTP redirect 301 do Cloudflare Pages thực thi.
- Header `X-Robots-Tag` do Cloudflare Pages thực thi.
- GitHub API thật khi Admin save/upload.
- GitHub Actions Node 24 thật.
- Upload ảnh thật trên điện thoại.

Chromium headless có sẵn trong môi trường kiểm tra nhưng không khởi chạy ổn định, vì vậy không dùng kết quả giả để tuyên bố responsive/pixel-perfect.

## Trạng thái

**Automated/local QA: PASS.**

**Preview infrastructure/visual QA: PENDING.**

Chưa đủ điều kiện gọi Production-ready cho tới khi hoàn thành checklist `PREVIEW-QA-CHECKLIST.md` trên Preview thật.
