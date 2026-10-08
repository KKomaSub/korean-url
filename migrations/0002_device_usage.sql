-- Version 2: browser fingerprint quota. Keep old daily_usage/IP rows untouched for reference.
-- Execute once against the SAME MEANING_DB configured for the Pages app.
CREATE TABLE IF NOT EXISTS device_usage (
  day TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  outage INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,device_hash)
);
CREATE INDEX IF NOT EXISTS idx_device_usage_day ON device_usage(day);
