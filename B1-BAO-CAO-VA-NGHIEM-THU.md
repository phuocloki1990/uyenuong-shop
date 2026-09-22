# B1 – Báo cáo kỹ thuật và điều kiện nghiệm thu (21/09/2026)

> **Cập nhật 22/09/2026:** Các số liệu 20 test và trạng thái “chưa triển khai” bên dưới là bản ghi lịch sử ngày 21/09. Sau bản sửa pre-merge, bộ kiểm thử dự kiến **31 test** (Builder + Policy + Rate limit + Content branch). B1.6 đã được thử chặn trên Preview; D1 và Secret Production được người quản trị xác nhận đã chuẩn bị. **Chưa merge vào main, chưa nghiệm thu Production**, và phải kiểm tra GitHub Actions chạy thực tế đủ 31 test trên Node.js 24. Không dựa vào dòng “Success” nếu số test không đủ.

## Phạm vi đã chỉnh sửa ở bản mã nguồn này

| Mã | Hạng mục | Kết quả trong bản ZIP |
|---|---|---|
| B1.1 | Một mã cho mỗi sản phẩm | Checkout chọn thêm bánh Huế/Bắc gửi `phuthehue`/`phuthebac`, không ghi mã gộp `phuthe` mới. Có tiếp nhận định dạng cũ khi đủ thông tin. |
| B1.2 | Quy tắc giá và quy cách | Catalog private sinh từ JSON CMS published; server bỏ qua tên/giá từ trình duyệt, tính đúng tổng giá hybrid cho quy cách khớp; không tự suy giá quy cách khác. Đồng bộ gợi ý 65/105 bánh vào cả hai JSON bánh phu thê, vẫn cho nhập tự do từ 20. |
| B1.3 | Ngày nhận | Ngày tối thiểu tính theo ngày Việt Nam: từ ngày tiếp theo cho sản phẩm thường; mâm quả ít nhất 3 ngày; nhiều sản phẩm có mâm quả áp dụng 3 ngày. Không tự đặt giới hạn 5 ngày ở tương lai. |
| B1.4 | Kiểm tra đơn tại server | Chặn mã không tồn tại/ẩn, số lượng dưới min, quy cách sai, giá/tên giả mạo; giá và tên trong `items_json` lấy từ CMS. Giữ idempotency bằng `request_id`, mã đơn và Telegram hiện có. |
| B1.5 | Quyền Admin | **CẦN KIỂM TRA TRÊN CLOUDFLARE**. Không thay Access policy đang dùng; các route `/admin/*` bao gồm `/admin/api/*` phải bị chặn khi chưa đăng nhập. Không thể xác minh qua ZIP. |
| B1.6 | Chống spam | Giữ cơ chế khóa nút khi gửi và idempotency hiện có. **CHƯA CÓ GIỚI HẠN TẦN SUẤT SERVER/WAF ĐƯỢC KIỂM CHỨNG**; không được nghiệm thu hạng mục này chỉ dựa vào khóa nút. |
| B1.7 | Builder/CMS | Workflow chính và bản tham khảo đổi Node.js 20 → 24; builder sinh catalog private và bảo vệ bằng manifest; thêm test. Chạy test cục bộ ở Node.js 22 do môi trường kiểm tra không có Node 24; còn phải xác nhận CI trên Node 24. |
| B1.8 | URL/SEO | Không đổi slug/URL/canonical/redirect/sitemap. Builder `--check` thành công. Trang `san-pham/banh-phu-the-tphcm.html` là file legacy ngoài manifest, giữ nguyên, không tự xóa/chuyển hướng. |

## Những điều kiện phải xác minh trước khi deploy Production

1. **Lưu bản backup** repository/commit đang chạy và snapshot D1, giữ phương án quay lại commit trước nếu có sự cố. Không chạy migration hoặc xóa dữ liệu lịch sử.
2. Commit **đầy đủ file đã sửa**, đặc biệt `.github/workflows/rebuild-content.yml`, `scripts/generated/product-catalog.mjs`, `scripts/order-policy.mjs`, `scripts/order-policy.test.mjs`, `assets/js/app.js` và `functions/api/orders/index.js`. Upload file qua giao diện GitHub có thể bỏ sót thư mục `.github` ẩn.
3. Đọc GitHub Actions của commit B1, xác nhận Node.js **24**, 20 bài test đạt, build thành công, catalog private được commit cùng public catalog. Nếu pipeline fail thì không deploy.
4. Với Cloudflare Access, thử chế độ ẩn danh và chưa đăng nhập trên cả domain chính và Preview: GET `/admin/orders.html`, GET `/admin/api/orders`, GET `/admin/api/orders/summary`, GET `/admin/api/content?kind=products`, POST `/admin/api/content/save` và PATCH/PUT quản trị đơn đều phải bị chặn; chỉ tài khoản được cấp quyền mới xem/chỉnh sửa được.
5. Xác minh D1 binding `DB` ở Production và Preview, khóa UNIQUE trên `orders.request_id` bằng cấu trúc database thực tế. **Không tạo bảng, index hay sửa dữ liệu chỉ dựa trên tài liệu này**; nếu thiếu UNIQUE phải chuẩn bị migration có backup và nghiệm thu riêng.
6. Cấu hình quy tắc giới hạn tần suất POST `/api/orders`/Cloudflare WAF theo gói đang sử dụng. Kiểm thử gửi nhiều `request_id` khác nhau từ cùng nguồn: không được tạo hàng loạt đơn rác. Không chặn nhầm đơn hợp lệ khi khách đặt nhiều sản phẩm hoặc retry. Chỉ kích hoạt Production sau khi được phê duyệt.
7. Gửi thử: bánh Huế/Bắc 20, 65, 105 bánh; bánh phục linh 2 vị 30/50 và 5 vị; mâm quả 4/6/8/theo yêu cầu; ngày gần 00:00 VN; retry cùng ID; cập nhật trạng thái Admin; Telegram thất bại không mất đơn D1.
8. So sánh link cũ, sitemap, canonical, robots và trang legacy với bản đang chạy; kiểm tra PC, tablet, mobile. B1 chưa thiết kế lại UI/UX (đó là Bước 2).

## Lệnh kiểm tra cục bộ

```sh
node --test scripts/build.test.mjs scripts/order-policy.test.mjs
node scripts/build.mjs --check
node scripts/build.mjs
node scripts/build.mjs --check
```

Các trường tên, mã, giá, option được server dựng lại. `line_total` chỉ là **tổng tiền cho chính xác một dòng có quy tắc báo giá**, `null` nghĩa là liên hệ shop; không phải tổng tiền đơn khi còn sản phẩm cần báo giá. Lịch sử đơn cũ vẫn giữ nguyên JSON cũ, không có migration.

**Trạng thái:** bản mã nguồn đã được kiểm tra cục bộ, chưa được triển khai hoặc nghiệm thu ở Cloudflare Production.
