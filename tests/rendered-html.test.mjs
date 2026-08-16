import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds an independent MAPA with Supabase login and no ChatGPT gate", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    access(new URL("../.next/BUILD_ID", import.meta.url)),
  ]);

  assert.match(layout, /MAPA — Conteúdo em movimento/i);
  assert.match(page, /Preparando seu espaço de criação/);
  assert.match(page, /auth-shell auth-loading/);
  assert.match(page, /Entrar no MAPA/);
  assert.doesNotMatch(page + layout, /ChatGPT|signin-with-chatgpt|oai-authenticated/i);
});

test("keeps local storage versioned and every visible button wired", async () => {
  const [page, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const initialContents: ContentItem\[\] = \[\];/);
  assert.match(page, /mapa-content-items-v2/);
  assert.match(page, /mapa-instagram-demo-v2/);
  assert.doesNotMatch(page, /mapa-content-items-v1/);
  assert.match(page, /onClick=\{\(\) => changeMonth\(-1\)\}/);
  assert.match(page, /onClick=\{\(\) => setLibraryFilter\(filter\)\}/);
  assert.match(page, /const libraryFilters: readonly LibraryFilter\[\] = \["Todos", "Em roteiro", "Em edição", "Agendados", "Prontos"\]/);
  assert.match(page, /"Em edição": \["Edição"\]/);
  assert.match(page, /Agendados: \["Agendado"\]/);
  assert.match(page, /matchesLibraryFilter\(item, filter\)\)\.length/);
  assert.match(page, /onCreateFromPost=\{onCreateFromPost\}/);
  assert.match(page, /aria-label="Roteiro completo"/);
  assert.match(page, /Seu roteiro em um só lugar/);
  assert.match(page, /Cada linha em branco vira um novo bloco no teleprompter/);
  assert.match(page, /onUpdate\("script", event\.target\.value\)/);
  assert.match(page, /legacyScriptBlockIds/);
  assert.match(page, /normalizeLegacyScriptItem/);
  assert.match(page, /NOTAS IMPORTADAS DOS BLOCOS ANTERIORES/);
  assert.match(page, /sidebar-is-collapsed/);
  assert.match(page, /library-is-collapsed/);
  assert.doesNotMatch(page, /contentEditable/);
  assert.doesNotMatch(page, /script-block-card/);
  assert.match(page, /Etapa de funil/);
  assert.match(page, /Topo de funil/);
  assert.match(page, /Meio de funil/);
  assert.match(page, /Fundo de funil/);
  assert.match(page, /draggable/);
  assert.match(page, /onDrop=/);
  assert.match(page, /scheduled_date: date/);
  assert.match(page, /FASE DO CONTEÚDO/);
  assert.match(page, /Transformar em conteúdo/);
  assert.match(page, /Avançar para \{nextStatus\}/);
  assert.match(page, /aria-label="Fase atual da criação do conteúdo"/);
  assert.match(page, /onStatusChange\(selected\.id, status\)/);
  assert.match(page, /Fase: \{item\.status\}/);
  assert.match(page, /voltou à fase anterior/);
  assert.match(page, /calendar-progress/);
  assert.match(page, /calendar-surface-switcher/);
  assert.match(page, />FEED</);
  assert.match(page, />STORY</);
  assert.match(page, /item\.format !== "Stories"/);
  assert.match(page, /item\.format === "Stories"/);
  assert.match(page, /onAdd\(undefined, addFormat\)/);
  assert.match(page, /roteiros em/);
  assert.match(page, /publicados em/);
  assert.match(page, /statusFilter/);
  assert.match(page, /calendar-item status-\$\{item\.status/);
  assert.match(page, /As cores mostram a fase/);
  assert.match(page, /deleteContent/);
  assert.match(page, /Esta ação não pode ser desfeita/);
  assert.match(page, /\.delete\(\)[\s\S]*?\.eq\("user_id", user\.id\)/);
  assert.match(page, /> Excluir</);

  const buttonTags = page.match(/<button\b[\s\S]*?>/g) ?? [];
  assert.ok(buttonTags.length > 20);
  for (const tag of buttonTags) {
    assert.match(tag, /onClick=|type="submit"/, `Unwired button: ${tag}`);
  }

  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("uses Supabase Auth and protects cloud content by user", async () => {
  const [page, client, migration, vercel, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608040001_create_content_items.sql", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(page, /signInWithPassword/);
  assert.match(page, /auth\.signUp/);
  assert.match(page, /resetPasswordForEmail/);
  assert.match(page, /PASSWORD_RECOVERY/);
  assert.match(page, /updateUser\(\{ password \}\)/);
  assert.match(page, /Esqueci minha senha/);
  assert.match(page, /from\("content_items"\)/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(client + envExample, /service_role|sb_secret_/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\).*user_id/is);
  assert.match(migration, /for (select|insert|update|delete)/i);
  assert.equal(JSON.parse(vercel).framework, "nextjs");
});

test("implements real Instagram OAuth and keeps Meta tokens server-side", async () => {
  const [page, instagramClient, edgeFunction, migration, deletionMigration, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/instagram.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/instagram-integration/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260805013532_instagram_integration.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260805024500_instagram_data_deletion_requests.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(page, /connectInstagram/);
  assert.match(page, /Entrar com Instagram/);
  assert.match(instagramClient, /functions\.invoke\("instagram-integration"/);
  assert.match(edgeFunction, /instagram_business_basic/);
  assert.match(edgeFunction, /instagram_business_manage_insights/);
  assert.match(edgeFunction, /www\.instagram\.com\/oauth\/authorize/);
  assert.match(edgeFunction, /force_reauth/);
  assert.match(edgeFunction, /enable_fb_login/);
  assert.match(edgeFunction, /api\.instagram\.com\/oauth\/access_token/);
  assert.match(edgeFunction, /auth\.getUser\(accessToken\)/);
  assert.match(edgeFunction, /AES-GCM/);
  assert.match(edgeFunction, /stateHash = await sha256Hex/);
  assert.match(edgeFunction, /readMetaSignedRequest/);
  assert.match(edgeFunction, /route === "deauthorize"/);
  assert.match(edgeFunction, /route === "data-deletion"/);
  assert.match(edgeFunction, /handlePrivacyPage/);
  assert.match(edgeFunction, /token_exchange/);
  assert.match(edgeFunction, /profile_fetch/);
  assert.match(edgeFunction, /firstDataRecord/);
  assert.match(edgeFunction, /\$\{graphVersion\}\/me/);
  assert.match(edgeFunction, /safeDiagnostic/);
  assert.match(edgeFunction, /callbackReason/);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all.+anon, authenticated/is);
  assert.match(migration, /grant select, insert, update, delete.+service_role/is);
  assert.match(deletionMigration, /enable row level security/i);
  assert.match(deletionMigration, /instagram_user_id_hash/i);
  assert.match(deletionMigration, /to service_role/i);
  assert.doesNotMatch(page + instagramClient, /META_INSTAGRAM_APP_SECRET|INSTAGRAM_TOKEN_ENCRYPTION_KEY/);
  assert.doesNotMatch(envExample, /META_INSTAGRAM_APP_SECRET=\S{20,}/);
});

test("connects each user to Google Drive and uploads editing videos securely", async () => {
  const [page, styles, driveClient, edgeFunction, callbackRoute, migration, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-drive.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/google-drive-integration/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google-drive/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260805155654_google_drive_integration.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(page, /selected\.status === "Edição"/);
  assert.match(page, /Subir vídeo/);
  assert.match(page, /Conectar meu Google Drive/);
  assert.match(page, /accept="video\/\*"/);
  assert.match(page, /driveUploadProgress/);
  assert.match(page, /Cada pessoa escolhe e autoriza o próprio Google Drive/);
  assert.match(driveClient, /functions\.invoke\("google-drive-integration"/);
  assert.match(driveClient, /XMLHttpRequest/);
  assert.match(driveClient, /create-upload-session/);
  assert.match(edgeFunction, /auth\.getUser\(accessToken\)/);
  assert.match(edgeFunction, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(edgeFunction, /scope_validation:missing_drive_file/);
  assert.match(edgeFunction, /GOOGLE_DRIVE_OAUTH_REDIRECT_URI/);
  assert.match(edgeFunction, /uploadType", "resumable"/);
  assert.match(edgeFunction, /AES-GCM/);
  assert.match(edgeFunction, /\.eq\("user_id", user\.id\)/);
  assert.match(migration, /google_drive_connections/);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all.+anon, authenticated/is);
  assert.match(migration, /drive_file_id/);
  assert.match(callbackRoute, /mapa\.nutroschool\.com\.br/);
  assert.match(callbackRoute, /google-drive-integration\/callback/);
  assert.match(callbackRoute, /redirect:\s*"manual"/);
  assert.match(styles, /\.drive-modal, \.drive-upload-form \{ min-width: 0; max-width: 100%; \}/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.doesNotMatch(page + driveClient, /GOOGLE_DRIVE_CLIENT_SECRET|GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY/);
  assert.doesNotMatch(envExample, /GOOGLE_DRIVE_CLIENT_SECRET=\S{20,}/);
});

test("uses the current Sao Paulo date instead of a fixed day", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /America\/Sao_Paulo/);
  assert.match(page, /dateIsoInTimeZone/);
  assert.match(page, /formatTodayHeading\(todayIso\)/);
  assert.doesNotMatch(page, /2026-08-04/);
  assert.doesNotMatch(page, /TERÇA-FEIRA, 4 DE AGOSTO/);
});

test("opens a complete teleprompter from the recording phase", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /selected\.status === "Gravação"/);
  assert.match(page, /Abrir teleprompter/);
  assert.match(page, /splitScriptIntoTeleprompterBlocks\(scriptText\)/);
  assert.match(page, /script-block-\$\{index \+ 1\}/);
  assert.match(page, /requestAnimationFrame\(tick\)/);
  assert.match(page, /Velocidade/);
  assert.match(page, /Espelhar/);
  assert.match(page, /Tela cheia/);
  assert.match(page, /event\.code === "Space"/);
  assert.match(page, /scrollRemainderRef\.current \+= speed \* elapsed/);
  assert.match(page, /Math\.floor\(scrollRemainderRef\.current\)/);
  assert.match(page, /reader\.scrollTop = Math\.min\(maximum, reader\.scrollTop \+ wholePixels\)/);
  assert.match(styles, /\.teleprompter-layer/);
  assert.match(styles, /\.teleprompter-reader\.mirrored/);
  assert.match(styles, /\.teleprompter-focus-line/);
  assert.match(styles, /\.teleprompter-copy p \{[^}]*margin: 0 0 1\.55em;[^}]*white-space: pre-wrap;/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.teleprompter-controls/);
});

test("prepares a safe one-time conversion from ten legacy blocks to one script", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260815175447_unify_legacy_script_blocks.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /create schema if not exists private/i);
  assert.match(migration, /create table if not exists private\.content_items_script_backup_20260815/i);
  assert.match(migration, /source_script_md5 text not null/i);
  assert.match(migration, /revoke all on table private\.content_items_script_backup_20260815\s+from public, anon, authenticated/is);
  assert.match(migration, /insert into private\.content_items_script_backup_20260815[\s\S]+?from public\.content_items[\s\S]+?on conflict \(content_id\) do nothing/i);
  assert.ok(
    migration.indexOf("insert into private.content_items_script_backup_20260815") <
      migration.lastIndexOf("update public.content_items"),
    "the private backup must be written before any script is converted",
  );
  assert.match(migration, /legacy_source as materialized/i);
  assert.match(migration, /jsonb_typeof\(document -> 'blocks'\) = 'object'/i);
  assert.match(migration, /string_agg\(block_text, E'\\n\\n' order by position\)/i);
  assert.match(migration, /NOTAS IMPORTADAS DOS BLOCOS ANTERIORES/);
  assert.match(migration, /position\('NOTAS IMPORTADAS DOS BLOCOS ANTERIORES' in content\.notes\)/);
  assert.match(migration, /where content\.id = merged\.id/);
});

test("separates content by Instagram account and synchronizes assignments with RLS", async () => {
  const [page, styles, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260814092121_add_capture_inbox_and_instagram_accounts.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type WorkspaceInstagramAccount/);
  assert.match(page, /instagramAccountId: string \| null/);
  assert.match(page, /mapa-instagram-workspace-accounts-v1/);
  assert.match(page, /mapa-content-instagram-assignments-v1/);
  assert.match(page, /Conta do Instagram deste roteiro/);
  assert.match(page, /Gerenciar contas/);
  assert.match(page, /Organizar contas do Instagram/);
  assert.match(page, /Conta principal/);
  assert.match(page, /Segunda conta/);
  assert.match(page, /performanceAccountId/);
  assert.match(page, /workspace_instagram_accounts/);
  assert.match(page, /instagram_account_id/);
  assert.match(styles, /\.script-account-select/);
  assert.match(styles, /\.performance-account-switcher/);
  assert.match(migration, /workspace_instagram_accounts/);
  assert.match(migration, /content_items_instagram_account_owner_fkey/);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /auth\.uid\(\).*user_id/is);
});

