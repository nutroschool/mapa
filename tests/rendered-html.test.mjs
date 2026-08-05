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
  const [page, instagramClient, edgeFunction, migration, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/instagram.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/instagram-integration/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260805013532_instagram_integration.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(page, /connectInstagram/);
  assert.match(page, /Entrar com Instagram/);
  assert.match(instagramClient, /functions\.invoke\("instagram-integration"/);
  assert.match(edgeFunction, /instagram_business_basic/);
  assert.match(edgeFunction, /instagram_business_manage_insights/);
  assert.match(edgeFunction, /www\.instagram\.com\/oauth\/authorize/);
  assert.match(edgeFunction, /api\.instagram\.com\/oauth\/access_token/);
  assert.match(edgeFunction, /auth\.getUser\(accessToken\)/);
  assert.match(edgeFunction, /AES-GCM/);
  assert.match(edgeFunction, /stateHash = await sha256Hex/);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all.+anon, authenticated/is);
  assert.match(migration, /grant select, insert, update, delete.+service_role/is);
  assert.doesNotMatch(page + instagramClient, /META_INSTAGRAM_APP_SECRET|INSTAGRAM_TOKEN_ENCRYPTION_KEY/);
  assert.doesNotMatch(envExample, /META_INSTAGRAM_APP_SECRET=\S{20,}/);
});
