create table public.instagram_oauth_states (
  state_hash text primary key check (char_length(state_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_to text not null default '/' check (
    redirect_to like '/%'
    and redirect_to not like '//%'
    and char_length(redirect_to) <= 500
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index instagram_oauth_states_user_expires_idx
  on public.instagram_oauth_states (user_id, expires_at);

alter table public.instagram_oauth_states enable row level security;

revoke all on table public.instagram_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on table public.instagram_oauth_states to service_role;

create table public.instagram_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  account_type text,
  profile_picture_url text,
  access_token_ciphertext text not null,
  granted_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_connections enable row level security;

revoke all on table public.instagram_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.instagram_connections to service_role;

create or replace function public.set_instagram_connection_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_instagram_connection_updated_at() from public, anon, authenticated;
grant execute on function public.set_instagram_connection_updated_at() to service_role;

create trigger set_instagram_connection_updated_at
  before update on public.instagram_connections
  for each row execute function public.set_instagram_connection_updated_at();
