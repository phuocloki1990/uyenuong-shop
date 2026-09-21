-- B1.6: run on PREVIEW D1 first; production only after separate approval/backup.
-- Does not alter the existing orders table or any order records.
CREATE TABLE IF NOT EXISTS order_rate_limits (
  fingerprint TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  PRIMARY KEY (fingerprint, window_start)
);
CREATE INDEX IF NOT EXISTS idx_order_rate_limits_window
  ON order_rate_limits(window_start);
