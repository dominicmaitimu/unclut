create table public.mind_clutters (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  original_content text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  weight smallint not null default 3 check (weight between 1 and 5),
  status text not null default 'thought',
  status_before_archive text,
  category_id uuid,
  archived boolean not null default false,
  actions jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  map_position jsonb
);

alter table public.mind_clutters enable row level security;

create policy "Users can read their own mind clutters"
  on public.mind_clutters for select using (auth.uid() = user_id);
create policy "Users can create their own mind clutters"
  on public.mind_clutters for insert with check (auth.uid() = user_id);
create policy "Users can update their own mind clutters"
  on public.mind_clutters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own mind clutters"
  on public.mind_clutters for delete using (auth.uid() = user_id);

alter table public.mind_clutters add column if not exists status_before_archive text;
