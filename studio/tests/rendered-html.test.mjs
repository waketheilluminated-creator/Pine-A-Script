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
  assert.match(html, /Open Pine editor in new tab/);
  assert.match(html, /Collapse bottom panel/);
  assert.match(html, /Remove EMA 9 indicator/);
  assert.match(html, /Remove EMA 21 indicator/);
  assert.match(html, /Add to chart/);
  assert.match(html, /Create alert \(Alt\+A\)/);
  assert.match(html, /Resize Pine editor panel/);
  assert.match(html, /Resize compiler console/);
  assert.match(html, /Create alert/);
  assert.match(html, /AI Analyst/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("server-renders the synchronized Pine editor tab", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/pine-editor", { headers: { accept: "text/html" } }), env, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Pine Editor — πlab<\/title>/i);
  assert.match(html, /Changes sync automatically/);
  assert.match(html, /Return to chart/);
});

test("AI route validates model connection details before forwarding data", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: "http://localhost:11434/v1/chat/completions", model: "test", question: "Analyze" }),
  }), env, context);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Only public HTTPS model endpoints are allowed" });
});

test("derivatives API rejects unsupported exchanges", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/derivatives?exchange=unknown"), env, context);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Supported exchanges: bybit, binance, okx" });
});
