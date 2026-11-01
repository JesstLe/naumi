"use client";
import {authHeader} from "@/lib/supabase";
import {endpoint} from "./contracts";
import type {ManagementRequest} from "@/lib/model-config/management-session-contract";

export async function api(body?: unknown, request?: ManagementRequest) {
  const headers = await authHeader();
  if (request && !request.current()) throw new DOMException("Management view detached", "AbortError");
  const response = await fetch(endpoint, { method: body ? "POST" : "GET", cache: "no-store", headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), ...(request?.signal ? {signal:request.signal} : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || (data.publication?.phase === "failed" ? "发布失败，请在完整配置中心查看记录" : "读取失败，请重试")), { ...data });
  return data;
}
