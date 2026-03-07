-- ─────────────────────────────────────────────────────────────────────────────
-- TX2Pay Facebook Business Agent — Campaigns Schema
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── campaigns ────────────────────────────────────────────────────────────────
-- Pre-designed post campaign templates
create table if not exists campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  content_template text not null,        -- base post content / template
  image_urls       text[],               -- optional images to attach
  category         text,                 -- e.g. payment_tips | product_features | etc.
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_campaigns_active on campaigns(is_active);

create trigger campaigns_updated_at
  before update on campaigns
  for each row execute function update_updated_at();

-- ─── Seed sample campaigns ────────────────────────────────────────────────────
insert into campaigns (name, description, content_template, category) values
  (
    'Get Paid Faster Series',
    'Tips and tricks for accelerating invoice payments',
    'Tired of chasing invoices? TX2Pay helps small businesses get paid up to 3x faster with automated payment reminders and one-click checkout links. Stop spending time following up — start getting paid.

Try TX2Pay free → tx2pay.com

#GetPaidFaster #SmallBusiness #Invoicing #TX2Pay',
    'payment_tips'
  ),
  (
    'Product Feature Spotlight',
    'Highlight a specific TX2Pay feature with its key value prop',
    'Did you know TX2Pay lets you create and send a professional invoice in under 60 seconds?

No accounting degree required. Just add your client, set the amount, and hit send. Your client pays online — you get notified instantly.

See how it works → tx2pay.com

#TX2Pay #SmallBusiness #Invoicing #GetPaidFaster',
    'product_features'
  ),
  (
    'Small Business Finance Tips',
    'Broader financial health content for SMB owners',
    'Cash flow is the #1 reason small businesses fail. But it doesn''t have to be yours.

3 simple habits to protect your cash flow:
✅ Invoice immediately after delivering work
✅ Offer online payment options
✅ Set automatic payment reminders

TX2Pay handles all three automatically.

#SmallBusiness #CashFlow #BusinessFinance #TX2Pay',
    'small_business_finance'
  )
on conflict do nothing;
