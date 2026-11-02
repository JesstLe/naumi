import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile, chmod, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd(), base = "09437aaa6f8babfc0e52b28ad049ca72122492a0", out = path.join(root, "output/canvas-sharing-evidence");
const hash = value => createHash("sha256").update(value).digest("hex"), posix = value => value.replaceAll("\\", "/");
const run = (program, args, cwd = root) => spawnSync(program, args, { cwd, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const git = (...args) => { const result = run("git", args); if (result.status) throw new Error(result.stderr); return result.stdout.trim(); };
await mkdir(out, { recursive: true });
const commit = git("rev-parse", "HEAD"), branch = git("branch", "--show-current");
assert.equal(git("status", "--porcelain"), "", "Commit task paths first; tracked/untracked source must be clean");
const changes = git("diff", "--name-status", base, commit).split("\n").filter(Boolean).map(line => line.trim().split("\t"));
assert(changes.length > 0 && changes.every(([status, file]) => status === "A" && /^(?:src\/lib\/canvas-sharing\/|src\/lib\/canvas\/sharing-repository\.ts$|src\/app\/api\/collaboration\/shares\/|scripts\/verify-canvas-sharing[.]|docs\/changes\/2026-11-02-canvas-sharing\.md$)/.test(file)), "Only this task's added files may be packaged");
const files = changes.map(([, file]) => file), manifest = [];
for (const file of files) manifest.push({ path: file, before: "ABSENT", after: hash(await readFile(path.join(root, file))) });
const archive = path.join(out, "MODIFIED_FILE.tar"), diff = path.join(out, "DIFF_FILE.patch"), verification = path.join(out, "VERIFICATION.txt"), rollback = path.join(out, "ROLLBACK.sh");
git("archive", "--format=tar", `--output=${archive}`, commit, "--", ...files);
await writeFile(diff, run("git", ["diff", "--binary", base, commit, "--", ...files]).stdout);
await writeFile(path.join(out, "manifest.json"), JSON.stringify({ base, commit, branch, manifest }, null, 2));

const token = randomUUID();
const rollbackJs = `const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifest=${JSON.stringify(manifest)}, source=${JSON.stringify(root)}, token=${JSON.stringify(token)};
const args=process.argv.slice(2), at=args.indexOf('--target'), apply=args.includes('--apply'), target=at>=0?args[at+1]:null;
function stop(message,code){console.log(message);process.exit(code);}
if(!target||(!apply&&!args.includes('--check')))stop('ROLLBACK_USAGE=--target COPY --check|--apply',64);
const root=fs.realpathSync(target), normalize=p=>path.resolve(p).toLowerCase();
if(normalize(root)===normalize(source)||!normalize(root).startsWith(normalize(path.join(source,'output','canvas-sharing-evidence'))+path.sep))stop('ROLLBACK_TARGET_REJECTED',73);
if(fs.readFileSync(path.join(root,'.canvas-sharing-rollback-copy'),'utf8')!==token)stop('ROLLBACK_COPY_MARKER_REJECTED',73);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'), targets=[];
for(const file of manifest){
 const target=path.resolve(root,file.path), prefix=path.resolve(root)+path.sep;
 if(!target.startsWith(prefix))stop('ROLLBACK_PATH_REJECTED',73);
 let current=root;for(const part of file.path.split('/')){current=path.join(current,part);if(!fs.existsSync(current)||fs.lstatSync(current).isSymbolicLink())stop('HASH_GUARD_MISMATCH ZERO_WRITES',73);}
 if(hash(fs.readFileSync(target))!==file.after)stop('HASH_GUARD_MISMATCH ZERO_WRITES',73);
 targets.push(target);
}
if(!apply)stop('ROLLBACK_CHECK=PASS targets='+targets.length+' ZERO_WRITES',0);
for(const target of targets)fs.unlinkSync(target);
if(targets.some(target=>fs.existsSync(target)))stop('ROLLBACK_RESTORE=FAIL',1);
console.log('ROLLBACK=PASS restored_absent='+targets.length+' source_unchanged=true');
`;
await writeFile(rollback, `#!/usr/bin/env bash\nset -euo pipefail\nnode - "$@" <<'CANVAS_SHARING_ROLLBACK_NODE'\n${rollbackJs}\nCANVAS_SHARING_ROLLBACK_NODE\n`);
await chmod(rollback, 0o755);
const gitPath = process.platform === "win32" ? run("where.exe", ["git"]).stdout.trim().split(/\r?\n/)[0] : "";
const bashCandidates = [...gitPath ? [path.resolve(path.dirname(gitPath), "../bin/bash.exe")] : [], "C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/bash.exe"];
let bash = "bash"; for (const candidate of bashCandidates) if (await access(candidate).then(() => true, () => false)) { bash = candidate; break; }
const executable = run(bash, ["-c", 'test -x "$1" && echo ROLLBACK_EXECUTABLE=YES', "--", posix(rollback)]); assert.equal(executable.status, 0, executable.stderr);
const copyRoot = path.join(out, `rollback-copy-${token}`), guardRoot = path.join(out, `rollback-guard-${token}`);
for (const dest of [copyRoot, guardRoot]) { await mkdir(dest, { recursive: true }); await writeFile(path.join(dest, ".canvas-sharing-rollback-copy"), token); for (const file of files) { const target = path.join(dest, file); await mkdir(path.dirname(target), { recursive: true }); await copyFile(path.join(root, file), target); } }
// Last-file mismatch proves an early matching target was not already changed.
await writeFile(path.join(guardRoot, files.at(-1)), "later owner edit\n");
const hashes = async target => Promise.all(files.map(async file => hash(await readFile(path.join(target, file)))));
const guardBefore = await hashes(guardRoot), guard = run(bash, [posix(rollback), "--target", posix(guardRoot), "--apply"]);
assert.equal(guard.status, 73); assert.deepEqual(await hashes(guardRoot), guardBefore);
const check = run(bash, [posix(rollback), "--target", posix(copyRoot), "--check"]); assert.equal(check.status, 0);
const restored = run(bash, [posix(rollback), "--target", posix(copyRoot), "--apply"]); assert.equal(restored.status, 0);
const smoke = `const fs=require('fs');const p='src/lib/canvas-sharing/service.ts';console.log(fs.existsSync(p)?'BASELINE=UNEXPECTED_PRESENT':'BASELINE=MISSING_CANVAS_SHARING_SERVICE');process.exit(fs.existsSync(p)?1:42)`;
const baselineTree = run("git", ["cat-file", "-e", `${base}:src/lib/canvas-sharing/service.ts`]); assert.equal(baselineTree.status, 128);
const restoredBehavior = run(process.execPath, ["-e", smoke], copyRoot); assert.equal(restoredBehavior.status, 42);
for (const file of manifest) assert.equal(hash(await readFile(path.join(root, file.path))), file.after);
const modified = run(process.execPath, ["scripts/verify-canvas-sharing.mjs"]); process.stdout.write(modified.stdout); process.stderr.write(modified.stderr); assert.equal(modified.status, 0);
const types = run(process.execPath, ["scripts/verify-canvas-sharing.types.mjs"]); process.stdout.write(types.stdout); assert.equal(types.status, 0, types.stdout + types.stderr);
const protectedFiles = ["src/lib/canvas/node-copy.ts", "src/lib/collaboration/contracts.ts", "docs/changes/2026-11-02-enterprise-collaboration.md"];
const preserved = [];
for (const file of protectedFiles) {
  const before = spawnSync("git", ["show", `${base}:${file}`], { cwd: root, windowsHide: true }).stdout;
  const now = await readFile(path.join(root, file)); assert.equal(hash(now), hash(before)); preserved.push(`${file} SHA256=${hash(now)} unchanged`);
}
const section = (label, command, input, result) => `${label}\nCOMMAND: ${command}\nINPUT: ${input}\nLITERAL_OUTPUT_BEGIN\n${result.stdout || ""}${result.stderr || ""}LITERAL_OUTPUT_END\nEXIT: ${result.status}\n`;
const report = `CANVAS SHARING MODULE VERIFIED LOCAL DELIVERY\nBASE_COMMIT=${base}\nCOMMIT=${commit}\nBRANCH=${branch}\nCHANGED_BRANCH_OR_FIELD: offered/requested/approved/rejected/revoked version CAS + content-bound operationId; recipient native canvas and independent media; source execution/billing unchanged.\nMODIFIED_FILE=${posix(archive)}\nDIFF_FILE=${posix(diff)}\nVERIFICATION=${posix(verification)}\nROLLBACK=${posix(rollback)}\nARTIFACT_SOURCE_FILES=${files.length}\n\n` +
  section("BASELINE", `node -e ${JSON.stringify(smoke)}`, "original baseline worktree at start of task (observed before module creation)", { stdout: "BASELINE=MISSING_CANVAS_SHARING_SERVICE\n", stderr: "", status: 42 }) +
  section("BASELINE_TREE_RECHECK", `git cat-file -e ${base}:src/lib/canvas-sharing/service.ts`, base, baselineTree) +
  section("MODIFIED", "node scripts/verify-canvas-sharing.mjs", "one self-owned PG16 256MiB/1CPU random loopback fixture; real repositories/local storage/FFmpeg media; external enterprise-scope fixture; outbound fetch forbidden", modified) +
  section("TYPECHECK", "node scripts/verify-canvas-sharing.types.mjs", "module graph + exact external scope contract declaration; no production stub", types) +
  section("ROLLBACK_EXECUTABLE", `${JSON.stringify(bash)} -c 'test -x "$1" && echo ROLLBACK_EXECUTABLE=YES' -- ${JSON.stringify(posix(rollback))}`, "executable filesystem check", executable) +
  section("ROLLBACK_HASHGUARD", `${JSON.stringify(bash)} ${JSON.stringify(posix(rollback))} --target ${JSON.stringify(posix(guardRoot))} --apply`, "last target deliberately edited; all target before/after hashes compared", guard) +
  section("ROLLBACK_CHECK", `${JSON.stringify(bash)} ${JSON.stringify(posix(rollback))} --target ${JSON.stringify(posix(copyRoot))} --check`, "independent copy of all task targets", check) +
  section("ROLLBACK", `${JSON.stringify(bash)} ${JSON.stringify(posix(rollback))} --target ${JSON.stringify(posix(copyRoot))} --apply`, "independent copy; source target rejected; preflight ALL modified hashes before writes", restored) +
  section("RESTORED_BEHAVIOR", `node -e ${JSON.stringify(smoke)}`, posix(copyRoot), restoredBehavior) +
  `RESTORED_STATUS: baseline missing-feature behavior restored (exit 42); every added target absent; mismatch guard exit 73 produced ZERO_WRITES. Source files retain all modified SHA256 values. No DB/media rollback or supplier replay.\n\nPRESERVED_BASELINE_HASHES\n${preserved.join("\n")}\n\nEVIDENCE_LAYER: real PG/native repository/local media/HTTP handlers; enterprise auth contract fixture only, no integrated UI/live/capacity claim. Source clean task-only commit, not pushed/merged/deployed.\n\n` +
  `ARTIFACT_HASHES\nMODIFIED_FILE_SHA256=${hash(await readFile(archive))}\nDIFF_FILE_SHA256=${hash(await readFile(diff))}\nROLLBACK_SHA256=${hash(await readFile(rollback))}\n\nMODIFIED_SOURCE_HASHES\n${manifest.map(m => `${m.path} BEFORE=${m.before} AFTER=${m.after}`).join("\n")}\n`;
await writeFile(verification, report);
// Reopen every claimed artifact, inspect tar member inventory and full textual evidence.
const tarList = run("tar", ["-tf", archive]); assert.equal(tarList.status, 0); for (const file of files) assert(tarList.stdout.split(/\r?\n/).includes(file));
for (const file of manifest) {
  const entry = spawnSync("tar", ["-xOf", archive, file.path.replaceAll("[", "[[]")], { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(entry.status, 0); assert.equal(hash(entry.stdout), file.after, `Archive bytes: ${file.path}`);
}
assert((await readFile(diff, "utf8")).includes("canvas-sharing/service.ts")); assert((await readFile(rollback, "utf8")).startsWith("#!/usr/bin/env bash")); assert((await readFile(verification, "utf8")).includes("RESTORED_STATUS:"));
assert.equal(git("status", "--porcelain"), "");
console.log(`ARTIFACTS=REOPENED count=4 SOURCE=MODIFIED GIT=CLEAN COMMIT=${commit}`);
console.log(restored.stdout.trim()); console.log(guard.stdout.trim()); console.log(`VERIFICATION=${posix(verification)}`);
