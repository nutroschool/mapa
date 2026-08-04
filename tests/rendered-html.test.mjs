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

test("renders a clean MAPA workspace without seeded user data", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MAPA — Conteúdo em movimento<\/title>/i);
  assert.match(html, /Seu MAPA começa aqui/);
  assert.match(html, /O espaço está zerado/);
  assert.match(html, /Novo conteúdo/);
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
