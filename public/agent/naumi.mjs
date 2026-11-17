#!/usr/bin/env node
// Naumi CLI: lets external agents call Naumi creative tools through the agent gateway.
// Zero dependencies, Node.js >= 18. Every command prints JSON on stdout; progress goes to stderr.
//
//   node naumi.mjs login --site https://your-naumi-site --token nmk_...
//   node naumi.mjs tools                      list callable tools
//   node naumi.mjs call get_balance           run a tool (key=value / --args JSON / key=@local-file)
//   node naumi.mjs mcp                        serve the same tools over MCP (stdio)
//
// Exit codes: 0 ok, 1 tool failed, 2 usage error, 3 authentication/permission, 4 budget or credits,
// 5 result unknown or network failure (query `status <operationId>` before retrying a billed call).

import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, stat, lstat, realpath, open, link, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { createInterface } from "node:readline";

const VERSION = "1.1.0";
const API = "/api/agent-gateway/v1";
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const EXIT = { ok: 0, failed: 1, usage: 2, auth: 3, budget: 4, unknown: 5 };

class CliError extends Error {
  constructor(message, exit = EXIT.failed, detail) { super(message); this.exit = exit; this.detail = detail; }
}

// ── configuration ──────────────────────────────────────────────────────────
const configPath = () => process.env.NAUMI_CONFIG || join(homedir(), ".naumi", "config.json");
async function readConfig() {
  try { return JSON.parse(await readFile(configPath(), "utf8")); } catch { return { profiles: {} }; }
}
async function writeConfig(config) {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}
function normalizeSite(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); } catch { throw new CliError("站点地址无效，例如 --site https://naumi.example.com", EXIT.usage); }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new CliError("站点必须使用 https（本机调试除外）", EXIT.usage);
  return url.origin;
}
async function connection(options) {
  const desktop = options.desktop || process.env.NAUMI_DESKTOP === "1";
  const config = await readConfig();
  const profile = config.profiles?.[options.profile || "default"] || {};
  const site = options.site || process.env.NAUMI_SITE || profile.site;
  const tokenFile = options["token-file"] || process.env.NAUMI_TOKEN_FILE;
  const account = options.account || process.env.NAUMI_ACCOUNT;
  const fileRoot = options["file-root"] || process.env.NAUMI_FILE_ROOT;
  // Desktop never inherits a different user's default profile or ambient token.
  if (desktop && (!tokenFile || !isAbsolute(tokenFile) || !account || !fileRoot || !isAbsolute(fileRoot) || !(options.site || process.env.NAUMI_SITE))) throw new CliError("Desktop 需要显式站点、账号、受保护令牌文件及文件工作目录", EXIT.auth);
  const token = tokenFile ? (await readFile(tokenFile, "utf8")).trim() : options.token || process.env.NAUMI_TOKEN || profile.token;
  if (!site || !token) throw new CliError("尚未登录：先运行 naumi login --site <站点> --token <令牌>，或设置 NAUMI_SITE / NAUMI_TOKEN", EXIT.auth);
  const workspace = options.workspace ?? process.env.NAUMI_WORKSPACE ?? (desktop ? "" : profile.workspace || "");
  if (workspace && !/^[a-zA-Z0-9_-]{1,128}$/.test(workspace)) throw new CliError("workspace 必须是明确企业 ID", EXIT.usage);
  const conn = { site: normalizeSite(site), token, workspace, desktop, account: account?.trim().toLowerCase(), fileRoot: fileRoot ? await realpath(fileRoot) : null };
  if(desktop) {
    const tokenRelative=relative(conn.fileRoot,await realpath(tokenFile));
    if(tokenRelative!==".."&&!tokenRelative.startsWith(".."+sep)&&!isAbsolute(tokenRelative))throw new CliError("令牌文件必须位于 Agent 文件工作目录之外",EXIT.auth);
  }
  if (desktop) await checkAccount(conn);
  return conn;
}

async function checkAccount(conn) {
  const me = await getJson(conn, `${API}/me`);
  if (conn.account && me.account?.email?.toLowerCase() !== conn.account) throw new CliError("授权账号与当前 Desktop 账号不一致", EXIT.auth, {code:"ACCOUNT_MISMATCH",submitted:false});
  return me;
}

