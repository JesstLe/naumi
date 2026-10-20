/** Local-only original UI + native bridge fixture. No DB/production/supplier access. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { renderWorkbench } from "../src/lib/reference-workbench/ui";

async function main(){
const port = Number(process.env.WB_FIXTURE_PORT || 14855);
let scenario = "quote400", calls: { path: string; body: any }[] = [];
const traceId = "wb-1234567890abcdef", id = "12345678-1234-4234-a234-123456789abc";
const picture = await sharp({ create: { width: 120, height: 90, channels: 3, background: "#cee1fa" } }).png().toBuffer();
const settings = { quality: "high", resolution: "1k", mode: "all", models: [{ id: "image-a", label: "测试模型" }] };
const item = { ref_path: "asset-fixture-ref", ref_name: "参考图", ref_url: "/api/reference-workbench/image?path=asset-fixture-ref", product: "隔离测试项目", product_images: ["产品图"], product_urls: ["/api/reference-workbench/image?path=asset-fixture-product"], product_url: "/api/reference-workbench/image?path=asset-fixture-product", product_image: "产品图", task_label: "主图", kind: "main", size: "1200×900", dimensions: { width: 1200, height: 900 }, status: "idle", error: "", prompt: "隔离测试提示词", versions: [], infer: { status: "idle", prompt: "", error: "" } };
const receipt = (path: string) => path.startsWith("single/") ? { ok: true, task_id: id, status: "running", results: [] }
  : path.startsWith("chat-image/") ? { ok: true, session_id: "fixture-chat", sessions: [], messages: [], running: false }
  : { ok: true, id, accepted: 1 };
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://127.0.0.1:${port}`), chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  let body: any = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { }
  const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data)); };
  try {
    if (url.pathname === "/__fixture/scenario") { scenario = body.scenario || "quote400"; calls = []; return json({ ok: true }); }
    if (url.pathname === "/__fixture/stats") return json({ scenario, calls });
    if (url.pathname.startsWith("/reference-workbench/")) {
      const name = url.pathname.split("/").at(-1)!;
      if (!["native-bridge.js", "workbench-history.js", "workbench-zip.js"].includes(name)) return json({}, 404);
      res.writeHead(200, { "content-type": "text/javascript" }); res.end(await readFile(join(process.cwd(), "public/reference-workbench", name))); return;
    }
    const match = url.pathname.match(/^(?:\/desktop)?\/api\/reference-workbench\/(.*)$/);
    if (match) {
      const path = match[1]; calls.push({ path, body });
      if (path === "auth/status" || path === "heartbeat") return json({ ok: true, id: "fixture-account", username: "隔离测试" });
      if (path === "settings") return json(settings);
      if (path === "workbench/items") return json({ items: [item], products: [] });
      if (path === "status") return json({ running: false, progress: {}, queue: {} });
      if (path === "image") { res.writeHead(200, { "content-type": "image/png" }); return res.end(picture); }
      if (path === "single/tasks") return json({ ok: true, tasks: [] });
      if (path === "chat-image/state") return json(receipt("chat-image/send"));
      if (path === "quote") {
        if (scenario === "quote400") return json({ error: "当前图片模型尚未配置该精确比例，请选择支持的比例", code: "IMAGE_SIZE_UNSUPPORTED", stage: "quote", traceId }, 400);
        if (scenario === "quote500") return json({ error: "报价暂时失败，本次未发起新的生成提交。请稍后重新报价", code: "WORKBENCH_INTERNAL", stage: "quote", traceId }, 500);
        if (scenario === "quoteHTML") { res.writeHead(502, { "content-type": "text/html" }); return res.end("<html>private gateway detail</html>"); }
        if (scenario === "quoteBadJSON") { res.writeHead(200, { "content-type": "application/json" }); return res.end("{bad"); }
        if (scenario === "quoteNetwork") return req.socket.destroy();
        return json({ ok: true, state: "preview", id, totalCredits: 1, availableCredits: 100, items: [{ credits: 1, ratio: "4:3" }], warnings: [] });
      }
      if (path === "receipt") {
        if (scenario === "unknown") return json({ error: "暂不可查" }, 500);
        if (scenario === "rejected") return json({ error: "尚未查到受理回执", state: "preview" }, 409);
        const submission = calls.find(c => ["workbench/start", "workbench/infer-prompts", "workbench/edit", "single/start", "chat-image/send", "chat-image/confirm"].includes(c.path));
        return json(receipt(submission?.path || "workbench/start"));
      }
      if (["workbench/start", "workbench/infer-prompts", "workbench/edit", "single/start", "chat-image/send", "chat-image/confirm"].includes(path)) {
        if (scenario === "submitLost") return req.socket.destroy();
        if (scenario === "submitHTML") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html>no receipt</html>"); }
        if (["submit500", "unknown", "rejected"].includes(scenario)) return json({ error: "提交结果待核查", stage: "submit" }, 500);
        return json(receipt(path));
      }
      return json({ ok: true });
    }
    const view = url.pathname.split("/").at(-1)!, desktop = url.pathname.startsWith("/desktop/");
    let html = await renderWorkbench(view, desktop);
    if (!html) return json({}, 404);
    html = html.replace("window.__NAUMI_WORKBENCH__=", `localStorage.setItem('naumi-reference:fixture-account:gpt-image-pil-workbench-root','fixture-project');localStorage.setItem('naumi-reference:fixture-account:gpt-image-pil-workbench-settings',JSON.stringify({quality:'high',resolution:'1k',mode:'all'}));window.__NAUMI_WORKBENCH__=`);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
  } catch { json({ error: "fixture error" }, 500); }
});
server.listen(port, "127.0.0.1", () => console.log(`FIXTURE_READY http://127.0.0.1:${port}/batchshot/native/workbench`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));

}
main().catch(e=>{console.error(e);process.exitCode=1;});
