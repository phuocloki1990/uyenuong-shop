# B1 – Kiểm tra quản lý và upload ảnh trước merge

Phạm vi: **chỉ nhánh `admin-products-final`**. Chưa merge `main`.

## Phát hiện khi rà bản DIFF
- `functions/admin/api/media/index.js` đã có GET danh sách và POST upload nhưng `admin/products.html` **chưa có nút upload/không gọi media API**.
- `functions/admin/api/content/save.js` chưa cho phép cập nhật trường `image` sản phẩm; upload xong chưa thể gắn ảnh qua Admin nội bộ.
- Chưa có test tự động cho media API.

## PATCH
1. `admin/products.html`: chọn ảnh từ danh sách, tải file JPG/PNG/WebP <=900 KB, gắn ảnh vào sản phẩm qua nút **Lưu thay đổi**; hỗ trợ bố cục sẵn có PC/tablet/mobile.
2. `functions/admin/api/media/index.js`: sử dụng chung bộ chọn nhánh CMS Production/Preview để tránh lệch nhánh.
3. `functions/admin/api/content/save.js`: chỉ nhận `image` thuộc `/assets/images/` (gồm `/uploads/`), kiểm tra ảnh tồn tại trong nhánh đang dùng trước khi ghi sản phẩm.
4. `scripts/media.test.mjs`: test API danh sách, upload, nhánh, file bất hợp lệ và lưu ảnh sản phẩm.
5. `.github/workflows/rebuild-content.yml`: chạy test mới và trigger theo thay đổi Admin/media; `rebuild-content.yml` gốc là bản tham khảo.

## Kiểm tra trên Preview
1. Ghi nhớ commit hiện tại của nhánh và đảm bảo Preview đã triển khai từ commit PATCH; không dùng Production cho kiểm thử.
2. Ẩn danh thử `/admin/api/media` phải bị Cloudflare Access chặn trước khi trả danh sách ảnh.
3. Trong Admin Preview → Quản lý sản phẩm → Bánh phu thê Huế, chọn ảnh JPG/PNG/WebP thử nghiệm **< 900 KB**, nhấn tải ảnh. Xác nhận JSON/console không có lỗi; GitHub Preview có commit `Admin: upload image ...` trong `assets/images/uploads/`.
4. Khi Pages Preview triển khai ảnh, chọn ảnh mới trong thư viện, bấm **Lưu thay đổi**. Xác nhận file sản phẩm JSON chỉ đổi `image` sang `/assets/images/uploads/...` trên `admin-products-final`, `main` không đổi.
5. Xác nhận trang sản phẩm Preview hiển thị ảnh mới. Mở lại Admin, đổi về ảnh gốc của sản phẩm và lưu; xác nhận preview hiển thị ảnh gốc. File ảnh thử có thể tồn tại trong thư viện, muốn xóa phải làm trên nhánh thử nghiệm sau khi chắc chắn không được sử dụng.
6. Kiểm tra trên PC và mobile: không bị tràn form; chọn ảnh, upload, lưu và thông báo lỗi.
7. Chưa merge cho tới khi workflow chạy **39/39**, Preview Success và kiểm thử ảnh trên thực tế đạt; xác minh GitHub token và Cloudflare Access Production còn đúng.

## Hạn chế
- Upload ảnh tạo file GitHub ngay. Việc chọn ảnh vào sản phẩm là commit riêng sau khi bấm Lưu thay đổi.
- Media API chỉ xác minh magic bytes JPG/PNG/WebP sơ bộ, không xử lý tối ưu kích thước hoặc xóa ảnh; ảnh tối đa 900 KB.
- Không tác động D1, đơn hàng hoặc dữ liệu khách hàng.
