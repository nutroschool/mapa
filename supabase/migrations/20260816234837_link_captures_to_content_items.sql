alter table public.capture_items
  add column if not exists content_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_items_id_user_unique'
      and conrelid = 'public.content_items'::regclass
  ) then
    alter table public.content_items
      add constraint content_items_id_user_unique unique (id, user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'capture_items_content_owner_fkey'
      and conrelid = 'public.capture_items'::regclass
  ) then
    alter table public.capture_items
      add constraint capture_items_content_owner_fkey
      foreign key (content_item_id, user_id)
      references public.content_items (id, user_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists capture_items_user_content_created_idx
  on public.capture_items (user_id, content_item_id, created_at desc)
  where content_item_id is not null;
