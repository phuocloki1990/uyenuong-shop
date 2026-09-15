# Cài trang quản trị Shop Uyên Ương

Bản V7 dùng Pages CMS để quản lý nội dung trong GitHub. Không cần VPS và không cần database riêng cho sản phẩm/bài viết.

## Sau khi upload toàn bộ V7 lên GitHub

1. Mở https://app.pagescms.org/
2. Chọn Sign in with GitHub.
3. Cho phép Pages CMS truy cập repository Shop Uyên Ương.
4. Mở repository.
5. Pages CMS sẽ đọc file `.pages.yml` ở thư mục gốc.
6. Bạn sẽ thấy các nhóm:
   - Sản phẩm → Quản lý sản phẩm
   - Bài viết & SEO → Bài viết
   - Bài viết & SEO → Chuyên mục
   - Đơn hàng → hiện chỉ là ghi chú, sẽ làm D1 ở bước sau.

## Cách hoạt động

- Bạn sửa sản phẩm/bài viết trong Pages CMS.
- Pages CMS lưu thay đổi thành file trong thư mục `content/` trên GitHub.
- GitHub Actions chạy `scripts/build.mjs`.
- Hệ thống tự tạo lại HTML sản phẩm/bài viết và cập nhật `index.html`.
- Cloudflare Pages thấy GitHub thay đổi và tự deploy.

## Lưu ý quan trọng

- Không sửa trực tiếp file trong `content/` nếu bạn không cần.
- Các trang `san-pham/*.html` và `cam-nang/*.html` được sinh tự động từ dữ liệu CMS.
- Nếu muốn sửa nội dung sản phẩm, hãy sửa trong Pages CMS để tránh lần build sau ghi đè.
- Phần đơn hàng chưa dùng Pages CMS; bước tiếp theo sẽ nối Cloudflare D1.
