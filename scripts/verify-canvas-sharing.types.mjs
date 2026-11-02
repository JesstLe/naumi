import { mkdir, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const out = path.resolve("output/canvas-sharing-evidence"); await mkdir(out, { recursive: true });
const real = await access("src/lib/enterprise/collaboration-access.ts").then(() => true, () => false);
const contract = `declare module '*enterprise/collaboration-access' {
  export type CollaborationScope={enterpriseId:string;actorId:string;ownerId:string;memberIds:ReadonlySet<string>};
  export function withCollaborationScope<T>(email:string,enterpriseId:string,run:(tx:import('pg').PoolClient,scope:CollaborationScope)=>Promise<T>):Promise<T>;
  export function authorizeCollaborationRequest(request:Request):Promise<{email:string}|Response>;
  export function collaborationFailure(error:unknown):Response;
}\n`;
await writeFile(path.join(out, "scope-contract.d.ts"), contract);
await writeFile(path.join(out, "tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { incremental: false }, include: [
  "../../src/lib/canvas-sharing/**/*.ts", "../../src/lib/canvas/sharing-repository.ts", "../../src/app/api/collaboration/shares/**/*.ts", "../../scripts/verify-canvas-sharing*.ts", ...real ? [] : ["scope-contract.d.ts"],
], exclude: ["../../node_modules"] }, null, 2));
const run = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--project", "output/canvas-sharing-evidence/tsconfig.json", "--pretty", "false"], { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const result = `${run.stdout || ""}${run.stderr || ""}TYPECHECK=${run.status === 0 ? "PASS" : "FAIL"} enterprise_scope=${real ? "real_module" : "external_contract_declaration"} EXIT=${run.status}\n`;
process.stdout.write(result); await writeFile(path.join(out, "typecheck.txt"), result); process.exitCode = run.status ?? 1;
