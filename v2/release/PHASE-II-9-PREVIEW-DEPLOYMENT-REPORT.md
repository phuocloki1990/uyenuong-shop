# Phase II.9 — Preview Deployment Preparation Report

Ngày: 2026-09-28

## Trạng thái

**Code/package Preview: READY.**

**Cloudflare/GitHub Preview thật: CHƯA TRIỂN KHAI**, vì bước này cần quyền đăng nhập/tài khoản bên ngoài.

Không thay Production, không merge main, không xóa V1, không migration D1.

## Thay đổi Phase II.9

- Workflow V2 chỉ tự chạy trên branch `v2-preview`.
- Build hỗ trợ `V2_DEPLOY_TARGET=preview` để thêm global `X-Robots-Tag: noindex, nofollow` cho toàn Preview.
- Production headers mặc định không bị thêm global noindex.
- Thêm `live-preview-qa.mjs` để kiểm Preview thật sau deploy.
- Thêm hướng dẫn triển khai Preview project riêng và checklist cấu hình.

## Automated/local QA

- 76/76 test pass.
- `node v2/scripts/build.mjs --check`: pass.
- `V2_DEPLOY_TARGET=preview node v2/scripts/build.mjs`: pass.
- Static Preview QA: pass.
- Preview `_headers` có global noindex khi build ở preview mode.
- Không có file bị xóa.
- Không có thay đổi V1 ngoài scope.

## Live Preview QA sẽ kiểm

Sau khi có URL Preview:

```sh
PREVIEW_BASE_URL=https://<preview-url> node v2/scripts/live-preview-qa.mjs
```

Kiểm:

- HTTPS và không nhầm Production host.
- Public canonical routes trả 200.
- Preview noindex.
- Cart/Order noindex.
- Admin/Admin API bị Access chặn khi chưa login.
- Order API GET không mở ngoài ý muốn.
- Toàn bộ legacy redirect trả 301 đúng đích.

## Các mục vẫn Pending

- GitHub branch `v2-preview` thật.
- Cloudflare Pages Preview project thật.
- Cloudflare Access thật.
- D1 Preview binding/schema thật.
- Telegram test thật.
- GitHub token/API thật.
- Visual QA PC/tablet/mobile trên browser thật.
- Live HTTP redirect/header QA.

Chỉ khi các mục này PASS mới được phê duyệt Production cutover.