async function localPath(conn, path, output = false) {
  const full = resolve(path);
  if (!conn.desktop) return full;
  if (!isAbsolute(path)) throw new CliError("Desktop 文件路径必须为绝对路径", EXIT.usage);
  const inside = target => { const r = relative(conn.fileRoot, target); return r && r !== ".." && !r.startsWith(".." + sep) && !isAbsolute(r); };
  if (!inside(full)) throw new CliError("文件不属于当前 Desktop 工作目录", EXIT.auth);
  // Resolve existing ancestors before creating anything; reject symlink escapes.
  let parent = output ? dirname(full) : full;
  for (;;) {
    try { if (!inside(await realpath(parent)) && await realpath(parent) !== conn.fileRoot) throw new CliError("文件路径越出工作目录", EXIT.auth); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; parent = dirname(parent); }
  }
  return full;
}

// ── HTTP ───────────────────────────────────────────────────────────────────
function failureExit(status, code) {
  if (status === 401 || status === 403) return EXIT.auth;
  if (status === 402 || code === "BUDGET_EXCEEDED" || code === "INSUFFICIENT_CREDITS") return EXIT.budget;
  if (status === 400 || status === 404 || status === 409 || status === 413) return EXIT.usage;
  return EXIT.unknown;
}
async function request(conn, path, init = {}) {
  let res;
  try {
    res = await fetch(conn.site + path, { ...init, headers: { authorization: `Bearer ${conn.token}`, "user-agent": `naumi-cli/${VERSION}`, ...(conn.workspace ? {"x-naumi-workspace":conn.workspace} : {}), ...(init.headers || {}) }, redirect: "error" });
  } catch (error) {
    throw new CliError(`无法连接 ${conn.site}：${error?.cause?.code || error?.message || "网络错误"}`, EXIT.unknown);
  }
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch { /* non-JSON error */ }
    const error = body?.error && typeof body.error === "object" ? body.error : { code: `HTTP_${res.status}`, message: typeof body?.error === "string" ? body.error : `请求失败（HTTP ${res.status}）` };
    throw new CliError(error.message || `请求失败（HTTP ${res.status}）`, failureExit(res.status, error.code), error);
  }
  return res;
}
const getJson = async (conn, path) => (await request(conn, path)).json();
const postJson = async (conn, path, body) => (await request(conn, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

/** Reads the NDJSON call stream; returns the final call view. */
async function streamCall(conn, body, onEvent) {
  let res;
  try {
    res = await request(conn, `${API}/calls`, { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify(body) });
  } catch(error) {
    if(error instanceof CliError && error.detail?.submitted===false){error.detail={...error.detail,operationId:body.operationId};throw error;}
    throw new CliError(`提交结果尚未核实。不要重新提交，请查询：naumi status ${body.operationId}`,EXIT.unknown,{code:"RESULT_UNKNOWN",submitted:"unknown",operationId:body.operationId});
  }
  const decoder = new TextDecoder();
  let buffered = "", final = null, streamError = null;
  const handle = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "result") final = event.call;
    if (event.type === "error") streamError = event.error;
    onEvent?.(event);
  };
  try {
    for await (const chunk of res.body) {
      buffered += decoder.decode(chunk, { stream: true });
      let index;
      while ((index = buffered.indexOf("\n")) >= 0) { handle(buffered.slice(0, index)); buffered = buffered.slice(index + 1); }
    }
    handle(buffered + decoder.decode());
  } catch (error) {
    if (!final) throw new CliError(`连接中断，任务结果未知。不要重复提交，请查询：naumi status ${body.operationId}`, EXIT.unknown, { code: "RESULT_UNKNOWN", operationId: body.operationId, cause: error?.message });
  }
  if (!final) throw new CliError(`${streamError?.message ? `${streamError.message}；` : ""}未收到最终结果，任务状态未知。请查询：naumi status ${body.operationId}`, EXIT.unknown, { code: "RESULT_UNKNOWN", operationId: body.operationId, ...(streamError ? { cause: streamError } : {}) });
  return final;
}

