-- Camera lens support: tag each snapshot with the lens it came from, and let
-- the owner choose which lens(es) the device should capture.

ALTER TABLE media_assets ADD COLUMN lens TEXT;

-- 'back' | 'front' | 'both'. Enforced in application code (Zod); SQLite cannot
-- add a CHECK constraint via ALTER.
ALTER TABLE device_settings ADD COLUMN camera_lens TEXT NOT NULL DEFAULT 'back';

CREATE INDEX idx_media_device_lens ON media_assets (device_id, lens, created_at DESC);
