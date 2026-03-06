-- ─────────────────────────────────────────────────────────────────────────────
-- TX2Pay Facebook Business Agent — Initial Schema
-- Run with: supabase db push  OR  paste into Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── posts ───────────────────────────────────────────────────────────────────
-- Stores every post (draft, scheduled, published, rejected)
create table if not exists posts (
  id              uuid primary key default gen_random_uuid(),
  fb_post_id      text unique,                    -- returned by Graph API after publish
  content         text not null,                  -- post body text
  image_urls      text[],                         -- optional image attachments
  status          text not null default 'draft'   -- draft | pending_approval | scheduled | published | rejected
                  check (status in ('draft','pending_approval','scheduled','published','rejected')),
  scheduled_at    timestamptz,                    -- null = publish immediately after approval
  published_at    timestamptz,
  created_by      text not null default 'agent',  -- 'agent' | 'human'
  approved_by     text,                           -- human reviewer identifier
  rejected_reason text,
  agent_notes     text,                           -- Claude's internal reasoning for this post
  metadata        jsonb default '{}',             -- extra KV store
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── comments ────────────────────────────────────────────────────────────────
-- Mirrors every comment received via webhook
create table if not exists comments (
  id              uuid primary key default gen_random_uuid(),
  fb_comment_id   text unique not null,
  fb_post_id      text not null,                  -- parent FB post ID
  post_id         uuid references posts(id),      -- our internal post FK (nullable for external posts)
  commenter_name  text,
  commenter_id    text,
  message         text not null,
  sentiment       text,                           -- positive | neutral | negative (set by agent)
  received_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- ─── comment_responses ───────────────────────────────────────────────────────
-- Claude drafts responses; a human approves before publishing
create table if not exists comment_responses (
  id              uuid primary key default gen_random_uuid(),
  comment_id      uuid not null references comments(id) on delete cascade,
  draft_response  text not null,                  -- Claude's suggested reply
  final_response  text,                           -- edited by human (or same as draft)
  status          text not null default 'draft'
                  check (status in ('draft','pending_approval','approved','published','rejected')),
  fb_reply_id     text,                           -- Graph API reply ID after posting
  agent_reasoning text,                           -- Claude's chain-of-thought
  approved_by     text,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── page_analytics ──────────────────────────────────────────────────────────
-- Periodic snapshots of page insights (pulled by cron job)
create table if not exists page_analytics (
  id              uuid primary key default gen_random_uuid(),
  period_start    date not null,
  period_end      date not null,
  impressions     bigint default 0,
  reach           bigint default 0,
  engaged_users   bigint default 0,
  page_fans       bigint default 0,
  post_engagements bigint default 0,
  reactions       bigint default 0,
  comments_count  bigint default 0,
  shares          bigint default 0,
  clicks          bigint default 0,
  raw_data        jsonb default '{}',
  fetched_at      timestamptz not null default now(),
  unique (period_start, period_end)
);

-- ─── post_analytics ──────────────────────────────────────────────────────────
-- Per-post engagement metrics
create table if not exists post_analytics (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts(id) on delete cascade,
  fb_post_id      text not null,
  impressions     bigint default 0,
  reach           bigint default 0,
  reactions       bigint default 0,
  comments_count  bigint default 0,
  shares          bigint default 0,
  clicks          bigint default 0,
  engagement_rate numeric(6,4) default 0,
  fetched_at      timestamptz not null default now()
);

-- ─── agent_memory ────────────────────────────────────────────────────────────
-- Persistent key-value memory for the Claude agent
create table if not exists agent_memory (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,               -- e.g. 'brand_voice', 'last_post_topics'
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- ─── agent_runs ──────────────────────────────────────────────────────────────
-- Audit log of every agent invocation
create table if not exists agent_runs (
  id              uuid primary key default gen_random_uuid(),
  trigger         text not null,                  -- 'cron_post' | 'webhook_comment' | 'manual' | 'cron_analytics'
  input           jsonb default '{}',
  output          jsonb default '{}',
  tools_used      text[],
  status          text not null default 'running'
                  check (status in ('running','completed','failed')),
  error_message   text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_posts_status         on posts(status);
create index if not exists idx_posts_scheduled_at   on posts(scheduled_at) where status = 'scheduled';
create index if not exists idx_comments_fb_post     on comments(fb_post_id);
create index if not exists idx_comment_responses_status on comment_responses(status);
create index if not exists idx_agent_runs_trigger   on agent_runs(trigger);
create index if not exists idx_agent_runs_created   on agent_runs(created_at desc);

-- ─── Updated-at triggers ─────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger posts_updated_at
  before update on posts
  for each row execute function update_updated_at();

create trigger comment_responses_updated_at
  before update on comment_responses
  for each row execute function update_updated_at();

create trigger agent_memory_updated_at
  before update on agent_memory
  for each row execute function update_updated_at();

-- ─── Seed agent memory defaults ──────────────────────────────────────────────
insert into agent_memory (key, value, description) values
  ('brand_voice', '{"tone":"professional yet approachable","avoid":["aggressive sales language","political topics","competitor mentions"],"emphasize":["ease of use","time savings","reliability","customer support"]}', 'TX2Pay brand voice guidelines for Claude'),
  ('post_topics', '{"rotate":["payment processing tips","invoicing best practices","small business finance","product features","customer success stories","industry news"],"last_used":[]}', 'Content topic rotation schedule'),
  ('business_context', '{"company":"TX2Pay","product":"payment and invoicing software","target_audience":"small and medium-sized businesses","key_differentiators":["fast payments","easy invoicing","integrations","24/7 support"]}', 'Core business context for content generation')
on conflict (key) do nothing;

-- Row Level Security (enable for production — adjust policies per your auth setup)
-- alter table posts enable row level security;
-- alter table comments enable row level security;
-- alter table comment_responses enable row level security;
-- alter table page_analytics enable row level security;
-- alter table post_analytics enable row level security;
-- alter table agent_memory enable row level security;
-- alter table agent_runs enable row level security;
