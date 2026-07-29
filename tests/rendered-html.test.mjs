import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://ping-optimizer.test/", {
      headers: {
        accept: "text/html",
        host: "ping-optimizer.test",
        "x-forwarded-host": "ping-optimizer.test",
        "x-forwarded-proto": "https",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the finished Ping Optimizer launch page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Ping Optimizer — Better routes, proven/i);
  assert.match(html, /One button\./i);
  assert.match(html, /A measurably better route\./i);
  assert.match(html, /Download Windows preview/i);
  assert.match(html, /ping-optimizer-windows-preview\.zip/i);
  assert.match(html, /Technical preview/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});
