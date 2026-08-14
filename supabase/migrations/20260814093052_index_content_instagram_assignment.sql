create index if not exists content_items_instagram_account_owner_idx
  on public.content_items (instagram_account_id, user_id);
