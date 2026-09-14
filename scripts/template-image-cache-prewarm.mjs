const base = (process.argv[2] || "http://127.0.0.1:3012").replace(/\/$/, "");
const concurrency = Math.min(
  8,
  Math.max(1, Number(process.env.TEMPLATE_CACHE_CONCURRENCY) || 4)
);

async function loadPage(page) {
  const response = await fetch(
    `${base}/api/templates?page=${page}&pageSize=100`,
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error(`模板列表请求失败：${response.status}`);
  return response.json();
}

async function prewarm(items) {
  const pending = items.filter((item) =>
    String(item.image || "").startsWith("/api/tpl-image?")
  );
  let cursor = 0;
  let cached = 0;
  const failures = [];

  async function worker() {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      try {
        const response = await fetch(new URL(item.image, base));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.arrayBuffer();
        cached++;
      } catch (error) {
        failures.push({
          id: item.id,
          error: error instanceof Error ? error.message : "缓存失败",
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, () => worker())
  );
  return { scanned: pending.length, cached, failures };
}

let page = 1;
let total = 0;
let cached = 0;
const failures = [];

while (true) {
  const data = await loadPage(page);
  total = Number(data.total) || total;
  const result = await prewarm(data.templates || []);
  cached += result.cached;
  failures.push(...result.failures);
  console.log(
    `模板图片预热：${Math.min(page * 100, total)} / ${total}，本次缓存 ${result.cached}，累计失败 ${failures.length}`
  );
  if (page * 100 >= total || (data.templates || []).length === 0) break;
  page++;
}

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      total,
      cached,
      failed: failures.length,
      failures: failures.slice(0, 20),
    },
    null,
    2
  )
);
process.exitCode = failures.length === 0 ? 0 : 2;
