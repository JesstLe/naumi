import { ModelConfigError } from "./types";

type JsonObject = Record<string, any>;
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const invalid = () => new ModelConfigError("SUPPLIER_TEXT_INVALID", "文字回复未完整返回，请稍后重试", 502);

/** Only answer blocks count as text; reasoning, image and tool fields never do. */
export function chatAnswerText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(value => {
    const part = object(value);
    if (part.type !== "text" && part.type !== "output_text") return "";
    return typeof part.text === "string" ? part.text : typeof object(part.text).value === "string" ? part.text.value : "";
  }).join("");
}

function appendContent(previous: unknown, fragment: unknown): unknown {
  if (fragment === undefined || fragment === null) return previous;
  if (typeof previous === "string" && typeof fragment === "string") return previous + fragment;
  if (previous === undefined || previous === null) return fragment;
  const parts = (value: unknown) => typeof value === "string" ? [{ type: "text", text: value }] : Array.isArray(value) ? value : [];
  return [...parts(previous), ...parts(fragment)];
}

/** Some compatible gateways return SSE even for stream:false. Consume that one
 * response, never repeat the request or treat private reasoning as the answer. */
export async function normalizeChatCompletionResponse(response: Response, streaming: boolean): Promise<Response> {
  if (streaming || !response.ok || !/text\/event-stream/i.test(response.headers.get("content-type") || "")) return response;
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const decoder = new TextDecoder(), choices = new Map<number, JsonObject>();
  let buffer = "", eventData: string[] = [], eventName = "", bytes = 0, done = false;
  const completion: JsonObject = { object: "chat.completion" };
  const event = () => {
    const raw = eventData.join("\n").trim(), name = eventName;
    eventData = []; eventName = "";
    if (name === "error") throw invalid();
    if (!raw) return;
    if (raw === "[DONE]") { done = true; return; }
    if (done) throw invalid();
    let data: JsonObject;
    try { data = object(JSON.parse(raw)); } catch { throw invalid(); }
    if (data.error) throw invalid();
    for (const key of ["id", "created", "model", "system_fingerprint", "service_tier", "usage"]) if (data[key] !== undefined && data[key] !== null) completion[key] = data[key];
    if (!Array.isArray(data.choices)) throw invalid();
    for (const rawChoice of data.choices) {
      const next = object(rawChoice), index = next.index ?? 0;
      if (!Number.isSafeInteger(index) || index < 0 || index > 127) throw invalid();
      let current = choices.get(index);
      if (!current) { current = { index, message: { role: "assistant", content: null }, finish_reason: null }; choices.set(index, current); }
      if (next.message && typeof next.message === "object") current.message = { ...next.message };
      const delta = object(next.delta), message = current.message;
      if (delta.role) message.role = delta.role;
      message.content = appendContent(message.content, delta.content);
      if (typeof delta.refusal === "string") message.refusal = (message.refusal || "") + delta.refusal;
      if (Array.isArray(delta.images)) message.images = [...(message.images || []), ...delta.images];
      if (Array.isArray(delta.tool_calls)) for (const rawTool of delta.tool_calls) {
        const tool = object(rawTool), toolIndex = tool.index ?? 0;
        if (!Number.isSafeInteger(toolIndex) || toolIndex < 0 || toolIndex > 127) throw invalid();
        const list = message.tool_calls ||= [], previous = list[toolIndex] ||= { id: "", type: "function", function: { name: "", arguments: "" } };
        if (typeof tool.id === "string") previous.id = tool.id;
        if (typeof tool.type === "string") previous.type = tool.type;
        for (const key of ["name", "arguments"]) if (typeof object(tool.function)[key] === "string") previous.function[key] += tool.function[key];
      }
      if (delta.function_call) {
        const call = message.function_call ||= { name: "", arguments: "" };
        for (const key of ["name", "arguments"]) if (typeof delta.function_call[key] === "string") call[key] += delta.function_call[key];
      }
      if (typeof next.finish_reason === "string") current.finish_reason = next.finish_reason;
      if (next.logprobs !== undefined) current.logprobs = next.logprobs;
    }
  };
  const line = (raw: string) => {
    const value = raw.replace(/\r$/, "");
    if (!value) { event(); return; }
    if (value.startsWith("data:")) eventData.push(value.slice(5).replace(/^ /, ""));
    else if (value.startsWith("event:")) eventName = value.slice(6).trim();
  };
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4 * 1024 * 1024) throw invalid();
      buffer += decoder.decode(part.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
    }
    buffer += decoder.decode();
    if (buffer) line(buffer);
    event();
    // A socket EOF is not a completion receipt. Some gateways omit [DONE] but
    // still emit a terminal finish_reason for every returned choice.
    if (!choices.size || !done && [...choices.values()].some(choice => !choice.finish_reason)) throw invalid();
    completion.choices = [...choices.values()].sort((a, b) => a.index - b.index);
    for (const choice of completion.choices) if (choice.message.tool_calls) choice.message.tool_calls = choice.message.tool_calls.filter(Boolean);
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length"); headers.delete("content-encoding");
    return new Response(JSON.stringify(completion), { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

/** Preserve every request byte, header and signal; only normalize the reply. */
export function chatCompletionResponseFetch(transport: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    if (method.toUpperCase() !== "POST" || !/\/chat\/completions\/?$/.test(new URL(url).pathname)) return transport(input, init);
    const request = new Request(input, init);
    if (!/application\/json/i.test(request.headers.get("content-type") || "")) return transport(request);
    const body = await request.clone().json().catch(() => null);
    return normalizeChatCompletionResponse(await transport(request), body?.stream === true);
  };
}
