-- ─────────────────────────────────────────────────────────────────────────────
-- Campaign auto-scheduling + post → campaign tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- Track which campaign generated each post
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);

-- Auto-schedule config per campaign
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS auto_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_frequency_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS auto_quantity INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_auto_run TIMESTAMPTZ;

-- Index to make the cron auto-run query fast
CREATE INDEX IF NOT EXISTS idx_campaigns_auto_run
  ON campaigns (auto_enabled, next_auto_run)
  WHERE auto_enabled = TRUE AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_posts_campaign_id
  ON posts (campaign_id)
  WHERE campaign_id IS NOT NULL;
