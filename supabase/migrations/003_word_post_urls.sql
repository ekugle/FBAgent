-- ─────────────────────────────────────────────────────────────────────────────
-- TX2Pay Facebook Business Agent — Word Post URL Rotation
-- ─────────────────────────────────────────────────────────────────────────────

-- URL rotation table for Word Posts
create table if not exists word_post_urls (
  id         uuid primary key default gen_random_uuid(),
  url        text unique not null,
  label      text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed the 5 default URLs
insert into word_post_urls (url, label) values
  ('https://tx2pay.com/field-service-software', 'Field Service Software'),
  ('https://tx2pay.com/proposals', 'Proposals'),
  ('https://tx2pay.com/side-hustle', 'Side Hustle'),
  ('https://tx2pay.com/scheduling', 'Scheduling'),
  ('https://tx2pay.com/startup', 'Startup')
on conflict (url) do nothing;

-- Tracking memory for repeat-avoidance across sessions
insert into agent_memory (key, value, description) values
  ('hustle_tracking', '{"used_this_week":[],"week_start":""}', 'Tracks service businesses used this week to avoid repetition'),
  ('word_post_tracking', '{"used_today":[],"today_date":""}', 'Tracks URLs used today to avoid same-day repetition')
on conflict (key) do nothing;
