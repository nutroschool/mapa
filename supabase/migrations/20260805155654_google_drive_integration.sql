create table public.google_drive_oauth_states (
  state_hash text primary key check (char_length(state_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_to text not null default '/?view=roteiros' check (
    redirect_to like '/%'
    and redirect_to not like '//%'
    and char_length(redirect_to) <= 500
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index google_drive_oauth_states_user_expires_idx
  on public.google_drive_oauth_states (user_id, expires_at);

alter table public.google_drive_oauth_states enable row level security;

revoke all on table public.google_drive_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on table public.google_drive_oauth_states to service_role;

create table public.google_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_user_id text not null,
  google_email text not null,
  google_name text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  granted_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  folder_id text,
  folder_name text not null default 'MAPA Conteúdos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_drive_connections enable row level security;

revoke all on table public.google_drive_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.google_drive_connections to service_role;

create or replace function public.set_google_drive_connection_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_google_drive_connection_updated_at() from public, anon, authenticated;
grant execute on function public.set_google_drive_connection_updated_at() to service_role;

create trigger set_google_drive_connection_updated_at
  before update on public.google_drive_connections
  for each row execute function public.set_google_drive_connection_updated_at();

alter table public.content_items
  add column if not exists drive_file_id text,
  add column if not exists drive_file_name text,
  add column if not exists drive_web_view_link text,
  add column if not exists drive_mime_type text,
  add column if not exists drive_file_size bigint,
  add column if not exists drive_uploaded_at timestamptz;
