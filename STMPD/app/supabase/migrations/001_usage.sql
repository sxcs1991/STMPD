-- One row per signed-up user. Only edge functions (service role) write to it.
create table if not exists public.usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_used integer not null default 0,
  premium boolean not null default false,
  last_ip text,
  last_device text,
  updated_at timestamptz not null default now()
);

alter table public.usage enable row level security;

-- Users may read their own row; no client-side inserts/updates.
create policy "read own usage" on public.usage
  for select using (auth.uid() = user_id);
