# B3 — Shop Uyên Ương

Bản cập nhật được xây dựng từ repo `phuocloki1990/uyenuong-shop`, nhánh `main`, tải ngày 16/09/2026. Chỉ làm trên bản sao cục bộ; chưa push GitHub, chưa triển khai website và chưa gửi đơn thử.

## Cách cập nhật

1. Giải nén `Shop-Uyen-Uong-B3-update.zip`.
2. Chép **toàn bộ file và thư mục bên trong** vào thư mục gốc repo, giữ đúng đường dẫn và cho phép thay thế các file cùng tên. Không chép thêm lớp thư mục `Shop-Uyen-Uong-B3-update` vào repo. Gói có cả thư mục `.github` và file `.cms-build-manifest.json`; cần đưa chúng lên cùng.
3. Commit các thay đổi trong một lần. Không chỉ thay riêng `scripts/build.mjs`, vì phiên bản này đi cùng giỏ hàng, catalog và workflow mới.
4. Xem GitHub Actions → Rebuild CMS content. Sau khi Action thành công, chờ Cloudflare Pages triển khai và kiểm tra website. Có thể chạy thủ công workflow nếu cần.

Nếu làm trên máy có Node.js 20 trở lên, chạy tại thư mục gốc repo:

```sh
node scripts/build.test.mjs
node scripts/build.mjs --check
node scripts/build.mjs
```

`--check` chỉ kiểm tra, không ghi file. Build thật kiểm tra toàn bộ dữ liệu và quyền sở hữu output trước khi ghi; lỗi dữ liệu không làm xóa trang hiện có.

## Những gì đã thay đổi

- Builder đọc products/articles/categories/settings, kiểm tra ID, slug, reference, parent cycle, kiểu dữ liệu, số lượng và quy tắc giá.
- Giữ URL sản phẩm `/san-pham/{slug}.html`, bài viết `/cam-nang/{slug}.html`; thêm chuyên mục `/chuyen-muc/{slug}.html` và nội dung từ chuyên mục con.
- Chỉ xuất bản nội dung published có toàn bộ chuỗi chuyên mục published. Chuyên mục ẩn kéo theo nội dung con không được xuất bản.
- Canonical, Open Graph, Product/Article/Organization/Breadcrumb JSON-LD và sitemap được sinh từ dữ liệu. Không tạo ngày đăng giả, giá 0 hoặc Offer chung cho giá theo quy cách.
- Ảnh alt, card highlights và SEO có fallback. Liên kết nội bộ dùng reference rõ ràng hoặc quan hệ chuyên mục đã xác định từ B2.3.
- Header/footer/contact của trang CMS và trang chủ lấy settings. Phần nội dung thủ công ngoài các vùng CMS được giữ lại.
- `assets/js/cms-catalog.js` được sinh từ sản phẩm đang xuất bản. Giỏ hàng và trang sản phẩm đọc giá từ catalog này thay vì giá cố định trong app.js.
- Số lượng và quy cách phải hợp lệ trước khi thêm giỏ/đặt ngay. Hai gói phục linh 30 cái được giữ thành hai dòng riêng, không cộng dồn thành một quy cách 60 cái.
- Trang giỏ hàng và đặt hàng có noindex. Quy trình lưu D1, thông báo và mã đơn không thay đổi trong B3.
- Workflow chạy tests, build và commit cả trang chuyên mục, sitemap, redirect, catalog, manifest. Không bỏ sót file mới hoặc file bị xóa.

## Giá được hiểu như thế nào

- `contact`: luôn liên hệ, không tính giá số.
- `fixed`: `base_price` là **đơn giá**; tổng = đơn giá × số lượng.
- `hybrid`: `price_rules[].price` là **tổng giá của quy cách khớp chính xác**. Không nhân thêm số lượng. Không khớp thì liên hệ.
- Hiện tại: 2 vị × 30 cái = 180.000đ; 2 vị × 50 cái = 230.000đ. Các quy cách khác chưa có giá.
- Quy tắc chồng điều kiện làm build dừng. Giỏ hàng tính lại khi số lượng đổi và khi tải catalog mới.

