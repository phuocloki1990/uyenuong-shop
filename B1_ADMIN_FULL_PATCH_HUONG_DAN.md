# B1 – Admin quản lý sản phẩm: bản đồng bộ một lần

**Nguồn**: ZIP nhánh `admin-products-final` do chủ shop gửi ngày 22/09/2026. **Không merge PR #1 trước khi nghiệm thu Preview.**

## Cách cập nhật – KHÔNG sửa từng dòng code

1. Giải nén file PATCH. Các thư mục `admin`, `assets`, `functions`, `scripts`, `.github` nằm đúng cấu trúc repo. Chép **toàn bộ các thư mục và file trong ZIP vào thư mục gốc repo**, chọn **Replace/Overwrite** khi được hỏi; file mới tự tạo. **Không thay thế cả thư mục repo bằng ZIP PATCH** (vì PATCH chỉ gồm file thay đổi).
2. Commit/push toàn bộ file lên nhánh `admin-products-final`, KHÔNG lên `main`. Nếu dùng GitHub Desktop: copy đè trong thư mục repo, kiểm tra `Changes`, commit rồi push. Nếu dùng GitHub web: tải lên các file hoàn chỉnh trong đúng thư mục; **không cần mở file sửa từng dòng**. File `.github/workflows/rebuild-content.yml` là **bản đầy đủ**, không phải đoạn hướng dẫn thay dòng.
3. Đợi GitHub Actions và Cloudflare Preview xong. Chỉ thử nghiệm trên Preview; chưa merge PR #1.

## Phạm vi

- Giao diện Admin sản phẩm thiết kế lại cho PC/tablet/mobile; thư viện ảnh thu nhỏ, chọn ảnh, xem ảnh cũ/ảnh mới, upload.
- Tạo sản phẩm ở trạng thái **Bản nháp**, sửa toàn bộ các trường nghiệp vụ đã chốt: mã bất biến sau tạo, slug và URL cũ, chuyên mục, trạng thái, giá, số lượng, quy cách, nội dung, SEO, nội dung liên quan.
- Chữ gợi ý trong trường nhập + **Hướng dẫn ngắn** cho từng nhóm; so sánh dữ liệu cũ/mới và cảnh báo trước khi ghi GitHub.
- API mới `/admin/api/products/save` đọc dữ liệu phiên bản mới nhất, kiểm tra xung đột, chỉ dùng nhánh GitHub tương ứng Preview/Production; giữ nguyên API văn bản cũ.
- Builder hỗ trợ bản nháp chưa có ảnh/nội dung mô tả; không đưa bản nháp vào catalog, trang công khai hoặc API đơn hàng.
- **Không thêm xóa vĩnh viễn**, **không đổi D1**, **không đổi Telegram**, **không sửa dữ liệu 4 sản phẩm có sẵn**, **không đổi `main`**.

## Kiểm thử

Đã chạy cục bộ 54 bài test Node: 54 pass, 0 fail; chạy Builder và `--check` trên bản sao repo cũng đạt. Đã kiểm tra ID HTML/JS, không trùng hoặc thiếu và 7 nhóm đều có Hướng dẫn ngắn. **Chưa coi là nghiệm thu giao diện trực tiếp trên Cloudflare Preview**.

Trình tự nghiệm thu một lượt trên Preview sau khi upload: (1) Actions xanh; (2) PC/tablet/điện thoại không tràn ngang; (3) thumbnail thư viện, upload và xem trước ảnh; (4) tạo mới bản nháp, thấy không xuất bản/không đặt được; (5) cập nhật nháp đầy đủ rồi xuất bản; (6) đổi giá, số lượng, quy cách, kiểm tra cảnh báo và báo giá đúng; (7) đổi slug, kiểm tra redirect 301 và links; (8) đổi trạng thái Ẩn, bảo đảm API đơn hàng từ chối sản phẩm đã ẩn sau khi builder triển khai; (9) kiểm tra ảnh/giá và restore dữ liệu TEST; (10) xác minh `main` không thay đổi và Access chặn ẩn danh `/admin/api/products/save`.

**Lưu ý**: Upload ảnh ghi file ảnh lên GitHub ngay; gắn ảnh vào sản phẩm chỉ xảy ra sau khi bấm Lưu và xác nhận. Thông báo "Đã lưu GitHub" không đồng nghĩa "Cloudflare đã triển khai".