// ── tool arguments ─────────────────────────────────────────────────────────
async function tools(conn) { return (await getJson(conn, `${API}/tools`)).tools; }
function schemaType(schema) {
  if (!schema || typeof schema !== "object") return "string";
  if (schema.type) return Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const variant = (schema.anyOf || schema.oneOf || [])[0];
  if (variant?.const !== undefined) return typeof variant.const;
  return schemaType(variant);
}
function coerce(value, type) {
  if (type === "number" || type === "integer") { const n = Number(value); if (!Number.isFinite(n)) throw new CliError(`参数应为数字：${value}`, EXIT.usage); return n; }
  if (type === "boolean") { if (!["true", "false"].includes(value)) throw new CliError(`参数应为 true/false：${value}`, EXIT.usage); return value === "true"; }
  if (type === "object" || type === "array") { try { return JSON.parse(value); } catch { return value; } }
  return value;
}
function isImagePath(value) { return typeof value === "string" && value.startsWith("@") && value.length > 1; }
async function uploadFile(conn, path) {
  const full = await localPath(conn, path);
  const type = IMAGE_TYPES[extname(full).toLowerCase()];
  if (!type) throw new CliError(`仅支持 png/jpg/webp 图片：${path}`, EXIT.usage);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) throw new CliError(`文件不存在：${path}`, EXIT.usage);
  if (info.size > MAX_UPLOAD_BYTES) throw new CliError(`图片超过 12MB：${path}`, EXIT.usage);
  const form = new FormData();
  form.append("file", new Blob([await readFile(full)], { type }), basename(full));
  return (await request(conn, `${API}/uploads`, { method: "POST", body: form })).json();
}
/** key=value pairs, --args JSON, --args-file; `@./file.png` values upload a local image first. */
async function buildArguments(conn, toolName, options, pairs) {
  let args = {};
  if (options.args) { try { args = JSON.parse(options.args); } catch { throw new CliError("--args 必须是 JSON 对象", EXIT.usage); } }
  if (options["args-file"]) {
    const raw = options["args-file"] === "-" ? await readStdin() : await readFile(options["args-file"], "utf8");
    try { args = { ...args, ...JSON.parse(raw) }; } catch { throw new CliError("--args-file 内容必须是 JSON 对象", EXIT.usage); }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new CliError("工具参数必须是 JSON 对象", EXIT.usage);
  if (pairs.length) {
    const tool = (await tools(conn)).find(t => t.name === toolName);
    if (!tool) throw new CliError(`没有这个工具：${toolName}（naumi tools 查看）`, EXIT.usage);
    const properties = tool.parameters?.properties || {};
    for (const pair of pairs) {
      const index = pair.indexOf("=");
      if (index <= 0) throw new CliError(`参数格式应为 key=value：${pair}`, EXIT.usage);
      const key = pair.slice(0, index), raw = pair.slice(index + 1), schema = properties[key];
      if (!schema) throw new CliError(`工具 ${toolName} 没有参数 ${key}；可用参数：${Object.keys(properties).join(", ") || "无"}`, EXIT.usage);
      const type = schemaType(schema);
      if (type === "array") {
        const itemType = schemaType(schema.items);
        const values = raw.startsWith("[") ? coerce(raw, "array") : [coerce(raw, itemType)];
        args[key] = [...(Array.isArray(args[key]) ? args[key] : []), ...(Array.isArray(values) ? values : [values])];
      } else args[key] = coerce(raw, type);
    }
  }
  return resolveUploads(conn, args);
}
async function resolveUploads(conn, value) {
  if (isImagePath(value)) { const uploaded = await uploadFile(conn, value.slice(1)); log(`已上传 ${value.slice(1)}`); return uploaded.url; }
  if (Array.isArray(value)) return Promise.all(value.map(item => resolveUploads(conn, item)));
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await resolveUploads(conn, v)])));
  return value;
}

