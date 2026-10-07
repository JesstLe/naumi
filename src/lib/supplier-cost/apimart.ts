import "server-only";
import { apimartTask, apimartUsage, validTaskId } from "./adapters";
import { queryReceipt } from "./io";
const root = (base: string) => base.replace(/\/v1\/?$/, "").replace(/\/$/, "");
export async function getAPIMartTask(input: { baseUrl: string; apiKey: string; taskId: string; fetcher?: typeof fetch }) {
  if (!validTaskId(input.taskId)) throw new Error("invalid APIMart task ID");
  return apimartTask(await queryReceipt(root(input.baseUrl), `/v1/tasks/${encodeURIComponent(input.taskId)}`, input.apiKey, input.fetcher), input.taskId, "poll");
}
export async function queryAPIMartUsage(input: { baseUrl: string; apiKey: string; start: Date; end: Date; timezone: string; fetcher?: typeof fetch }) {
  const difference = input.end.getTime() - input.start.getTime();
  if (!Number.isFinite(difference) || difference <= 0 || difference > 31 * 86400000) throw new Error("APIMart usage window must be within 31 days");
  const params = new URLSearchParams({ start: input.start.toISOString(), end: input.end.toISOString(), group_by: "model,date", scope: "key", tz: input.timezone });
  const raw = await queryReceipt(root(input.baseUrl), `/v1/usage?${params}`, input.apiKey, input.fetcher);
  return { ...apimartUsage(raw, { start: input.start.toISOString(), end: input.end.toISOString(), timezone: input.timezone }), evidence: { endpoint: "GET /v1/usage", scope: "key", groupBy: "model,date", schema: "2026-10-07" } };
}
