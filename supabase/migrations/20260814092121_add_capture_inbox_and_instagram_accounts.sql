create table if not exists public.workspace_instagram_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null check (
    username ~ '^[A-Za-z0-9._]{1,30}$'
  ),
  label text not null check (char_length(label) between 1 and 80),
  source text not null default 'manual' check (
    source in ('manual', 'connected', 'demo')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_instagram_accounts_id_user_unique unique (id, user_id)
);

create unique index if not exists workspace_instagram_accounts_user_username_idx
  on public.workspace_instagram_accounts (user_id, lower(username));

alter table public.workspace_instagram_accounts enable row level security;

revoke all on table public.workspace_instagram_accounts from public, anon;
grant select, insert, update, delete on table public.workspace_instagram_accounts to authenticated;

drop policy if exists "Users can view their own Instagram accounts" on public.workspace_instagram_accounts;
create policy "Users can view their own Instagram accounts"
  on public.workspace_instagram_accounts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Instagram accounts" on public.workspace_instagram_accounts;
create policy "Users can create their own Instagram accounts"
  on public.workspace_instagram_accounts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Instagram accounts" on public.workspace_instagram_accounts;
create policy "Users can update their own Instagram accounts"
  on public.workspace_instagram_accounts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Instagram accounts" on public.workspace_instagram_accounts;
create policy "Users can delete their own Instagram accounts"
  on public.workspace_instagram_accounts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

alter table public.content_items
  add column if not exists instagram_account_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_items_instagram_account_owner_fkey'
  ) then
    alter table public.content_items
      add constraint content_items_instagram_account_owner_fkey
      foreign key (instagram_account_id, user_id)
      references public.workspace_instagram_accounts (id, user_id)
      on delete set null (instagram_account_id);
  end if;
end;
$$;

create table if not exists public.capture_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('audio', 'link', 'image', 'text', 'pdf')),
  title text not null check (char_length(title) between 1 and 180),
  body_text text not null default '',
  source_url text not null default '',
  tags text[] not null default '{}',
  file_name text,
  mime_type text,
  file_size bigint check (file_size is null or file_size between 0 and 20971520),
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capture_items_attachment_consistency check (
    (storage_path is null and file_name is null and mime_type is null and file_size is null)
    or
    (storage_path is not null and file_name is not null and mime_type is not null and file_size is not null)
  ),
  constraint capture_items_storage_owner check (
    storage_path is null or split_part(storage_path, '/', 1) = user_id::text
  )
);

create index if not exists capture_items_user_created_idx
  on public.capture_items (user_id, created_at desc);

alter table public.capture_items enable row level security;

revoke all on table public.capture_items from public, anon;
grant select, insert, update, delete on table public.capture_items to authenticated;

drop policy if exists "Users can view their own captures" on public.capture_items;
create policy "Users can view their own captures"
  on public.capture_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own captures" on public.capture_items;
create policy "Users can create their own captures"
  on public.capture_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own captures" on public.capture_items;
create policy "Users can update their own captures"
  on public.capture_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own captures" on public.capture_items;
create policy "Users can delete their own captures"
  on public.capture_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capture-inbox',
  'capture-inbox',
  false,
  20971520,
  array[
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own capture files" on storage.objects;
create policy "Users can read their own capture files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'capture-inbox'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own capture files" on storage.objects;
create policy "Users can upload their own capture files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'capture-inbox'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );

drop policy if exists "Users can update their own capture files" on storage.objects;
create policy "Users can update their own capture files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'capture-inbox'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'capture-inbox'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own capture files" on storage.objects;
create policy "Users can delete their own capture files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'capture-inbox'
    and owner_id = (select auth.uid())::text
  );

create or replace function public.set_capture_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_capture_item_updated_at() from public, anon;
grant execute on function public.set_capture_item_updated_at() to authenticated;

drop trigger if exists set_capture_item_updated_at on public.capture_items;
create trigger set_capture_item_updated_at
  before update on public.capture_items
  for each row execute function public.set_capture_item_updated_at();
