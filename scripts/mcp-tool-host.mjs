// ---------------------------------------------------------------------------
// Codex MCP 工具宿主:把 Naumi 业务工具经 MCP(stdio)暴露给 codex exec。
//
// 工作方式:CodexBridge 为每个会话 spawn 本文件作为 MCP server 子进程,
// 工具清单与业务上下文经 NAUMI_TOOLS_SPEC 环境变量(JSON)传入;
// codex 调用工具 → 本进程执行业务 fetch → 结果回给 codex。
//
// 该文件同时可被 node 直接运行:`node mcp-tool-host.mjs`
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const spec = JSON.parse(process.env.NAUMI_TOOLS_SPEC || '{"tools":[]}');

const server = new McpServer(
  { name: "naumi-tools", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

for (const tool of spec.tools || []) {
  // JSON Schema → zod 简易转换(codex/omp 传来的都是扁平 string/number 参数)
  const shape = {};
  for (const [key, def] of Object.entries(tool.parameters?.properties || {})) {
    const t = def.type || "string";
    shape[key] =
      t === "number" ? z.number().describe(def.description || "") :
      t === "boolean" ? z.boolean().describe(def.description || "") :
      z.string().describe(def.description || "");
  }
  server.tool(
    tool.name,
    tool.description || "",
    shape,
    async (args) => {
      try {
        const r = await fetch(`http://127.0.0.1:${spec.callbackPort}/internal/agent-tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tool.name, args }),
        });
        const d = await r.json();
        if (!r.ok || d.error) {
          return { content: [{ type: "text", text: `工具错误: ${d.error || r.status}` }], isError: true };
        }
        return { content: [{ type: "text", text: d.text || "(空结果)" }] };
      } catch (e) {
        return { content: [{ type: "text", text: `工具执行异常: ${e.message}` }], isError: true };
      }
    }
  );
}

await server.connect(new StdioServerTransport());
