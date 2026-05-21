-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-page support: associate campaigns (and via metadata, posts) with a
-- specific Facebook page managed via Publer.
-- page_key values: 'tx2pay' | 'endorsements'
-- ─────────────────────────────────────────────────────────────────────────────

alter table campaigns
  add column if not exists page_key text not null default 'tx2pay'
  check (page_key in ('tx2pay', 'endorsements'));

-- Update existing campaigns to default to tx2pay
update campaigns set page_key = 'tx2pay' where page_key is null;
