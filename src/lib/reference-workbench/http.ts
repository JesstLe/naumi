/** Parse API errors without showing JSON, HTML gateway pages or parser internals. */
export async function workbenchErrorText(response: Response, fallback = "操作失败，请稍后再试") {
  let data: any;
  try { data = JSON.parse(await response.text()); } catch { /* gateway/non-JSON */ }
  const message = data && typeof data === "object" && !Array.isArray(data) && typeof data.error === "string"
    && data.error.trim() && data.error.length <= 600 && !/[<>\u0000-\u001f]/.test(data.error)
    && !/^[\s]*[\[{]/.test(data.error) ? data.error.trim() : `${fallback}（HTTP ${response.status}）`;
  const trace = typeof data?.traceId === "string" && /^wb-[a-f0-9]{16}$/.test(data.traceId) ? `\n错误编号：${data.traceId}` : "";
  return message + trace;
}