// ── media ──────────────────────────────────────────────────────────────────
async function download(conn, url, out) {
  let target = resolve(out || basename(new URL(url, conn.site).pathname) || "naumi-media");
  if (out && (out.endsWith("/") || out.endsWith("\\") || (await stat(target).catch(() => null))?.isDirectory())) target = join(target, basename(new URL(url, conn.site).pathname) || "naumi-media");
  target = await localPath(conn, target, true);
  const res = await request(conn, `${API}/media?url=${encodeURIComponent(url)}`);
  await mkdir(dirname(target), { recursive: true });
  const temporary = target + "." + randomUUID() + ".part";
  let bytes = 0; const hash = createHash("sha256");
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      for await (const chunk of res.body) {
        bytes += chunk.length;
        if (conn.desktop && bytes > 256 * 1024 * 1024) throw new CliError("媒体超过 Desktop 单文件 256MiB 上限", EXIT.usage);
        hash.update(chunk); await file.writeFile(chunk);
      }
      await file.sync();
    } finally { await file.close(); }
    const digest = hash.digest("hex");
    if (conn.desktop) {
      try { await link(temporary, target); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (!(await lstat(target)).isFile() || await realpath(target) !== target) throw new CliError("目标不是独立常规文件",EXIT.auth);
        const old = await readFile(target);
        if (old.length !== bytes || createHash("sha256").update(old).digest("hex") !== digest) throw new CliError("目标文件已存在且内容不同，请指定新文件名", EXIT.usage, {code:"FILE_CONFLICT",submitted:false});
      }
    } else { await writeFile(target, await readFile(temporary)); }
    return { url, path: target, bytes, sha256: digest, contentType: res.headers.get("content-type") || "" };
  } finally { await unlink(temporary).catch(() => undefined); await res.body?.cancel().catch(() => undefined); }
}

// ── commands ───────────────────────────────────────────────────────────────
function log(message) { process.stderr.write(`[naumi] ${message}\n`); }
function print(value) { process.stdout.write(JSON.stringify(value, null, 2) + "\n"); }
async function readStdin() { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString("utf8"); }

function exitForCall(call) {
  if (call.state === "succeeded") return EXIT.ok;
  if (call.state === "running" || call.state === "unknown" || call.error?.submitted === "unknown") return EXIT.unknown;
  if (["BUDGET_EXCEEDED", "INSUFFICIENT_CREDITS"].includes(call.error?.code)) return EXIT.budget;
  if (["SCOPE_DENIED", "FEATURE_DENIED"].includes(call.error?.code)) return EXIT.auth;
  return EXIT.failed;
}

async function runCall(conn, toolName, options, pairs) {
  if (!toolName) throw new CliError("用法：naumi call <工具名> [key=value ...] [--args JSON]", EXIT.usage);
  const args = await buildArguments(conn, toolName, options, pairs);
  const operationId = options["operation-id"] || randomUUID();
  log(`提交 ${toolName}（operationId ${operationId}）`);
  const call = await streamCall(conn, { tool: toolName, arguments: args, operationId, ...(options.request ? { request: options.request } : {}) }, event => {
    if (event.type === "accepted") log(event.replayed ? "同一 operationId 已提交过，返回原任务" : `已受理${event.credits ? `，报价 ${event.credits} 积分` : ""}`);
    else if (event.type === "progress" && event.summary) log(event.summary);
  });
  if (options.out && call.output?.media?.length) call.downloads = await Promise.all(call.output.media.map(url => download(conn, url, options.out.endsWith("/") || options.out.endsWith("\\") ? options.out : options.out + "/")));
  print(call);
  return exitForCall(call);
}

