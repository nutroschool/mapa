-- Faz uma cópia privada e restaurável dos registros antes de converter os
-- documentos JSON legados de dez blocos em um único roteiro de texto.
--
-- Restauração, se necessária:
-- update public.content_items as content
-- set script = backup.script,
--     hook = backup.hook,
--     cta = backup.cta,
--     notes = backup.notes
-- from private.content_items_script_backup_20260815 as backup
-- where content.id = backup.content_id;

create schema if not exists private;

create table if not exists private.content_items_script_backup_20260815 (
  content_id uuid primary key,
  user_id uuid not null,
  title text not null,
  format text not null,
  pillar text not null,
  status text not null,
  scheduled_date date not null,
  duration text not null,
  hook text not null,
  script text not null,
  cta text not null,
  notes text not null,
  instagram_account_id text,
  drive_file_id text,
  drive_file_name text,
  drive_web_view_link text,
  drive_mime_type text,
  drive_file_size bigint,
  drive_uploaded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  source_script_md5 text not null,
  source_script_characters integer not null,
  backed_up_at timestamptz not null default now()
);

revoke all on table private.content_items_script_backup_20260815
  from public, anon, authenticated;

insert into private.content_items_script_backup_20260815 (
  content_id,
  user_id,
  title,
  format,
  pillar,
  status,
  scheduled_date,
  duration,
  hook,
  script,
  cta,
  notes,
  instagram_account_id,
  drive_file_id,
  drive_file_name,
  drive_web_view_link,
  drive_mime_type,
  drive_file_size,
  drive_uploaded_at,
  created_at,
  updated_at,
  source_script_md5,
  source_script_characters
)
select
  id,
  user_id,
  title,
  format,
  pillar,
  status,
  scheduled_date,
  duration,
  hook,
  script,
  cta,
  notes,
  instagram_account_id,
  drive_file_id,
  drive_file_name,
  drive_web_view_link,
  drive_mime_type,
  drive_file_size,
  drive_uploaded_at,
  created_at,
  updated_at,
  md5(script),
  char_length(script)
from public.content_items
on conflict (content_id) do nothing;

-- A conversão abaixo preserva a ordem original. Notas específicas dos blocos
-- são transferidas para o campo geral de notas para que nenhum conteúdo se perca.
with legacy_source as materialized (
  select
    id,
    notes,
    case
      when script ~ '^\s*\{\s*"version"\s*:\s*[12]\s*,\s*"blocks"\s*:'
        then script::jsonb
      else null
    end as document
  from public.content_items
),
legacy_documents as (
  select id, notes, document
  from legacy_source
  where jsonb_typeof(document -> 'blocks') = 'object'
),
block_definitions(position, block_id, label) as (
  values
    (1, 'headline', 'BLOCO 01 · HEADLINE'),
    (2, 'mystery', 'BLOCO 02 · INTENSIFICADOR DE MISTÉRIO'),
    (3, 'saveCta', 'BLOCO 03 · CTA DE SALVAMENTO'),
    (4, 'notableOne', 'BLOCO 04 · CONTEÚDO NOTÁVEL 1'),
    (5, 'notableTwo', 'BLOCO 05 · CONTEÚDO NOTÁVEL 2'),
    (6, 'shareCta', 'BLOCO 06 · CTA DE COMPARTILHAMENTO'),
    (7, 'notableThree', 'BLOCO 07 · CONTEÚDO NOTÁVEL 3'),
    (8, 'belief', 'BLOCO 08 · CRENÇA'),
    (9, 'presentation', 'BLOCO 09 · APRESENTAÇÃO E CTAs FINAIS'),
    (10, 'caption', 'BLOCO 10 · CAPTION PRONTA · LEGENDA')
),
raw_blocks as (
  select
    legacy.id,
    legacy.notes,
    definition.position,
    definition.label,
    case
      when nullif(legacy.document -> 'blocks' -> definition.block_id ->> 'html', '') is not null
        then legacy.document -> 'blocks' -> definition.block_id ->> 'html'
      else coalesce(legacy.document -> 'blocks' -> definition.block_id ->> 'text', '')
    end as block_text,
    coalesce(legacy.document -> 'blocks' -> definition.block_id ->> 'note', '') as block_note
  from legacy_documents as legacy
  cross join block_definitions as definition
),
html_stripped as (
  select
    id,
    notes,
    position,
    label,
    regexp_replace(
      regexp_replace(
        regexp_replace(block_text, '<br[[:space:]]*/?>', E'\n', 'gi'),
        '</(div|p)>', E'\n', 'gi'
      ),
      '<[^>]+>', '', 'g'
    ) as block_text,
    block_note
  from raw_blocks
),
html_entities_decoded as (
  select
    id,
    notes,
    position,
    label,
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(block_text, '&nbsp;', ' '),
                '&amp;', '&'
              ),
              '&lt;', '<'
            ),
            '&gt;', '>'
          ),
          '&quot;', '"'
        ),
        '&#39;', chr(39)
      ),
      '&#x27;', chr(39)
    ) as block_text,
    block_note
  from html_stripped
),
clean_blocks as (
  select
    id,
    notes,
    position,
    label,
    btrim(
      regexp_replace(
        regexp_replace(block_text, '[[:blank:]]+\n', E'\n', 'g'),
        E'\n{3,}', E'\n\n', 'g'
      ),
      E' \t\n\r'
    ) as block_text,
    btrim(replace(replace(block_note, E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n\r') as block_note
  from html_entities_decoded
),
merged as (
  select
    id,
    coalesce(string_agg(block_text, E'\n\n' order by position) filter (where block_text <> ''), '') as unified_script,
    coalesce(string_agg(label || E'\n' || block_note, E'\n\n' order by position) filter (where block_note <> ''), '') as imported_notes
  from clean_blocks
  group by id
)
update public.content_items as content
set
  script = merged.unified_script,
  notes = case
    when merged.imported_notes = ''
      or position('NOTAS IMPORTADAS DOS BLOCOS ANTERIORES' in content.notes) > 0
      then content.notes
    when btrim(content.notes, E' \t\n\r') = ''
      then 'NOTAS IMPORTADAS DOS BLOCOS ANTERIORES' || E'\n\n' || merged.imported_notes
    else rtrim(content.notes, E' \t\n\r') || E'\n\nNOTAS IMPORTADAS DOS BLOCOS ANTERIORES\n\n' || merged.imported_notes
  end
from merged
where content.id = merged.id;
