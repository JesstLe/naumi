export type ReleaseText = { zh: string; en: string };
export type PublicReleaseNote = {
  version: string;
  title: ReleaseText;
  improvements: ReleaseText[];
  fixes: ReleaseText[];
};

// A secondary guard, not a substitute for a human public-content review.
// A generic public UI page name is not an account identifier. Keep all other
// identity/secret checks and the separate human-review requirement intact.
const internal = /(?:admin|后台|管理员|供应商|上游|采购|成本|密钥|凭据|账号|账户(?!页面)|邮箱|手机号|服务器|端口|容器|部署|蓝绿|回滚|分支|提交|数据库|内网|运维|模型|接口|worker|nginx|docker|ssh|api\b|token|secret|password|credential|provider|supplier|database|backend|deployment|rollback|internal|account(?! pages\b)|email|phone|hostname|upstream|gpt|glm|kimi|claude|gemini|deepseek|openai|imagegen|geeknow|tdh|replicate|qwen|midjourney|智谱|通义|千问|豆包|文心|\.pem\b|https?:|www\.|@[a-z0-9]|\b1[3-9]\d{9}\b|\b(?:[a-z0-9-]+\.)+(?:com|cn|net|org|top|local|test|internal|io)\b|[a-f0-9]{32,}|(?:\d{1,3}\.){3}\d{1,3}|[a-z]:[\\/]|[<>`])/i;
// Public announcements intentionally exclude video and related editing workflows.
const excludedFeature = /(?:视频|短片|成片|分镜|审片|剪辑|字幕|配音|转写|录音|多轨|\bvideo\b|storyboard|timecode|footage|narration|transcri|subtitles?|dubbing|multi[- ]?track|audio editing)/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid public release note");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).sort().join() !== [...expected].sort().join()) throw Error("Unexpected public release note fields");
}
function text(value: unknown, max: number): ReleaseText {
  const raw = record(value); keys(raw, ["zh", "en"]);
  for (const locale of ["zh", "en"] as const) {
    const value = raw[locale];
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f]/.test(value) || internal.test(value) || excludedFeature.test(value))
      throw Error("Public release note requires content review");
  }
  return { zh: raw.zh as string, en: raw.en as string };
}
export function validatePublicReleaseNotes(value: unknown): PublicReleaseNote[] {
  if (!Array.isArray(value) || value.length > 500) throw Error("Invalid public release history");
  const seen = new Set<string>();
  return value.map(entry => {
    const raw = record(entry); keys(raw, ["version", "title", "improvements", "fixes"]);
    if (typeof raw.version !== "string" || !/^[1-9]\d{8,10}$/.test(raw.version) || seen.has(raw.version)) throw Error("Invalid or duplicate release version");
    seen.add(raw.version);
    const list = (value: unknown) => {
      if (!Array.isArray(value) || value.length > 12) throw Error("Invalid public changes");
      return value.map(item => text(item, 220));
    };
    const improvements = list(raw.improvements), fixes = list(raw.fixes);
    if (!improvements.length && !fixes.length) throw Error("Release note has no public changes");
    return { version: raw.version, title: text(raw.title, 90), improvements, fixes };
  }).sort((a, b) => Number(b.version) - Number(a.version));
}

/** The running artifact is authoritative; future notes and unbuilt local drafts stay private. */
export function publicNotesForVersion(notes: PublicReleaseNote[], requested: string, running: string) {
  if (!/^[1-9]\d{8,10}$/.test(requested) || !/^[1-9]\d{8,10}$/.test(running)) return [];
  const ceiling = Math.min(Number(requested), Number(running));
  return notes.filter(note => Number(note.version) <= ceiling).slice(0, 100);
}
