# Shop Uyên Ương V2 — Preview QA Checklist

Mục đích của checklist này là nghiệm thu **Preview**, không phải triển khai Production.
Không xóa V1, không migration D1 và không thay đổi domain Production trong bước này.

## 1. Điều kiện trước khi mở Preview

- Dùng một nhánh riêng, khuyến nghị `v2-preview`; không dùng `main` để thử nghiệm.
- Build command: `node v2/scripts/build.mjs`.
- Build output directory: `v2-preview`.
- Node.js: 24.
- Preview phải có `GITHUB_CONTENT_TOKEN` và `GITHUB_CONTENT_BRANCH=v2-preview`.
- Preview Admin phải được Cloudflare Access bảo vệ tại `/admin/*`.
- D1 Preview phải được xác minh trước khi gửi đơn thử. Không tự tạo/migration bảng từ tài liệu này.
- Telegram Preview nên dùng kênh test nếu có; nếu dùng kênh thật, phải biết rõ đơn thử sẽ gửi thông báo thật.

## 2. Public UI — kiểm bằng mắt

Kiểm ít nhất ở desktop khoảng 1440px, tablet khoảng 768px và mobile khoảng 390px:

- Trang chủ: Header, Hero, 3 nhóm sản phẩm, Cách đặt hàng, Cẩm nang, FAQ, CTA, Footer.
- Bánh phu thê: gallery, Hộp giấy/Lá dừa, số lượng, ghi chú, summary, CTA.
- Mâm quả cưới: mặc định 0 mâm; tick lễ vật tăng số mâm; bỏ tick giảm; quy cách Bánh phu thê không tăng số mâm.
- Bánh phục linh: 4 vị + Vị khác; chọn Vị khác phải hiện ô ghi chú vị.
- Cẩm nang Hub và 3 bài chi tiết.
- Giỏ hàng: filled state và empty state.
- Đặt hàng: form state, success state, rate-limit state.
- Liên hệ: form 3 trường và success state.
- Hotline/Zalo nổi không che CTA hoặc field trên mobile.
- Không có horizontal scroll ngoài ý muốn.
- `prefers-reduced-motion` không làm mất nội dung hoặc chức năng.

## 3. Commerce — Preview thật

- Thêm từng loại sản phẩm vào giỏ và sửa/xóa được.
- Mâm quả mang ngày nhận sang Checkout; ngày sửa tại Checkout là ngày cuối cùng được gửi.
- Gửi đơn hợp lệ: D1 lưu trước, sau đó Telegram.
- Retry cùng `request_id` không tạo đơn thứ hai.
- Option không hợp lệ bị server từ chối.
- Browser sửa tên/giá giả không làm thay đổi dữ liệu server tin cậy.
- Gửi quá ngưỡng rate-limit phải thấy đúng state “Chưa thể gửi yêu cầu”.
- Telegram lỗi không được làm mất đơn đã lưu ở D1.

## 4. Admin — Preview thật

- Chưa đăng nhập: `/admin/*` và Admin API bị Cloudflare Access chặn.
- Đã đăng nhập: đủ 9 màn Admin.
- Tạo Product D → upload/chọn ảnh → Preview → Publish → URL mới sinh tự động.
- Product D không tự chen vào Header hoặc 3 nhóm chính Trang chủ.
- Sửa option sản phẩm → publish → trusted catalog cập nhật cùng lần build.
- Tạo/sửa bài Cẩm nang; block Paragraph/H2/H3/List/Image/Callout hoạt động.
- Tạo/sửa chuyên mục.
- Media upload JPG/PNG/WebP; tên file chuẩn hóa; duplicate bị chặn; usage hiển thị an toàn.
- Settings lưu đúng Shop/Hotline/Zalo/Fanpage/SEO.
- Orders đọc D1 và chuyển trạng thái: Mới → Đang xử lý → Hoàn thành / Đã hủy.
- Người vận hành không phải mở Pages CMS, GitHub hoặc Cloudflare để sửa nội dung.

## 5. SEO / URL / Redirect

- Preview không được index. Kiểm response header/Preview policy có `noindex` phù hợp.
- Sitemap chỉ chứa canonical V2.
- Cart, Order, Admin và API không index.
- Kiểm từng URL V1 quan trọng trả 301 trực tiếp sang URL V2 tương ứng.
- Đổi slug thử ở Preview: URL cũ phải 301 trực tiếp tới slug mới; sitemap chỉ giữ slug mới.
- Không có public internal link `.html`.

## 6. Điều kiện PASS để được sang Production

Chỉ PASS khi:

- Automated QA trên branch xanh hoàn toàn.
- Không có lỗi blocker/critical ở public flow, commerce hoặc Admin.
- PC/tablet/mobile đã kiểm bằng mắt trên Preview thật.
- Access, D1, Telegram, redirect HTTP thật đã kiểm.
- Có commit/backup Production trước cutover.
- Có snapshot D1 trước cutover.
- Có phương án rollback về commit trước đã xác nhận.

Nếu bất kỳ mục hạ tầng nào chưa xác minh, trạng thái vẫn là **Preview chưa nghiệm thu**, không được gọi là Production-ready.
