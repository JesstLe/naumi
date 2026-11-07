import { gatewayJson } from "@/lib/agent-gateway/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public discovery document for agents; carries no account data.
export function GET() {
  return gatewayJson({
    name: "naumi-agent-gateway",
    version: 1,
    auth: "Authorization: Bearer <个人 API 令牌（账号中心 → Agent 接入 创建）>",
    cli: { download: "/agent/naumi.mjs", requires: "Node.js >= 18", mcp: "node naumi.mjs mcp" },
    endpoints: {
      me: "GET /api/agent-gateway/v1/me",
      tools: "GET /api/agent-gateway/v1/tools",
      quote: "POST /api/agent-gateway/v1/quote {tool, arguments}",
      call: "POST /api/agent-gateway/v1/calls {tool, arguments, operationId, request?} -> application/x-ndjson",
      status: "GET /api/agent-gateway/v1/calls/{operationId}",
      upload: "POST /api/agent-gateway/v1/uploads multipart file",
      media: "GET /api/agent-gateway/v1/media?url=<结果媒体地址>",
    },
    workspace: "企业创作在请求头 x-naumi-workspace 中传企业 ID；缺省为个人空间（企业专属站固定为本企业）",
  });
}
