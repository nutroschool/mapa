create policy "Service role manages Instagram OAuth states"
  on public.instagram_oauth_states
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manages Instagram connections"
  on public.instagram_connections
  for all
  to service_role
  using (true)
  with check (true);
