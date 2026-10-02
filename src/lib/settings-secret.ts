import "server-only";

const PLACEHOLDERS = new Set(["naumi-insecure-default", "change-me-to-a-long-random-string", "change-me", "changeme"]);

/** Never issue sessions or encrypt configuration with a public fallback. */
export function settingsSecret(): string {
  const value = process.env.SETTINGS_SECRET || "";
  if (value.trim().length < 32 || PLACEHOLDERS.has(value.trim().toLowerCase())) {
    throw new Error("SETTINGS_SECRET 必须配置为至少 32 字符的独立随机密钥，不能使用默认值");
  }
  return value;
}

export function workerSecret(): string {
  const value=process.env.VIDEO_WORKER_SECRET || "";
  if(value.trim().length<32 || value.trim()==="change-video-worker-secret") throw new Error("VIDEO_WORKER_SECRET 必须配置为至少 32 字符的独立随机密钥");
  return value;
}
