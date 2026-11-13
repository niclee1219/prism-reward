-- PRISM Run schema.
-- Row Level Security is on for every table with no policies, so the public (anon) key
-- can read and write nothing. All access goes through Edge Functions using the service role.

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  device_id     text not null unique,
  nickname      text not null,
  email         text,
  email_consent boolean not null default false,
  voted         boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists runs (
  id          uuid primary key,
  player_id   uuid not null references players (id) on delete cascade,
  score       int not null check (score >= 0),
  correct     int not null,
  wrong       int not null,
  gates       int not null,
  duration_ms int not null,
  vote_bonus  boolean not null default false,
  status      text not null default 'valid' check (status in ('valid', 'removed')),
  created_at  timestamptz not null default now()
);
create index if not exists runs_player_idx on runs (player_id, created_at desc);
create index if not exists runs_score_idx on runs (score desc) where status = 'valid';

create table if not exists prizes (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  stock  int not null check (stock >= 0),
  weight int not null check (weight >= 0)
);

create table if not exists spins (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null unique references runs (id) on delete cascade,
  prize_id    uuid references prizes (id),
  code        text not null unique,
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists config (
  key   text primary key,
  value text not null
);

create table if not exists rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

alter table players enable row level security;
alter table runs enable row level security;
alter table prizes enable row level security;
alter table spins enable row level security;
alter table config enable row level security;
alter table rate_limits enable row level security;

-- Best valid run per player. The vote bonus is applied here, at read time, once per player,
-- so switching it off in /admin removes it from the board immediately.
create or replace view leaderboard with (security_invoker = true) as
with cfg as (
  select
    coalesce((select value from config where key = 'vote_bonus_enabled'), 'false') = 'true' as enabled,
    least(greatest(coalesce((select value::numeric from config where key = 'vote_bonus_multiplier'), 1.1), 1.0), 1.2) as mult
),
best as (
  select distinct on (r.player_id) r.player_id, r.id as run_id, r.score, r.created_at
  from runs r
  where r.status = 'valid'
  order by r.player_id, r.score desc, r.created_at asc
)
select
  p.id as player_id,
  p.nickname,
  b.run_id,
  b.score as raw_score,
  case when cfg.enabled and p.voted then floor(b.score * cfg.mult)::int else b.score end as score,
  b.created_at
from best b
join players p on p.id = b.player_id
cross join cfg;

-- Defaults. Edit prizes and toggles live from /admin.
insert into config (key, value) values
  ('vote_bonus_enabled', 'true'),
  ('vote_bonus_multiplier', '1.1'),
  ('submissions_open', 'true'),
  ('fallback_weight', '60')
on conflict (key) do nothing;

-- PLACEHOLDER prizes: replace names, stock and weights before the event.
insert into prizes (name, stock, weight)
select * from (values
  ('PRISM tote bag', 20, 10),
  ('Kopi voucher', 40, 20),
  ('PRISM notebook', 30, 10)
) as v (name, stock, weight)
where not exists (select 1 from prizes);
