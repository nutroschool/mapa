create table public.instagram_data_deletion_requests (
  confirmation_code text primary key check (
    confirmation_code ~ '^[a-f0-9]{32}$'
  ),
  instagram_user_id_hash text not null check (
    instagram_user_id_hash ~ '^[a-f0-9]{64}$'
  ),
  status text not null default 'completed' check (
    status in ('completed')
  ),
  requested_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

alter table public.instagram_data_deletion_requests enable row level security;

revoke all on table public.instagram_data_deletion_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.instagram_data_deletion_requests to service_role;

create policy "service_role manages instagram deletion requests"
  on public.instagram_data_deletion_requests
  for all
  to service_role
  using (true)
  with check (true);

create index instagram_data_deletion_requests_requested_at_idx
  on public.instagram_data_deletion_requests (requested_at);
