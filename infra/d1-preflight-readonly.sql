-- SHOP UYÊN ƯƠNG V2 — D1 PRODUCTION PREFLIGHT (READ ONLY)
-- Chỉ đọc cấu trúc/schema. Không thay đổi dữ liệu.

PRAGMA table_info(orders);
PRAGMA index_list(orders);
SELECT name, type, sql
FROM sqlite_master
WHERE tbl_name = 'orders'
  AND type IN ('table','index','trigger')
ORDER BY type, name;

-- Kiểm tra các cột mà V2 cần nhưng không xuất dữ liệu khách hàng.
SELECT
  SUM(CASE WHEN request_id IS NULL OR request_id = '' THEN 1 ELSE 0 END) AS missing_request_id,
  SUM(CASE WHEN order_code IS NULL OR order_code = '' THEN 1 ELSE 0 END) AS missing_order_code,
  COUNT(*) AS total_orders
FROM orders;
