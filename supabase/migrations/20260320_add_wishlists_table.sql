create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, product_id)
);

alter table public.wishlists enable row level security;

drop policy if exists "wishlists 본인만" on public.wishlists;

create policy "wishlists 본인만" on public.wishlists
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
