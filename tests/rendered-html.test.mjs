import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders a secure MAPA bootstrap without seeded user data", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MAPA — Conteúdo em movimento<\/title>/i);
  assert.match(html, /Preparando seu espaço de criação/);
  assert.match(html, /auth-shell auth-loading/);
  assert.doesNotMatch(html, /Creatina faz mal para os rins/);
  assert.doesNotMatch(html, /Proteína depois dos 60/);
  assert.doesNotMatch(html, /128,4 mil/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
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
  assert.match(page, /onClick=\{onCreateFromInsight\}/);
  assert.match(page, /onAction=\{exportReport\}/);
  assert.match(page, /INTENSIFICADOR DE MISTÉRIO/);
  assert.match(page, /APRESENTAÇÃO E CTAs FINAIS/);
  assert.match(page, /CAPTION PRONTA · LEGENDA/);
  assert.equal((page.match(/number: "(?:0[1-9]|10)"/g) ?? []).length, 10);
  assert.match(page, /JSON\.stringify\(nextDocument\)/);
  assert.match(page, /sidebar-is-collapsed/);
  assert.match(page, /library-is-collapsed/);
  assert.match(page, /contentEditable/);
  assert.match(page, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(page, /Aplicar ou remover negrito na seleção/);
  assert.match(page, /sanitizeRichTextHtml/);
  assert.match(page, /Escolher outra cor da fonte/);
  assert.match(page, /Adicionar nota ao bloco/);
  assert.match(page, /Etapa de funil/);
  assert.match(page, /Topo de funil/);
  assert.match(page, /Meio de funil/);
  assert.match(page, /Fundo de funil/);
  assert.match(page, /draggable/);
  assert.match(page, /onDrop=/);
  assert.match(page, /scheduled_date: date/);
  assert.match(page, /FASE DO CONTEÚDO/);
  assert.match(page, /Avançar para \{nextStatus\}/);
  assert.match(page, /aria-label="Fase atual da criação do conteúdo"/);
  assert.match(page, /onStatusChange\(selected\.id, status\)/);
  assert.match(page, /Fase: \{item\.status\}/);
  assert.match(page, /voltou à fase anterior/);
  assert.match(page, /calendar-progress/);
  assert.match(page, /roteiros no mês/);
  assert.match(page, /vídeos publicados/);
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
  assert.deepEqual(await readdir(new URL("../app/_sites-preview", import.meta.url)), []);
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
  assert.doesNotMatch(edgeFunction, /enable_fb_login|force_authentication/);
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
  assert.match(edgeFunction, /safeDiagnostic/);
  assert.match(edgeFunction, /instagram=error&reason=callback_failed/);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all.+anon, authenticated/is);
  assert.match(migration, /grant select, insert, update, delete.+service_role/is);
  assert.match(deletionMigration, /enable row level security/i);
  assert.match(deletionMigration, /instagram_user_id_hash/i);
  assert.match(deletionMigration, /to service_role/i);
  assert.doesNotMatch(page + instagramClient, /META_INSTAGRAM_APP_SECRET|INSTAGRAM_TOKEN_ENCRYPTION_KEY/);
  assert.doesNotMatch(envExample, /META_INSTAGRAM_APP_SECRET=\S{20,}/);
});