const HELP = `Naumi CLI ${VERSION}: call Naumi creative tools from any agent.

  naumi login --site <https://站点> --token <nmk_令牌>   保存连接（~/.naumi/config.json，权限 600）
  naumi logout                                     删除保存的连接
  naumi whoami                                     账号、余额、令牌权限与今日预算
  naumi tools [工具名]                              列出工具；带工具名时输出完整参数 schema
  naumi quote <工具> [key=value ...]               只报价，不执行
  naumi call <工具> [key=value ...]                执行工具；收费任务在令牌每日预算内自动确认
      --args '<JSON>'  --args-file <file|->        以 JSON 传参
      key=@./图片.png                               先上传本地图片，再把地址填入参数
      --operation-id <uuid>                         自定幂等编号；同编号重复提交不会重复执行
      --out <目录>                                  完成后下载结果媒体到目录
      --request '<用户原始需求>'                     供视觉检查等工具参考
  naumi status <operationId>                       查询任务状态与结果
  naumi upload <图片...>                            上传参考图，返回可传给工具的地址
  naumi download <地址> [--out 路径]                下载结果媒体
  naumi mcp                                        以 MCP（stdio）方式提供同一套工具

通用选项：--profile <名称>  --site <站点>  --token <令牌>；环境变量 NAUMI_SITE / NAUMI_TOKEN / NAUMI_CONFIG
企业空间：--workspace <企业ID> / NAUMI_WORKSPACE；上传、报价、执行、查询和下载使用同一显式空间。
Desktop：mcp --desktop，设置 NAUMI_SITE / NAUMI_ACCOUNT / NAUMI_TOKEN_FILE / NAUMI_FILE_ROOT。
Desktop 写操作使用 naumi_call {tool,arguments,operationId,request?}，先持久化 UUID 再提交。
退出码：0 成功，1 工具失败，2 参数错误，3 鉴权/权限，4 预算或余额不足，5 结果未知/网络中断`;

async function main(argv) {
  const options = {}, positional = [];
  const flags = new Set(["json", "help", "version", "desktop"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") { positional.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
      if (flags.has(key)) options[key] = true;
      else if (inline !== undefined) options[key] = inline;
      else { if (i + 1 >= argv.length) throw new CliError(`--${key} 缺少值`, EXIT.usage); options[key] = argv[++i]; }
    } else positional.push(arg);
  }
  const [command, ...rest] = positional;
  if (options.version) { print({ version: VERSION }); return EXIT.ok; }
  if (!command || options.help || command === "help") { process.stdout.write(HELP + "\n"); return EXIT.ok; }
  switch (command) {
    case "login": {
      const site = normalizeSite(options.site || process.env.NAUMI_SITE);
      const token = options.token === "-" ? (await readStdin()).trim() : options.token || process.env.NAUMI_TOKEN;
      if (!token) throw new CliError("缺少 --token（可用 --token - 从标准输入读取）", EXIT.usage);
      const me = await getJson({ site, token }, `${API}/me`);
      const config = await readConfig();
      config.profiles = { ...(config.profiles || {}), [options.profile || "default"]: { site, token, ...(options.workspace ? {workspace:options.workspace} : {}) } };
      await writeConfig(config);
      print({ ok: true, site, profile: options.profile || "default", account: me.account, token: me.token });
      return EXIT.ok;
    }
    case "logout": {
      const config = await readConfig();
      delete config.profiles?.[options.profile || "default"];
      await writeConfig(config);
      print({ ok: true });
      return EXIT.ok;
    }
    case "whoami": print(await getJson(await connection(options), `${API}/me`)); return EXIT.ok;
    case "tools": {
      const list = await tools(await connection(options));
      if (rest[0]) {
        const tool = list.find(t => t.name === rest[0]);
        if (!tool) throw new CliError(`没有这个工具：${rest[0]}`, EXIT.usage);
        print(tool);
      } else print(options.json ? list : list.map(({ name, description, write, billed }) => ({ name, write, billed, description })));
      return EXIT.ok;
    }
    case "quote": {
      const conn = await connection(options);
      if (!rest[0]) throw new CliError("用法：naumi quote <工具名> [key=value ...]", EXIT.usage);
      print(await postJson(conn, `${API}/quote`, { tool: rest[0], arguments: await buildArguments(conn, rest[0], options, rest.slice(1)) }));
      return EXIT.ok;
    }
    case "call": return runCall(await connection(options), rest[0], options, rest.slice(1));
    case "status": {
      if (!rest[0]) throw new CliError("用法：naumi status <operationId>", EXIT.usage);
      const call = await getJson(await connection(options), `${API}/calls/${encodeURIComponent(rest[0])}`);
      print(call);
      return exitForCall(call);
    }
    case "upload": {
      const conn = await connection(options);
      if (!rest.length) throw new CliError("用法：naumi upload <图片路径...>", EXIT.usage);
      const uploaded = [];
      for (const path of rest) uploaded.push({ file: path, ...(await uploadFile(conn, path)) });
      print(uploaded);
      return EXIT.ok;
    }
    case "download": {
      if (!rest[0]) throw new CliError("用法：naumi download <地址> [--out 路径]", EXIT.usage);
      print(await download(await connection(options), rest[0], options.out));
      return EXIT.ok;
    }
    case "mcp": await serveMcp(await connection(options)); return EXIT.ok;
    default: throw new CliError(`未知命令：${command}（naumi help 查看用法）`, EXIT.usage);
  }
}