Giá hiển thị là báo giá phía trình duyệt cho luồng gửi yêu cầu. B3 không bổ sung cơ chế xác thực giá phía API hay thanh toán tự động.

## Đổi slug, ẩn nội dung và redirect

Manifest lưu các file builder sở hữu cùng dấu kiểm tra nội dung. Khi đổi slug, hidden/draft hoặc xóa JSON, lần build sau xóa đúng trang generated cũ. Không xóa theo toàn bộ thư mục.

Khi đổi slug của trang đã công khai, thêm đường dẫn cũ đầy đủ vào `redirect_from`, ví dụ `/san-pham/ten-cu.html`. Builder sinh rule 301 trong vùng riêng của `_redirects`. Không tự suy URL cũ từ tên file JSON. Nội dung bị ẩn không được dùng làm đích redirect.

Không sửa HTML generated thủ công. Nếu file đó đã bị sửa ngoài CMS, builder dừng để tránh ghi đè. Nếu chỉnh dữ liệu trong CMS, builder cập nhật bình thường.

7 trang cũ được đối chiếu với output của builder cũ trước khi chuyển sang manifest. `scripts/cms-legacy-pages.json` chỉ cho phép nhận diện đúng phiên bản đã kiểm tra, không nhận quyền sở hữu tùy tiện các trang khác.

## Phạm vi giữ nguyên và việc còn cần làm

- Không thay đổi bất kỳ JSON nào trong `content/`, `.pages.yml`, CSS, API D1 hoặc Admin.
- `content/orders-note.json` vẫn giữ nguyên; builder bỏ qua file này.
- Trang thủ công `/san-pham/banh-phu-the-tphcm.html` vẫn giữ nguyên và nằm ngoài manifest/sitemap CMS. Các liên kết trên trang thủ công này không được tự đồng bộ khi đổi slug sản phẩm.
- Nội dung và thông tin liên hệ viết tay trong trang đặt hàng/giỏ hàng/trang tổng quan không tự đồng bộ toàn bộ theo settings; B3 chỉ thêm catalog/noindex vào hai trang giỏ hàng và đặt hàng.
- `site_url` vẫn là `https://uyenuong-shop.pages.dev` theo dữ liệu. Chỉ đổi trong CMS khi đã xác định tên miền chính.
- Bổ sung ngày đăng thật cho 3 bài, alt ảnh và card_highlights khi thuận tiện. Hiện builder báo cảnh báo và dùng fallback đã thống nhất.
- Giá/mô tả/bố cục sản phẩm hiện tại được giữ theo nội dung. Các câu mang giọng ghi chú kỹ thuật trong features chưa được biên tập.
- Ảnh nội bộ hiện có đủ 5 đường dẫn được tham chiếu. Chưa kiểm tra dịch vụ bên ngoài, tài khoản mạng xã hội hoặc việc index của Google.

## Kết quả kiểm thử

- 12 nhóm kiểm thử tự động đạt: dữ liệu thực, lặp build ổn định, check không ghi, đổi slug, ẩn trang/chuyên mục, dữ liệu lỗi, giá chính xác, quy tắc chồng, bảo vệ HTML thủ công, redirect xung đột, cập nhật settings.
- Trình duyệt Edge chạy ẩn: lựa chọn bắt buộc, thêm hai gói riêng, tổng 360.000đ; sửa một gói thành 50 cái → 410.000đ; sửa thành 60 cái → phần chưa có giá; checkout, Đặt ngay, chuyên mục con, menu di động và không tràn ngang.
- Mô phỏng catalog đổi giá 180.000đ → 190.000đ: giá trên sản phẩm và giỏ hàng cùng cập nhật.
- Không thực hiện POST đơn hàng; chưa kiểm thử D1/Telegram/Cloudflare triển khai thật.

Gói ZIP chứa các file cần thêm/thay thế và output đã build để áp dụng cùng lúc. Tập tin `B3-FILES.json` liệt kê đường dẫn và SHA-256 của gói.
