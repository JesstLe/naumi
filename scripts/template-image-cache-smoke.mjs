import crypto from "node:crypto";

const base = (process.env.TEMPLATE_CACHE_BASE_URL || "http://127.0.0.1:3013").replace(
  /\/$/,
  ""
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

const page = await json(`${base}/api/templates?page=1&pageSize=24`);
const template = page.templates.find((item) =>
  String(item.image).startsWith("/api/tpl-image?")
);
assert(template, "没有找到可用于懒缓存验收的远程模板图片");

const proxyUrl = new URL(template.image, base).toString();
const first = await fetch(proxyUrl, { redirect: "manual" });
assert(first.status === 307, `首次缓存应返回 307，实际 ${first.status}`);
const location = first.headers.get("location") || "";
assert(
  /\/media\/templates\/cache\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif)$/i.test(
    new URL(location, base).pathname
  ),
  `缓存地址不是内容哈希路径：${location}`
);

const image = await fetch(new URL(location, base));
assert(image.ok, `缓存图片读取失败：${image.status}`);
assert(
  (image.headers.get("content-type") || "").startsWith("image/"),
  "缓存对象 Content-Type 不是图片"
);
assert((await image.arrayBuffer()).byteLength > 100, "缓存图片内容为空");

const detail = await json(
  `${base}/api/templates?ids=${encodeURIComponent(template.id)}&page=1&pageSize=1`
);
assert(
  String(detail.templates[0]?.image || "").startsWith("/media/templates/cache/"),
  `数据库未回写稳定地址：${detail.templates[0]?.image || ""}`
);

const repeated = await fetch(proxyUrl, { redirect: "manual" });
assert(repeated.status === 307, `旧代理地址重复访问失败：${repeated.status}`);
assert(
  new URL(repeated.headers.get("location") || "", base).pathname ===
    new URL(location, base).pathname,
  "重复访问没有复用同一个缓存对象"
);

const withoutId = await fetch(
  `${base}/api/tpl-image?u=${encodeURIComponent("https://example.com/a.png")}`,
  { redirect: "manual" }
);
assert(withoutId.status === 400, "无模板 ID 的开放代理请求未被拒绝");

const exp = Date.now() + 60_000;
const secret = process.env.TEMPLATE_CACHE_SETTINGS_SECRET || "naumi-insecure-default";
const mac = crypto
  .createHmac("sha256", secret)
  .update(`admin:${exp}`)
  .digest("hex");
const adminHeaders = {
  "Content-Type": "application/json",
  Cookie: `nv_admin=${exp}.${mac}`,
};

const privateSource = await fetch(`${base}/api/admin/templates`, {
  method: "PATCH",
  headers: adminHeaders,
  body: JSON.stringify({ id: template.id, image: "http://127.0.0.1/private.png" }),
});
const privateError = await privateSource.json().catch(() => null);
assert(privateSource.status === 400, "管理员远程图片未拦截私网 URL");
assert(
  String(privateError?.error || "").includes("内网"),
  `私网 URL 错误信息不明确：${JSON.stringify(privateError)}`
);

const batch = await json(`${base}/api/admin/templates/cache`, {
  method: "POST",
  headers: adminHeaders,
  body: JSON.stringify({ limit: 2, retryFailures: true }),
});
assert(batch.scanned > 0, "管理员批量缓存没有扫描到远程模板");
assert(
  batch.batchCached + batch.batchFailed <= batch.scanned,
  "管理员批量缓存统计不一致"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      templateId: template.id,
      cachedUrl: new URL(location, base).pathname,
      totalTemplates: page.total,
      adminBatch: {
        scanned: batch.scanned,
        cached: batch.batchCached,
        failed: batch.batchFailed,
        remaining: batch.remaining,
      },
    },
    null,
    2
  )
);
