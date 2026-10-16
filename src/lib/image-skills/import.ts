/** Imported packages are inert workflow data. No extraction, scripts, YAML evaluation or network access. */
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { SkillError, validateSkillDraft } from "./catalog";

export const SKILL_IMPORT_MAX_BYTES = 512 * 1024;
export const SKILL_IMPORT_MAX_REQUEST_BYTES = SKILL_IMPORT_MAX_BYTES + 16 * 1024;
const MAX_ENTRIES = 64, MAX_FILE_BYTES = 64 * 1024, MAX_EXPANDED_BYTES = 256 * 1024;
export type SkillDefinition = ReturnType<typeof validateSkillDraft>;
export type ParsedSkillImport = { definition: SkillDefinition; warnings: string[] };
function invalid(message: string, status = 400): never { throw new SkillError(message, status); }
const utf8 = (bytes: Uint8Array) => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { return invalid("技能文件必须是 UTF-8 文本"); }
};
function textFile(bytes: Uint8Array) {
  const text = utf8(bytes);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) invalid("技能包包含二进制或不支持的文本内容");
  return text.replace(/\r\n?/g, "\n");
}
export function skillDefinitionHash(input: unknown) {
  // Explicit key order and validated/trimmed fields make JSON formatting and ignored owner fields irrelevant.
  return createHash("sha256").update(JSON.stringify(validateSkillDraft(input))).digest("hex");
}
function scalar(raw: string) {
  const value = raw.trim();
  if (value.startsWith('"')) { try { const parsed = JSON.parse(value); if (typeof parsed === "string") return parsed; } catch {} invalid("Skill 元数据字符串格式不正确"); }
  if (value.startsWith("'")) { if (!value.endsWith("'")) invalid("Skill 元数据字符串格式不正确"); return value.slice(1, -1).replace(/''/g, "'"); }
  if (/^[!&*[{]/.test(value)) invalid("Skill 元数据只支持普通文本，不支持 YAML 标签或引用");
  return value.replace(/\s+#.*$/, "");
}
function markdownDefinition(skill: string, references: [string, string][] = [], agentMetadata = ""): SkillDefinition {
  const match = skill.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) invalid("Markdown Skill 需要 YAML frontmatter 中的 name 和 description");
  const metadata: Record<string, string> = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim() || /^\s*#/.test(lines[i])) continue;
    const field = lines[i].match(/^([a-z_][a-z0-9_-]*):\s*(.*)$/i);
    if (!field) invalid("Skill frontmatter 格式不正确");
    if (Object.hasOwn(metadata, field[1])) invalid("Skill 元数据字段重复");
    let value = field[2];
    if (/^[>|][-+]?$/.test(value)) {
      const parts: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || !lines[i + 1].trim())) parts.push(lines[++i].trim());
      value = parts.join(value.startsWith(">") ? " " : "\n");
    } else value = scalar(value);
    metadata[field[1]] = value;
  }
  if (!metadata.name?.trim() || !metadata.description?.trim()) invalid("Skill 缺少 name 或 description");
  const display = agentMetadata.match(/^\s+display_name:\s*(.+)$/m);
  const name = display ? scalar(display[1]) : skill.slice(match[0].length).match(/^#\s+(.+)$/m)?.[1] || metadata.name;
  const instructions = [skill, ...references.map(([path, content]) => `\n\n---\n参考文件：${path}\n\n${content}`)].join("");
  if (instructions.trim().length > 6000) invalid("Skill 与参考资料合计超过 6000 字符，请精简文件后重试；内容未被截断", 413);
  return validateSkillDraft({ name, description: metadata.description, category: metadata.category || "创作", instructions });
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function safePath(path: string) {
  if (!path || path.length > 240 || path.includes("\\") || /[\u0000-\u001f\u007f:]/.test(path) || path.startsWith("/") || path.split("/").some(part => part === "." || part === ".." || /[. ]$/.test(part))) invalid("ZIP 包含不安全的文件路径");
  if (path.split("/").slice(0, -1).some(part => !part)) invalid("ZIP 包含不安全的文件路径");
  return path.normalize("NFC");
}
function readZip(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) invalid("ZIP 文件损坏或格式不支持");
  const count = bytes.readUInt16LE(end + 10), centralBytes = bytes.readUInt32LE(end + 12), centralStart = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || count === 65535 || centralStart + centralBytes !== end) invalid("不支持分卷、ZIP64 或损坏的 ZIP");
  if (!count || count > MAX_ENTRIES) invalid(`ZIP 最多支持 ${MAX_ENTRIES} 个条目`, 413);
  const files = new Map<string, string>(), seen = new Set<string>(), ranges: [number, number][] = [], warnings: string[] = [];
  let offset = centralStart, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) invalid("ZIP 目录损坏");
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16), packed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
    const nameSize = bytes.readUInt16LE(offset + 28), extraSize = bytes.readUInt16LE(offset + 30), commentSize = bytes.readUInt16LE(offset + 32), attrs = bytes.readUInt32LE(offset + 38), local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameSize + extraSize + commentSize;
    if (next > end || bytes.readUInt16LE(offset + 34)) invalid("ZIP 目录损坏");
    const path = safePath(utf8(bytes.subarray(offset + 46, offset + 46 + nameSize))), key = path.toLowerCase();
    if (seen.has(key)) invalid("ZIP 包含重复文件路径"); seen.add(key);
    const mode = attrs >>> 16, fileType = mode & 0xf000;
    if ((flags & ~0x080e) || ![0, 8].includes(method)) invalid("不支持加密或特殊压缩的 ZIP");
    if ((fileType && fileType !== 0x8000 && fileType !== 0x4000) || (mode & 0o111 && fileType !== 0x4000)) invalid("ZIP 不支持符号链接、特殊文件或可执行文件");
    expanded += size;
    if (size > MAX_FILE_BYTES || expanded > MAX_EXPANDED_BYTES || size > Math.max(packed, 1) * 100) invalid("ZIP 解压体积或压缩率超出限制", 413);
    if (local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50) invalid("ZIP 文件头损坏");
    const localNameSize = bytes.readUInt16LE(local + 26), localExtraSize = bytes.readUInt16LE(local + 28), start = local + 30 + localNameSize + localExtraSize, stop = start + packed;
    if (stop > centralStart || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || safePath(utf8(bytes.subarray(local + 30, local + 30 + localNameSize))) !== path) invalid("ZIP 文件头与目录不一致");
    if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== packed || bytes.readUInt32LE(local + 22) !== size)) invalid("ZIP 文件头声明与目录不一致");
    if (ranges.some(([a, b]) => local < b && stop > a)) invalid("ZIP 文件数据重叠"); ranges.push([local, stop]);
    let raw: Buffer;
    try { raw = method === 0 ? bytes.subarray(start, stop) : inflateRawSync(bytes.subarray(start, stop), { maxOutputLength: Math.min(size + 1, MAX_FILE_BYTES + 1) }); }
    catch { return invalid("ZIP 解压失败或内容超过声明大小"); }
    if (raw.length !== size || crc32(raw) !== crc) invalid("ZIP 文件内容校验失败");
    if (path.split("/").includes("__MACOSX") || path.split("/").at(-1) === ".DS_Store") { warnings.push("已忽略 macOS 系统元数据"); }
    else if (!path.endsWith("/")) files.set(path, textFile(raw));
    offset = next;
  }
  if (offset !== end) invalid("ZIP 目录大小不一致");
  const roots = [...files.keys()].filter(path => path === "SKILL.md" || path.endsWith("/SKILL.md"));
  if (roots.length !== 1) invalid("ZIP 必须且只能包含一个 Skill 根目录与 SKILL.md");
  const skillPath = roots[0], root = skillPath.slice(0, -"SKILL.md".length), references: [string, string][] = [];
  let agents = "";
  for (const [path, content] of files) {
    if (!path.startsWith(root)) invalid("ZIP 包含 Skill 根目录以外的文件");
    const relative = path.slice(root.length);
    if (relative === "SKILL.md") continue;
    if (relative === "agents/openai.yaml") { agents = content; continue; }
    if (/^references\/(?:[^/]+\/)*[^/]+\.md$/.test(relative)) { references.push([relative, content]); continue; }
    invalid("ZIP 仅支持 SKILL.md、references/*.md 与 agents/openai.yaml，不支持脚本或其他文件");
  }
  references.sort(([a], [b]) => a.localeCompare(b, "en"));
  return { definition: markdownDefinition(files.get(skillPath)!, references, agents), warnings: [...new Set(warnings)] };
}
export function parseSkillImport(fileName: string, input: Uint8Array): ParsedSkillImport {
  if (!input.byteLength) invalid("技能文件为空");
  if (input.byteLength > SKILL_IMPORT_MAX_BYTES) invalid("技能文件不超过 512KB", 413);
  const extension = fileName.toLowerCase().match(/\.(md|zip|json)$/)?.[1];
  if (!extension) invalid("请选择 .md、.zip 或 Naumi Skill .json 文件");
  if (extension === "zip") return readZip(Buffer.from(input));
  const text = textFile(input);
  if (extension === "md") return { definition: markdownDefinition(text), warnings: [] };
  let body: any; try { body = JSON.parse(text); } catch { return invalid("Skill JSON 格式不正确"); }
  if (body?.format !== "naumi-image-skill" || body?.version !== 1) invalid("请选择 Naumi 导出的 version 1 Skill JSON 文件");
  return { definition: validateSkillDraft(body.definition), warnings: [] };
}
