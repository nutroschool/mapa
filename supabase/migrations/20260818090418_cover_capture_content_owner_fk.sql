drop index if exists public.capture_items_user_content_created_idx;

create index capture_items_user_content_created_idx
  on public.capture_items (content_item_id, user_id, created_at desc)
  where content_item_id is not null;