// ── MCP server (stdio, newline-delimited JSON-RPC 2.0) ─────────────────────
const MCP_HELPERS = [
  { name: "naumi_connection", description: "读取当前授权账号、令牌权限、预算及显式企业空间。不代表所有模型可用。", inputSchema: {type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,openWorldHint:false} },
  { name: "naumi_tools", description: "实时读取当前账号工具完整 schema 和 available。未授权/不可用项不是可执行承诺。", inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false} },
  { name: "naumi_quote", description: "按现有服务端规则只报价，不生成或锁价。", inputSchema:{type:"object",properties:{tool:{type:"string"},arguments:{type:"object"}},required:["tool","arguments"],additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:true} },
  { name: "naumi_call", description: "使用已持久化的外层 operationId 执行工具。arguments 保持原schema，内层 operation_id 不变。断网仅查原编号，不换号重提。", inputSchema:{type:"object",properties:{tool:{type:"string"},arguments:{type:"object"},operationId:{type:"string",format:"uuid"},request:{type:"string",maxLength:4000}},required:["tool","arguments","operationId"],additionalProperties:false},annotations:{readOnlyHint:false,openWorldHint:true} },
  { name: "naumi_upload_image", description: "上传本机图片（png/jpg/webp，≤12MB），返回可传给 Naumi 工具图片参数的地址。", inputSchema: { type: "object", properties: { path: { type: "string", description: "本机图片的绝对路径" } }, required: ["path"], additionalProperties: false }, annotations: { readOnlyHint: false, openWorldHint: false } },
  { name: "naumi_download_media", description: "把 Naumi 结果媒体地址下载到本机文件或目录。", inputSchema: { type: "object", properties: { url: { type: "string" }, out: { type: "string", description: "保存路径或目录（绝对路径）" } }, required: ["url", "out"], additionalProperties: false }, annotations: { readOnlyHint: false, openWorldHint: false } },
  { name: "naumi_call_status", description: "按 operationId 查询 Naumi 任务状态与结果。结果未知时先查询，不要重复提交收费任务。", inputSchema: { type: "object", properties: { operationId: { type: "string" } }, required: ["operationId"], additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } },
];
const MCP_INSTRUCTIONS = "原片语音辅助审片先prepare_video_audio_review提取确切候选声音，完成后review_video_storyboard_audio传原target/audioJobId和稳定request.operationId；读取get_video_audio_review，恢复recover_video_audio_review只消费原结果，不重新调用模型。原稿参考不作为识别提示词；文字一致不是质量合格，不检查发音声线口型。只有人工明确选择才保存take.audioReviews引用及annotations，不自动改稿/采用/返工。 先list_dialogue_audio_models读取真实通道、音色及能力。真实配音用generate_dialogue_speech，转写用transcribe_dialogue_audio，传已保存对白target和稳定request.operationId；只使用已发布音频模型/音色/格式。get_dialogue_audio_operation只读原回执；recover_dialogue_audio_operation只恢复已保存字节，不重发模型；无检查点UNKNOWN保持待核对。adopt_dialogue_audio_operation明确采用结果，原稿/台词不被转写覆盖，其他音视频剪辑不移动。 辅助审片用prepare_video_review_frames抽样（正常媒体计费），review_video_storyboard_take检查已完成frame_job_id及原samples（正常文字视觉计费）；operation_id固定，未知不换编号。get_video_review_receipt读取原source与回执；仅静帧证据，不是整片或语音通过。明确选择后才保存take.assistedReviews引用或人工annotations，不自动改采用/返工。粗剪插镜/删镜/调序先inspect_video_storyboard_structure：明确plan/revision/timeline/revision及position_policy，首轮change_ids/follow数组为空，按差异id明确选中再预览；ripple只是位置建议，未选移动的声音/人工剪辑保持原位。apply_video_storyboard_structure沿相同完整选择和preview_digest，稳定operation_id恢复；restore_video_storyboard_structure以source_operation_id及当前工程revision撤回，后续人工修改不覆盖，历史导出不变。费用与返工先用inspect_video_storyboard_costs读取明确方案/修订和本轮nodes；方案费用、共享历史、继承复用分开，未知与BYOC外部费用不当零，预扣不当已花费，报价不锁价也不新增预算；影响只沿真实输入依赖传播，不自动采用或提交。声音字幕用get/save_video_timeline读写完整正式工程，apply_video_storyboard_dialogue追加原稿和字幕草稿；逐句text/subtitleText分开，source.text保留原稿，audioClipId绑定真实声音，时间需听录音校对。render_video_timeline输出MP4/SRT并可烧录，不生成配音，原编号恢复；adopt_video_timeline明确采用。时间码批注保存于明确take.annotations(id/start/end?/issue/note)，实际秒数校验。审片返工先保存，再run_video_workflow传storyboard.review(nodeId/taskId/artworkId/annotationIds/instructions)，仅生成该镜且不带assembly；plan.reviewOrigin冻结来源并关联实际taskId，不自动采用或循环重做。Naumi 图片与视频创作工具。先查具体工具schema，复杂方案、镜头数组与工程按原JSON传递。正式分镜先列举/读取明确plan_id和revision；新候选不自动采用，用户授权代选后才保存采用及理由。独立创意方向用fork_video_storyboard，明确源方案和全部节点revision，保留稳定业务operation_id，不自动生成；共享副本仍共享节点。run_video_workflow传明确storyboard身份/修订；inspect_video_storyboard检查报价和粗剪身份，apply_video_storyboard_roughcut只更新指定目标及镜头，保留人工剪辑和声音。图片参数只接受Naumi地址，本机图片先上传。收费工具按系统报价扣积分，令牌每日预算内自动确认，超出会被拒绝。网络未知先用naumi_call_status查外层operationId；业务写操作同时保留原operation_id及原完整参数，不换编号重做。";

