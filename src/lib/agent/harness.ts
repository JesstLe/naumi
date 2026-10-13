import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { Check } from "typebox/value";
import type { TSchema } from "typebox";
import { agentMediaUrl } from "./media-policy";

/** Authority is server-owned. Model/user/Skill/tool text never supplies these fields. */
export const HARNESS_LIMITS = Object.freeze({
  requestBytes: 96 * 1024, messageChars: 4000, historyTurns: 12,
  toolArgumentBytes: 64 * 1024, resultBytes: 512 * 1024, outputChars: 192 * 1024,
  modelTurns: 24, toolCalls: 32, writeCalls: 8, runMs: 780_000, toolMs: 600_000,
});
export type HarnessCode = "INPUT_INVALID" | "TOOL_DENIED" | "ARGUMENT_INVALID" | "BUDGET_EXCEEDED" | "RUN_INACTIVE" | "REPLAY_BLOCKED" | "INTENT_REQUIRED" | "OUTPUT_BLOCKED" | "BACKEND_DISABLED";
export class HarnessError extends Error {
  constructor(readonly code: HarnessCode, readonly status = 400) { super(`Agent 请求被执行边界拦截（${code}）`); this.name = "HarnessError"; }
}
export function harnessErrorResponse(error: unknown): Response {
  const failure = error instanceof HarnessError ? error : new HarnessError("INPUT_INVALID");
  return Response.json({ error: failure.message, code: failure.code }, { status: failure.status });
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
function boundedJson(value: unknown, limit: number, code: HarnessCode,arrayLimit=200) {
  let nodes = 0;
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 4096 || depth > 12) throw new HarnessError(code);
    if (typeof v === "number" && !Number.isFinite(v)) throw new HarnessError(code);
    if (typeof v === "string" && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new HarnessError(code);
    if (Array.isArray(v)) { if (v.length > arrayLimit) throw new HarnessError(code); v.forEach(x => visit(x, depth + 1)); }
    else if (record(v)) { for (const [key, x] of Object.entries(v)) { if (forbiddenKeys.has(key)) throw new HarnessError(code); visit(x, depth + 1); } }
    else if (v !== null && !["string", "number", "boolean", "undefined"].includes(typeof v)) throw new HarnessError(code);
  };
  visit(value, 0);
  const json = JSON.stringify(value);
  if (!json || Buffer.byteLength(json) > limit) throw new HarnessError(code);
  return json;
}
/** Bounded reader, including chunked bodies; do not trust Content-Length. */
export async function readHarnessBody(request: Request): Promise<Record<string, unknown>> {
  if (request.signal.aborted) throw new HarnessError("RUN_INACTIVE",409);
  const reader = request.body?.getReader();
  if (!reader) throw new HarnessError("INPUT_INVALID");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > HARNESS_LIMITS.requestBytes) throw new HarnessError("INPUT_INVALID", 413); chunks.push(value); } }
  catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HarnessError("INPUT_INVALID"); }
  if (!record(body)) throw new HarnessError("INPUT_INVALID");
  boundedJson(body, HARNESS_LIMITS.requestBytes, "INPUT_INVALID");
  for (const key of ["message", "sessionId", "anchorId", "projectKey", "turnId", "imageModelId", "id", "title", "action", "mode", "ratio", "resolution", "quality", "videoNodeId", "textNodeId"]) if (body[key] !== undefined && typeof body[key] !== "string") throw new HarnessError("INPUT_INVALID");
  if (typeof body.message === "string" && body.message.length > HARNESS_LIMITS.messageChars) throw new HarnessError("INPUT_INVALID");
  for (const key of ["history", "messages"]) if (body[key] !== undefined) validateHarnessHistory(body[key]);
  for (const key of ["images", "contextIds"]) if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].length > 6 || !(body[key] as unknown[]).every(x => typeof x === "string" && x.length < 2048))) throw new HarnessError("INPUT_INVALID");
  return body;
}
export function validateHarnessHistory(value: unknown): asserts value is {role: "user" | "assistant"; content: string}[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every(x => record(x) && ["user", "assistant"].includes(String(x.role)) && typeof x.content === "string" && x.content.length <= HARNESS_LIMITS.messageChars)) throw new HarnessError("INPUT_INVALID");
}
export function assertHarnessSessionId(value: string, entry: "workbench" | "canvas") {
  if (!/^[\w-]{1,64}$/.test(value) || (entry === "workbench" && value.startsWith("cv-")) || (entry === "canvas" && !value.startsWith("cv-"))) throw new HarnessError("INPUT_INVALID");
}
export function explicitQuoteConsent(message: string) {
  // Only the new authenticated user turn, never history/steering/Skill/model text.
  return /^(?:确认(?:报价|生成|执行|继续)?|同意(?:报价|生成|执行|继续)?|按(?:这个|该|此)报价(?:生成|执行|继续)|yes|confirm|approved|proceed)[。.!！\s]*$/i.test(message.trim());
}
export function creativeIntent(message: string) {
  if (/只(?:分析|总结|解释|讨论)|^(?:请|帮我)?(?:分析|总结|解释|讨论)|(?:不要|不需要|别|不必)(?:再)?(?:生成|生图|调用|执行)|如何|怎么|how (?:to|does)/i.test(message)) return false;
  return /转换(?:图片|图像)?格式|压缩图片|缩小图片|去底色|chroma.?key|resize.*image|convert.*(?:png|webp|jpeg)|生成|生图|出图|画(?:图|一|个|张)|做(?:一|个|张|套)|来(?:一|个|张|套)|绘制|创作|精修|换色|替换|修改|调整|换.{0,4}视角|改(?:图|色|成|为)|变成|抠图|清晰|去水印|去皱|复刻|裂变|融图|试穿|服装上身|详情页|包装|印刷|导入|风格(?:转换|迁移)|(?:写|拟|起|优化|想).{0,12}(?:标题|卖点)|执行工作流|运行工作流|generate|create|draw|render|retouch|recolor|upscale|inpaint|remove.*(?:background|watermark)|try.?on|replicate|import|run.*workflow/i.test(message);
}
export function untrustedAgentData(source: string, value: unknown) {
  return `\n[UNTRUSTED_DATA ${source}]\n${JSON.stringify(value)}\n[/UNTRUSTED_DATA]\n`;
}
/** Coarse capability confinement, not an injection detector. Unknown capabilities fail closed. */
function requestedWriteCapabilities(message: string): Set<string> {
  const allowed = new Set<string>();
  const grant = (pattern: RegExp, names: string[]) => { if (pattern.test(message)) names.forEach(name => allowed.add(name)); };
  if (creativeIntent(message)) {
    allowed.add("generate_image");
    grant(/精修|修复|retouch/i,["retouch_product"]);
    grant(/换色|颜色|替换|[红蓝绿黑白黄紫橙粉灰]色|recolor|colou?r/i,["recolor_product"]);
    grant(/复刻|replicate/i,["replicate_hot","replicate_competitor"]);
    grant(/套图|一套|整套|suite/i,["generate_suite"]);
    grant(/a\+|详情页|aplus/i,["generate_aplus","continue_aplus_generation"]);
    grant(/重做.*母图|母图.*重做|redo.*source/i,["review_aplus_source"]);
    grant(/包装|刀版|模切|packaging/i,["generate_packaging_3d"]);
    grant(/(?:执行|运行|run).*(?:comfy|工作流|workflow)/i,["run_comfy_workflow"]);
    grant(/视频|video/i,["generate_video","create_video_node","set_video_config","set_video_prompt","set_video_references","plan_video_shot","plan_video_storyboard","run_video_workflow","resume_video_workflow","confirm_video_workflow_stage"]);
    grant(/视频.*(?:续|延长)|(?:续|延长).*视频|extend.*video/i,["extend_video"]);
    grant(/(?:改|编辑|修改).*视频|视频.*(?:改|编辑|修改)|edit.*video/i,["edit_video"]);
    grant(/抠图|去背景|remove.*background|cutout/i,["cutout_image"]);
    grant(/头像|avatar/i,["cutout_avatar"]);
    grant(/清晰|放大|upscale/i,["upscale_image"]);
    grant(/局部|选区|inpaint/i,["inpaint_image","edit_competitor"]);
    grant(/风格|style/i,["transfer_style"]);
    grant(/水印|watermark/i,["remove_watermark"]);
    grant(/试穿|上身|try.?on/i,["try_on_clothing"]);
    grant(/服装.*提取|提取.*服装|extract.*garment/i,["extract_garment"]);
    grant(/3d.*服装|服装.*3d|garment.*3d/i,["generate_garment_3d"]);
    grant(/去皱|dewrinkle/i,["dewrinkle_clothing"]);
    grant(/印花|print.*extract/i,["extract_print"]);
    grant(/印刷|print.*file/i,["prepare_print_file"]);
    grant(/裂变|变体|variation/i,["generate_variations"]);
    grant(/融图|融合|fuse/i,["fuse_images"]);
    grant(/标题|卖点|title/i,["generate_titles"]);
    grant(/导入|import/i,["import_competitor_image"]);
  }
  grant(/(?:通过|确认).*(?:母图|白底)|母图.*通过|approve.*source/i,["review_aplus_source"]);
  grant(/侵权|版权.*(?:检测|检查)|copyright.*check/i,["check_image_ip"]);
  grant(/(?:分析|反推).*竞品|竞品.*(?:分析|反推)|analy[sz]e.*competitor/i,["analyze_competitor"]);
  if(/视频|video/i.test(message)&&!/只(?:分析|总结|解释|讨论)|(?:不要|不需要|别|不必).*(?:生成|执行|修改)|how (?:to|does)/i.test(message)){
    grant(/(?:生成|制作|拍摄|produce|make).*(?:视频|影片|短片|video)|(?:视频|影片|短片|video).*(?:生成|制作)/i,["generate_video","create_video_node","set_video_config","set_video_prompt","set_video_references","plan_video_shot","plan_video_storyboard","run_video_workflow","resume_video_workflow"]);
    grant(/(?:规划|策划|编写|编辑|修改|设置|保存|分镜|镜头|plan|storyboard|configure|save)/i,["create_video_node","set_video_config","set_video_prompt","set_video_references","plan_video_shot","plan_video_storyboard"]);
    grant(/(?:停止|取消|stop|cancel)/i,["cancel_video_task","cancel_video_workflow","cancel_video_media_task"]);
    grant(/(?:抽帧|音轨|分离|裁剪|剪辑|拼接|合成|处理|ffmpeg|ffprobe|extract|trim|concat|process)/i,["process_video"]);
  }
  if(/^(?:请)?(?:停止|取消)(?:当前)?(?:任务|生成|处理)[。.!！\s]*$/.test(message.trim()))["cancel_video_task","cancel_video_media_task","cancel_video_workflow"].forEach(name=>allowed.add(name));
  if(/抽帧|提取音轨|分离音视频|ffmpeg|ffprobe/i.test(message)&&!/只(?:分析|解释|讨论)|(?:不要|不需要|别|不必).*(?:调用|执行|生成|处理)|如何|怎么|how (?:to|does)/i.test(message))allowed.add("process_video");
  return allowed;
}
function schemaArrayLimit(schema:Record<string,any>):number{let limit=200;const visit=(value:unknown)=>{if(!value||typeof value!=="object")return;const node=value as Record<string,any>;if(Number.isInteger(node.maxItems))limit=Math.max(limit,Math.min(1024,node.maxItems));for(const item of Object.values(node))if(item&&typeof item==="object")if(Array.isArray(item))item.forEach(visit);else visit(item);};visit(schema);return limit;}
function strictSchema(schema: Record<string, any>): TSchema {
  const copy: Record<string, any> = { ...schema };
  if (schema.type === "object") { copy.additionalProperties = false; copy.properties = Object.fromEntries(Object.entries(schema.properties || {}).map(([key, s]) => [key, strictSchema(s as Record<string, any>)])); }
  if (schema.items) copy.items = strictSchema(schema.items);
  for (const key of ["anyOf", "oneOf", "allOf"]) if (schema[key]) copy[key] = schema[key].map(strictSchema);
  return copy as TSchema;
}
export type HarnessTool = { name: string; parameters: object; write: boolean; timeoutMs?: number };
export type HarnessAudit = { runId: string; code: string; tool?: string; at: number };
export class AgentHarness {
  readonly owner: string;
  readonly sessionId: string;
  private tools = new Map<string, HarnessTool>();
  private active = false;
  private runId = "";
  private startedAt = 0;
  private toolCalls = 0;
  private writeCalls = 0;
  private modelTurns = 0;
  private writeCapabilities = new Set<string>();
  private consentTargets = new Set<string>();
  private controller = new AbortController();
  private usedCalls = new Set<string>();
  private usedWrites = new Set<string>();
  private permits = new Map<string, string>();
  private secrets = new Set<string>();
  private protectedLines = new Set<string>();
  private abortRun?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(owner: string, sessionId: string, private audit: (event: HarnessAudit) => void = () => undefined) {
    if (!owner.trim() || owner.length > 254 || !/^[\w-]{1,64}$/.test(sessionId)) throw new HarnessError("INPUT_INVALID");
    this.owner = owner.trim().toLowerCase(); this.sessionId = sessionId;
    for (const [key, value] of Object.entries(process.env)) if (/KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL/.test(key) && value) this.registerSecret(value);
  }
  registerSecret(value?: string) {
    if (!value || value.length < 8) return;
    this.secrets.add(value);
    if (/^Bearer\s+/i.test(value)) this.secrets.add(value.replace(/^Bearer\s+/i,""));
    for (const segment of value.split(";")) { const index=segment.indexOf("=");if(index>0 && /^(?:nv_user|nv_admin|session|token|auth)/i.test(segment.trim())) {const token=segment.slice(index+1).trim();if(token.length>=8)this.secrets.add(token);} }
  }
  protectPrompt(prompt: string) {
    // Protect executable policy, not publicly deliverable code/assets in fences.
    let fenced = false;
    for (const line of prompt.split("\n")) { if (/^```/.test(line)) { fenced = !fenced; continue; } if (!fenced && line.trim().length >= 32) this.protectedLines.add(line.trim()); }
  }
  configure(tools: HarnessTool[]) {
    if (this.active) throw new HarnessError("RUN_INACTIVE", 409);
    this.tools = new Map(tools.map(t => [t.name, { ...t, parameters: strictSchema(t.parameters) }]));
  }
  begin(message: string, abortRun: () => void, consentTargets: readonly string[] = []) {
    if (this.active) throw new HarnessError("RUN_INACTIVE", 409);
    if (!message.trim() || message.length > HARNESS_LIMITS.messageChars) throw new HarnessError("INPUT_INVALID");
    this.runId = randomUUID(); this.startedAt = Date.now(); this.toolCalls = this.writeCalls = this.modelTurns = 0;
    this.usedCalls.clear(); this.usedWrites.clear(); this.permits.clear(); this.controller = new AbortController(); this.writeCapabilities = requestedWriteCapabilities(message);
    this.consentTargets = new Set(consentTargets);
    this.active = true; this.abortRun = abortRun;
    this.timer = setTimeout(() => this.stop("BUDGET_EXCEEDED"), HARNESS_LIMITS.runMs); this.timer.unref?.();
    this.log("RUN_STARTED"); return this.runId;
  }
  finish() { clearTimeout(this.timer); this.controller.abort(); this.active = false; this.permits.clear(); this.abortRun = undefined; this.log("RUN_FINISHED"); }
  stop(code: HarnessCode = "RUN_INACTIVE") { this.controller.abort(new HarnessError(code)); this.log(code); this.abortRun?.(); }
  private log(code: string, tool?: string) { this.audit({ runId: this.runId, code, tool, at: Date.now() }); }
  private live() { if (!this.active || this.controller.signal.aborted) throw new HarnessError("RUN_INACTIVE", 409); if (Date.now() - this.startedAt > HARNESS_LIMITS.runMs) { this.stop("BUDGET_EXCEEDED"); throw new HarnessError("BUDGET_EXCEEDED", 429); } }
  requireActive() { this.live(); }
  modelStep() { this.live(); if (++this.modelTurns > HARNESS_LIMITS.modelTurns) { this.stop("BUDGET_EXCEEDED"); throw new HarnessError("BUDGET_EXCEEDED", 429); } }
  check(name: string, args: unknown) {
    this.live(); const tool = this.tools.get(name);
    if (!tool) throw new HarnessError("TOOL_DENIED", 403);
    boundedJson(args, HARNESS_LIMITS.toolArgumentBytes, "ARGUMENT_INVALID",schemaArrayLimit(tool.parameters as Record<string,any>));
    if (!record(args) || !Check(tool.parameters as TSchema, args)) throw new HarnessError("ARGUMENT_INVALID");
    if (this.publicText(JSON.stringify(args), false) !== JSON.stringify(args)) throw new HarnessError("ARGUMENT_INVALID");
    for (const [key, value] of Object.entries(args)) if (["job_id", "task_id", "workflow_id", "item_id", "provider_id", "model_id", "model", "modelId", "product_id"].includes(key) && (typeof value !== "string" || !/^[\w.:-]{1,160}$/.test(value))) throw new HarnessError("ARGUMENT_INVALID");
    const pricingArgs = Object.fromEntries(Object.entries(args).filter(([key]) => key !== "confirm"));
    if (tool.write && !this.writeCapabilities.has(name) && !this.consentTargets.has(name + ":" + canonical(pricingArgs))) throw new HarnessError("INTENT_REQUIRED", 403);
    if (this.toolCalls >= HARNESS_LIMITS.toolCalls || (tool.write && this.writeCalls >= HARNESS_LIMITS.writeCalls)) throw new HarnessError("BUDGET_EXCEEDED", 429);
    return tool;
  }
  permit(name: string, args: unknown, callId: string) {
    this.check(name, args); if (!callId || callId.length > 200 || this.usedCalls.has(callId)) throw new HarnessError("REPLAY_BLOCKED", 409);
    this.permits.set(callId, createHash("sha256").update(canonical({ name, args })).digest("hex"));
  }
  async execute<T>(name: string, args: unknown, callId: string, signal: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const tool = this.check(name, args), expected = createHash("sha256").update(canonical({ name, args })).digest("hex");
    if (this.usedCalls.has(callId)) throw new HarnessError("REPLAY_BLOCKED", 409);
    if (this.permits.get(callId) !== expected) throw new HarnessError("TOOL_DENIED", 403);
    const signature = canonical({ name, args: record(args) ? Object.fromEntries(Object.entries(args).filter(([key]) => key !== "confirm")) : args });
    if (tool.write && this.usedWrites.has(signature)) throw new HarnessError("REPLAY_BLOCKED", 409);
    if (tool.write) this.usedWrites.add(signature);
    this.permits.delete(callId); this.usedCalls.add(callId); this.toolCalls++; if (tool.write) this.writeCalls++;
    const timeout = new AbortController();
    const owned = AbortSignal.any([this.controller.signal, timeout.signal, ...(signal ? [signal] : [])]);
    if (owned.aborted) throw new HarnessError("RUN_INACTIVE", 409);
    this.log("TOOL_ACCEPTED", name);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => undefined;
    try {
      const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(new HarnessError("RUN_INACTIVE", 409)); owned.addEventListener("abort", onAbort, { once: true }); });
      timer = setTimeout(() => timeout.abort(), Math.min(tool.timeoutMs || HARNESS_LIMITS.toolMs, HARNESS_LIMITS.toolMs));
      const result = await Promise.race([fn(owned), aborted]);
      this.live(); boundedJson(result, HARNESS_LIMITS.resultBytes, "OUTPUT_BLOCKED");
      this.log("TOOL_COMPLETED", name); return result;
    } catch (error) { this.log(error instanceof HarnessError ? error.code : "TOOL_FAILED", name); throw error instanceof HarnessError ? error : new Error(this.publicText(error instanceof Error ? error.message : "工具执行失败", false)); }
    finally { clearTimeout(timer); owned.removeEventListener("abort", onAbort); }
  }
  publicText(text: string, protectInstructions = true) {
    if (text.length > HARNESS_LIMITS.outputChars) { this.log("OUTPUT_BLOCKED"); return "回复超过输出上限，请缩小任务后重试。"; }
    let result = text;
    for (const secret of this.secrets) result = result.split(secret).join("[已隐藏]");
    result = result.replace(/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~-]{16,})\b/gi, "[已隐藏]")
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[已隐藏]");
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt: string, url: string) => agentMediaUrl(url, process.env.INTERNAL_APP_ORIGIN) ? full : `[${alt || "图片"}]`)
      .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, (_full,alt:string)=>`[${alt||"图片"}]`);
    if (protectInstructions && [...this.protectedLines].some(line => result.includes(line))) { this.log("OUTPUT_BLOCKED"); return "内部执行规则不公开。请继续描述你的创作需求。"; }
    return result;
  }
  sanitize<T>(value: T): T {
    const clean = (v: unknown, depth: number): unknown => {
      if (depth > 12) return null;
      if (typeof v === "string") return this.publicText(v, false);
      if (Array.isArray(v)) return v.map(x => clean(x, depth + 1));
      if (record(v)) return Object.fromEntries(Object.entries(v).filter(([key]) => !forbiddenKeys.has(key) && !/^(?:cookie|authorization|apiKey|api_key|token|password|secret|credentials|systemPrompt)$/i.test(key)).map(([key, x]) => [key, clean(x, depth + 1)]));
      return v;
    };
    return clean(value, 0) as T;
  }
  outputHoldback() { return Math.max(512, ...[...this.secrets, ...this.protectedLines].map(x => x.length + 32)); }
}
function canonical(v: unknown): string { return Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : record(v) ? `{${Object.keys(v).sort().map(key => `${JSON.stringify(key)}:${canonical(v[key])}`).join(",")}}` : JSON.stringify(v); }
/** Delay suffixes across arbitrary provider chunks; never sanitize each delta in isolation. */
export class PublicOutputBuffer {
  private pending = "";
  private total = 0;
  constructor(private harness: AgentHarness, private emit: (text: string) => void) {}
  push(text: string) {
    this.total += text.length;
    if (this.total > HARNESS_LIMITS.outputChars) throw new HarnessError("OUTPUT_BLOCKED");
    this.pending += text;
    // A private-key block may contain newlines. Never release an incomplete block's prefix.
    if (/-----BEGIN [^-]*PRIVATE KEY-----/.test(this.pending) && !/-----END [^-]*PRIVATE KEY-----/.test(this.pending)) return;
    const end = this.pending.lastIndexOf("\n", this.pending.length - this.harness.outputHoldback());
    if (end < 0) return;
    const prefix = this.pending.slice(0, end + 1), cleaned = this.harness.publicText(prefix);
    this.emit(cleaned); this.pending = this.pending.slice(end + 1);
  }
  finish() { if (this.pending) this.emit(this.harness.publicText(this.pending)); this.pending = ""; }
}
/** Schema enforcement is also present at the real executable boundary, not just loop hooks. */
export function validateToolArguments(schema: object, args: unknown) {
  boundedJson(args, HARNESS_LIMITS.toolArgumentBytes, "ARGUMENT_INVALID",schemaArrayLimit(schema));
  if (!record(args) || !Check(strictSchema(schema), args)) throw new HarnessError("ARGUMENT_INVALID");
}
