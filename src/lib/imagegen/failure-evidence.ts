/** Internal diagnostic scalars only. Never include messages, stack strings,
 * prompts, credentials or supplier URLs in a customer-visible job snapshot. */
export function imageFailureEvidence(error: unknown) {
  const names = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError", "APIConnectionError", "APIConnectionTimeoutError", "ModelConfigError", "ImageOperationPending", "ImageOperationDeferred"]);
  const codes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ERR_INVALID_STATE", "ERR_INVALID_ARG_TYPE", "ERR_STREAM_PREMATURE_CLOSE", "ABORT_ERR", "ERR_BUFFER_TOO_LARGE"]);
  const causes: { name: string; code?: string; kind: string }[] = [];
  const seen = new Set<object>();
  try {
    let current = error;
    while (current && typeof current === "object" && !seen.has(current) && causes.length < 4) {
      seen.add(current);
      const value = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
      const name = typeof value.name === "string" && names.has(value.name) ? value.name : "Error";
      const code = typeof value.code === "string" && codes.has(value.code) ? value.code : undefined;
      const message = typeof value.message === "string" ? value.message.slice(0, 2048) : "";
      const kind = /maximum call stack|too much recursion/i.test(message) ? "stack-limit"
        : /body.*(used|consum|locked)|unusable|invalid state/i.test(message) ? "body-state"
        : /receipt too large|buffer.*large/i.test(message) ? "body-size"
        : /JSON|unexpected token|unexpected end/i.test(message) ? "json"
        : /supplier-image-invalid-output/.test(message) ? "image-decode"
        : /supplier-image-size-invalid/.test(message) ? "image-size"
        : /supplier-image-missing/.test(message) ? "image-missing"
        : /supplier-image-download-failed/.test(message) ? "image-download"
        : name === "TimeoutError" || /timed out|timeout/i.test(message) ? "timeout" : "unclassified";
      causes.push({ name, ...(code ? { code } : {}), kind });
      current = value.cause;
    }
  } catch { /* Diagnostic access must never replace the original exception. */ }
  return { causes };
}

/** Server diagnostics only: retain source frames, never the exception message,
 * request URL, data URL, prompt, or arguments that V8 may put in the first line. */
export function imageFailureFrames(error: unknown): string[] {
  try {
    if (!(error instanceof Error) || typeof error.stack !== "string") return [];
    return error.stack.split("\n").slice(1, 17).flatMap(line => {
      const frame = line.match(/(?:\/app\/\.next\/server\/|\/app\/src\/)[A-Za-z0-9_./-]+:\d+:\d+/);
      if (frame) return [frame[0]];
      const native = line.match(/^\s*at (RegExp\.(?:exec|test)|String\.(?:repeat|match)|Function\.from|Buffer\.from|new (?:Array|Uint8Array))\b/);
      return native ? [native[1]] : [];
    }).slice(0, 8);
  } catch { return []; }
}
