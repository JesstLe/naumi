import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PELICAN_ARTIFACT_URL = "/api/agent/artifacts/pelican-cycling";
/** Fixed, reviewed repository asset. User input never selects a filesystem path. */
export function readPelicanArtifact(): string {
  return readFileSync(path.join(process.cwd(), "public/agent-artifacts/pelican-cycling.html"), "utf8");
}
export function pelicanArtifactReply(sourceRequested = false): string {
  if (sourceRequested) return `\`\`\`html\n${readPelicanArtifact()}\n\`\`\``;
  return `鹈鹕骑行动画：[打开预览](${PELICAN_ARTIFACT_URL}) · [下载 HTML](${PELICAN_ARTIFACT_URL}?download=1)\n\n支持暂停、重播和速度调整。`;
}
