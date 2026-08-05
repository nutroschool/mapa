create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  format text not null check (format in ('Reel', 'Carrossel', 'Stories', 'YouTube')),
  pillar text not null default 'Educação',
  status text not null default 'Ideia' check (status in ('Ideia', 'Roteiro', 'Gravação', 'Edição', 'Agendado', 'Publicado')),
  scheduled_date date not null,
  duration text not null default '60s',
  hook text not null default '',
  script text not null default '',
  cta text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_items enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.content_items to authenticated;

drop policy if exists "Users can view their own content" on public.content_items;
create policy "Users can view their own content"
  on public.content_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own content" on public.content_items;
create policy "Users can create their own content"
  on public.content_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own content" on public.content_items;
create policy "Users can update their own content"
  on public.content_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own content" on public.content_items;
create policy "Users can delete their own content"
  on public.content_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_content_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_content_item_updated_at on public.content_items;
create trigger set_content_item_updated_at
  before update on public.content_items
  for each row execute function public.set_content_item_updated_at();

create index if not exists content_items_user_date_idx
  on public.content_items (user_id, scheduled_date);
