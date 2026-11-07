import { randomUUID } from "node:crypto";
import { GatewayError } from "./errors";
import { OPERATION_ID } from "./calls";
import type { CallInput } from "./executor";

const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export function parseCallBody(body: Record<string, unknown>, options: { operationRequired: boolean }): CallInput {
  const tool = body.tool;
  if (typeof tool !== "string" || !TOOL_NAME.test(tool)) throw new GatewayError("ARGUMENT_INVALID", "tool 必须是工具名（GET /tools 查看）", 400);
  const args = body.arguments ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new GatewayError("ARGUMENT_INVALID", "arguments 必须是 JSON 对象", 400);
  let operationId = body.operationId;
  if (operationId === undefined && !options.operationRequired) operationId = randomUUID();
  if (typeof operationId !== "string" || !OPERATION_ID.test(operationId)) throw new GatewayError("ARGUMENT_INVALID", "operationId 必须是客户端生成的 UUID；同一任务重试时保持不变", 400);
  const request = body.request;
  if (request !== undefined && (typeof request !== "string" || request.length > 4000)) throw new GatewayError("ARGUMENT_INVALID", "request 需为不超过 4000 字的文本", 400);
  return { tool, arguments: args as Record<string, unknown>, operationId: operationId.toLowerCase(), ...(request ? { request } : {}) };
}
