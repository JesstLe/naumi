import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PELICAN_ARTIFACT_URL = "/api/agent/artifacts/pelican-cycling";
/** Fixed, reviewed repository asset. User input never selects a filesystem path. */
export function readPelicanArtifact(): string {
  return readFileSync(path.join(process.cwd(), "public/agent-artifacts/pelican-cycling.html"), "utf8");
}
