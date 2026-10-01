# Preview Configuration Checklist

## GitHub

- [ ] Branch `v2-preview` tồn tại.
- [ ] Không thay `main`.
- [ ] GitHub Actions trên `v2-preview` xanh.
- [ ] `GITHUB_CONTENT_TOKEN` chỉ cấp quyền tối thiểu cần thiết cho repository.

## Cloudflare Pages Preview project

- [ ] Project Preview riêng, không phải Production project hiện tại.
- [ ] Branch = `v2-preview`.
- [ ] Build command = `node v2/scripts/build.mjs`.
- [ ] Output = `v2-preview`.
- [ ] `NODE_VERSION=24`.
- [ ] `V2_DEPLOY_TARGET=preview`.
- [ ] `GITHUB_CONTENT_BRANCH=v2-preview`.
- [ ] `GITHUB_CONTENT_TOKEN` được lưu dưới dạng secret.

## Runtime

- [ ] D1 binding `DB` là Preview database.
- [ ] Không dùng D1 Production để test ngoài phê duyệt.
- [ ] Telegram dùng kênh test hoặc đã chấp nhận thông báo test.
- [ ] Cloudflare Access chặn `/admin/*`.
- [ ] Cloudflare Access chặn `/admin/api/*`.

## Sau deploy

- [ ] URL Preview ghi lại ở đây: ______________________________
- [ ] `X-Robots-Tag: noindex` trên `/`.
- [ ] `node v2/scripts/live-preview-qa.mjs` PASS.
- [ ] `PREVIEW-QA-CHECKLIST.md` hoàn tất.
