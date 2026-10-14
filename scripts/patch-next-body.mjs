// Backport vercel/next.js#85418 for our pinned Next 15.5.27. Remove only after
// the installed CJS and ESM implementations both await body finalization.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function patchNextBody(root = "node_modules/next") {
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const paths = ["dist/server/next-server.js", "dist/esm/server/next-server.js"];
  const original = "requestData.body.finalize();";
  const corrected = "await requestData.body.finalize();";
  const changes = paths.map(relative => {
    const target = path.join(root, relative), source = fs.readFileSync(target, "utf8");
    if (source.split(corrected).length === 2 && source.split(original).length === 2) return { target, source, changed: false };
    if (version !== "15.5.27" || source.split(original).length !== 2 || !source.includes("if (hasRequestBody)")) {
      throw new Error(`Next ${version}: unexpected body-finalization implementation in ${relative}; review before building`);
    }
    return { target, source: source.replace(original, corrected), changed: true };
  });
  // Inspect both files before writing either; fail closed on dependency drift.
  for (const change of changes) if (change.changed) fs.writeFileSync(change.target, change.source);
  return changes.filter(change => change.changed).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Next body finalization: ${patchNextBody(process.argv[2])} files patched`);
}