test("implements a synchronized multimedia quick-capture inbox inside the script editor", async () => {
  const [page, component, panel, storage, styles, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/CaptureInbox.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ScriptInspirationPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/capture-inbox.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260814092121_add_capture_inbox_and_instagram_accounts.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Inbox de inspirações/);
  assert.match(page, /createFromCapture/);
  assert.match(page, /Transformada em pauta|transformada em pauta/i);
  assert.match(component, /Grave até 2 min/);
  assert.match(component, /Colar print/);
  assert.match(component, /application\/pdf/);
  assert.match(component, /MediaRecorder/);
  assert.match(component, /navigator\.clipboard\.read/);
  assert.match(component, /Transformar em pauta/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /createObjectStore/);
  assert.match(storage, /workspaceId/);
  assert.match(storage, /from\("capture_items"\)/);
  assert.match(storage, /capture-inbox/);
  assert.match(storage, /\.upload\(storagePath/);
  assert.match(storage, /\.download\(capture\.storagePath\)/);
  assert.match(storage, /listLocalCaptures/);
  assert.match(storage, /saveCloudCapture\(localCapture, true\)/);
  assert.match(storage, /cloudIds\.has\(localCapture\.id\)/);
  assert.match(panel, /Inspirações/);
  assert.match(panel, /Inserir no roteiro/);
  assert.match(panel, /loadCaptureBlob/);
  assert.match(page, /script-inspiration-toggle/);
  assert.match(page, /useCaptureInScript/);
  assert.match(page, /selectionStart/);
  assert.match(page, /setSelectionRange/);
  assert.match(page, /Inspiração inserida no roteiro na posição do cursor/);
  assert.match(styles, /\.capture-shortcuts/);
  assert.match(styles, /\.capture-grid/);
  assert.match(styles, /\.script-inspiration-panel/);
  assert.match(migration, /create table if not exists public\.capture_items/);
  assert.match(migration, /insert into storage\.buckets/);
  assert.match(migration, /bucket_id = 'capture-inbox'/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(migration, /enable row level security/gi);
});

test("lets the authenticated user change the password from settings", async () => {
  const [page, settings, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PasswordSettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /setUtilityModal\("settings"\)/);
  assert.match(page, /<PasswordSettings/);
  assert.match(settings, /current_password: currentPassword/);
  assert.match(settings, /newPassword\.length < 8/);
  assert.match(settings, /newPassword !== confirmation/);
  assert.match(settings, /autoComplete="current-password"/);
  assert.match(settings, /autoComplete="new-password"/);
  assert.match(styles, /\.password-settings-fields/);
  assert.match(styles, /\.password-security-note/);
});

test("diagnoses each Instagram post against account benchmarks", async () => {
  const [component, page, styles] = await Promise.all([
    readFile(new URL("../components/InstagramPerformance.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /function buildBenchmarks/);
  assert.match(component, /function analyzePost/);
  assert.match(component, /median\(media\.map/);
  assert.match(component, /O que foi bom/);
  assert.match(component, /O que segurou o post/);
  assert.match(component, /Próximo teste/);
  assert.match(component, /não prova que gancho, tema ou formato causaram/i);
  assert.match(component, /Taxa de salvamento/);
  assert.match(component, /onCreateFromPost\(selectedMedia\)/);
  assert.match(page, /buildDemoInstagramMetrics/);
  assert.match(page, /createFromPerformancePost/);
  assert.match(styles, /\.post-analysis-panel/);
  assert.match(styles, /\.performance-diagnosis-grid/);
});