function callText(call) {
  const lines = [`operationId: ${call.operationId}`, `状态: ${call.state}`, `积分报价: ${call.credits ?? 0}`];
  if (call.output?.text) lines.push("", call.output.text);
  if (call.output?.media?.length) lines.push("", "结果媒体:", ...call.output.media);
  if (call.error) lines.push("", `错误(${call.error.code}): ${call.error.message}`);
  if (call.state === "unknown" || call.state === "running" || call.error?.submitted === "unknown") lines.push("", "任务结果未知或仍在执行：请用 naumi_call_status 查询，不要重复提交。");
  return lines.join("\n");
}

async function serveMcp(conn) {
  const send = message => process.stdout.write(JSON.stringify(message) + "\n");
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
  const toolResult = (text, isError = false, structured) => ({ content: [{ type: "text", text }], ...(structured ? { structuredContent: structured } : {}), isError });

  async function listTools() {
    const list = await tools(conn);
    // In Desktop, all writes go through the stable-ID envelope. Read-only tools
    // retain their schemas; discovery still returns every available=false row.
    return [...list.filter(tool => !conn.desktop || (!tool.write && !tool.billed && tool.available !== false)).map(tool => ({
      name: tool.name,
      description: `${tool.description}${tool.billed ? "（收费：按系统报价扣积分，令牌每日预算内自动确认）" : ""}`,
      inputSchema: tool.parameters && tool.parameters.type === "object" ? tool.parameters : { type: "object", properties: {} },
      annotations: { readOnlyHint: !tool.write, destructiveHint: false, idempotentHint: !tool.write, openWorldHint: true },
    })), ...MCP_HELPERS];
  }

  async function callTool(name, args, progressToken) {
    if (conn.desktop) await checkAccount(conn);
    if (name === "naumi_connection") { const me = await checkAccount(conn); return toolResult("已授权连接", false, {...me,workspace:conn.workspace || null,clientVersion:VERSION,desktop:!!conn.desktop}); }
    if (name === "naumi_tools") return toolResult("实时工具目录", false, {tools:await tools(conn)});
    if (name === "naumi_quote") { const quote = await postJson(conn, `${API}/quote`, args); return toolResult(JSON.stringify(quote), false, quote); }
    if (name === "naumi_upload_image") { const uploaded = await uploadFile(conn, String(args.path || "")); return toolResult(`已上传：${uploaded.url}`, false, uploaded); }
    if (name === "naumi_download_media") { const saved = await download(conn, String(args.url || ""), String(args.out || "")); return toolResult(`已保存：${saved.path}（${saved.bytes} 字节）`, false, saved); }
    if (name === "naumi_call_status") { const call = await getJson(conn, `${API}/calls/${encodeURIComponent(String(args.operationId || ""))}`); return toolResult(callText(call), call.state !== "succeeded", call); }
    let body;
    if (name === "naumi_call") {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(args.operationId || "") || typeof args.tool !== "string" || !args.arguments || typeof args.arguments !== "object" || Array.isArray(args.arguments)) throw new CliError("需要原外层 UUID、工具名和 arguments 对象", EXIT.usage, {code:"ARGUMENT_INVALID",submitted:false});
      body = {tool:args.tool, arguments:args.arguments,operationId:args.operationId,...(args.request !== undefined ? {request:args.request} : {})};
    } else {
      if (conn.desktop) {
        const found = (await tools(conn)).find(tool => tool.name === name && !tool.write && !tool.billed && tool.available !== false);
        if (!found) throw new CliError("Desktop 写操作请使用 naumi_call 并持久化 operationId", EXIT.usage, {code:"STABLE_OPERATION_REQUIRED",submitted:false});
      }
      body = {tool:name,arguments:args || {},operationId:randomUUID()};
    }
    let progress = 0;
    const call = await streamCall(conn, body, event => {
      if (progressToken === undefined) return;
      if (event.type === "progress" || event.type === "accepted") send({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken, progress: ++progress, message: event.summary || (event.credits ? `已受理，报价 ${event.credits} 积分` : "已受理") } });
    });
    return toolResult(callText(call), call.state !== "succeeded", call);
  }

  const handlers = {
    initialize: params => ({ protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "naumi", version: VERSION }, instructions: MCP_INSTRUCTIONS }),
    ping: () => ({}),
    "tools/list": async () => ({ tools: await listTools() }),
    "tools/call": async params => {
      try { return await callTool(String(params?.name || ""), params?.arguments || {}, params?._meta?.progressToken); }
      catch (error) { return toolResult(error instanceof CliError ? `${error.message}${error.detail?.code ? `（${error.detail.code}）` : ""}` : `调用失败：${error?.message || error}`, true, error?.detail); }
    },
  };

  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set();
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { fail(null, -32700, "Parse error"); continue; }
    const { id, method, params } = message || {};
    if (typeof method !== "string") continue; // responses from the client are ignored
    const handler = handlers[method];
    if (id === undefined || id === null) continue; // notifications (initialized, cancelled, ...)
    if (!handler) { fail(id, -32601, `Method not found: ${method}`); continue; }
    const task = Promise.resolve().then(() => handler(params)).then(result => reply(id, result), error => fail(id, -32603, error?.message || "Internal error"));
    pending.add(task); task.finally(() => pending.delete(task));
  }
  await Promise.allSettled([...pending]);
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
  if (error instanceof CliError) {
    process.stdout.write(JSON.stringify({ error: { message: error.message, ...(error.detail || {}) } }, null, 2) + "\n");
    process.exitCode = error.exit;
  } else {
    process.stderr.write(`[naumi] ${error?.stack || error}\n`);
    process.exitCode = EXIT.unknown;
  }
});
