/** Bounded diagnostic categories only. Never persist supplier messages, HTML,
 * request bodies, credentials, signed URLs or inferred payment outcomes. */
export function supplierFailureEvidence(status: number, body: unknown, error?: unknown) {
  if (status >= 200 && status < 400 && !error) return {};
  const b = body && typeof body === "object" ? body as Record<string, any> : {};
  const e = error && typeof error === "object" ? error as Record<string, any> : {};
  const receipt = b.error && typeof b.error === "object" ? b.error : b;
  const text = [receipt.code, receipt.type, receipt.message, typeof b.error === "string" ? b.error : ""]
    .filter(value => typeof value === "string").map(value => value.slice(0, 2048)).join(" ").toLowerCase();
  let failureCategory = "upstream-rejected";
  if (/insufficient[_ -]?(?:quota|fund|balance)|quota[_ -]?(?:exceeded|exhausted)|余额不足|额度不足/.test(text)) failureCategory = "quota";
  else if (/invalid[_ -]?(?:api[_ -]?)?key|authentication|unauthorized|无效.*密钥/.test(text)) failureCategory = "credential";
  else if (/model[_ -]?(?:not[_ -]?found|not[_ -]?allowed)|model.*permission|模型.*权限/.test(text)) failureCategory = "model-permission";
  else if (/content[_ -]?policy|moderation|safety|内容.*审核/.test(text)) failureCategory = "content-policy";
  else if (status === 429) failureCategory = "rate-limit";
  else if (status === 401 || status === 403) failureCategory = "authorization-or-edge";
  else if (status >= 500) failureCategory = "upstream-unavailable";
  const code = [e.code, e.cause?.code, e.errors?.[0]?.code].find(value => typeof value === "string" &&
    ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(value));
  return error ? { failureCategory: "transport", ...(code ? { transportCode: code } : {}) } : { failureCategory };
}
