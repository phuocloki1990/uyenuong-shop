# Shop Uyên Ương V2

Production source for Shop Uyên Ương V2.

- `v2/`: DATA/UI source. UI implementation is locked by `DATA_UI_LOCK_SHA256.txt`; content under `v2/content/` remains Admin-managed.
- `assets/images/`: source media used by the builder and Admin media library.
- `functions/`: Cloudflare Pages Functions for orders and Admin APIs.
- `infra/`: build/promotion safety scripts.
- `.github/workflows/rebuild-v2-production.yml`: build → test → QA → promote workflow for `main`.

Do not edit generated public pages directly. Update content through Admin or the V2 source, then let the workflow rebuild the public root.


## Infra preflight

- D1 read-only schema check: `infra/d1-preflight-readonly.sql`.
- One-push cutover instructions are packaged outside source in `CUTOVER_ONE_PUSH.md`.
