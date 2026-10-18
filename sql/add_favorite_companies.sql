-- 2026/10追加: お気に入り銘柄(マイポートフォリオ)の表。
-- Supabase(米国版)の SQL Editor に貼り付けて、1回だけ実行してください。
-- 「お気に入りに追加」した銘柄を、上場後は「100万円分を公募価格で買っていたら」のシミュレーションで追跡します。

create table if not exists public.favorite_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index if not exists favorite_companies_user_idx on public.favorite_companies (user_id);

alter table public.favorite_companies enable row level security;

-- 自分の行だけ、見る・追加する・消すことができる
drop policy if exists "favorite_companies_select_own" on public.favorite_companies;
create policy "favorite_companies_select_own" on public.favorite_companies
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "favorite_companies_insert_own" on public.favorite_companies;
create policy "favorite_companies_insert_own" on public.favorite_companies
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "favorite_companies_delete_own" on public.favorite_companies;
create policy "favorite_companies_delete_own" on public.favorite_companies
  for delete to authenticated using (auth.uid() = user_id);
