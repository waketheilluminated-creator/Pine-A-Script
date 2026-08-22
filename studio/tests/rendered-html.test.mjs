import assert from "node:assert/strict";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

test("server-renders the πlab trading workspace", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>πlab — Live crypto charting<\/title>/i);
  assert.match(html, /πlab/);
  assert.match(html, /Derivatives pulse/);
  assert.match(html, /Pine Editor/);
  assert.match(html, /Create alert/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("derivatives API rejects unsupported exchanges", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/derivatives?exchange=unknown"), env, context);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Supported exchanges: bybit, binance, okx" });
});
