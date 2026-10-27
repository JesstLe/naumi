"use client";
import {authHeader} from "@/lib/supabase";
import {endpoint} from "./contracts";

export async function api(body?: unknown) {
  const response = await fetch(endpoint, { method: body ? "POST" : "GET", cache: "no-store", headers: { ...await authHeader(), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || (data.publication?.phase === "failed" ? "发布失败，请在完整配置中心查看记录" : "读取失败，请重试")), { ...data });
  return data;
}
