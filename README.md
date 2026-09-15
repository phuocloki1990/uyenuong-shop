# Shop Uyên Ương – V7 CMS-ready

Bản V7 giữ website tĩnh hiện tại nhưng bổ sung hệ thống quản trị nội dung miễn phí bằng Pages CMS + GitHub Actions.

## Quản trị
- Sản phẩm: `content/products/*.json`
- Bài viết SEO: `content/articles/*.json`
- Chuyên mục/chuyên mục con: `content/categories/*.json`
- Cấu hình Pages CMS: `.pages.yml`
- Script sinh HTML: `scripts/build.mjs`
- GitHub Action tự build: `.github/workflows/rebuild-content.yml`

Xem `ADMIN_SETUP.md` để cài lần đầu.

## Đơn hàng
Giai đoạn này chưa có backend đơn hàng. Phần này sẽ được nối Cloudflare D1 sau khi CMS nội dung chạy ổn.
