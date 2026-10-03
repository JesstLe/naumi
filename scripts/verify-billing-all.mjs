import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||new URL(process.env.DATABASE_URL||"http://invalid").hostname!=="127.0.0.1")throw new Error("Requires isolated local PostgreSQL");
mkdirSync("output/billing-20261003",{recursive:true});
for(const name of ["baseline","rules","config","wallet","api","image-jobs","tools","async-tasks","entitlements","agent","facts","reconciliation","cost-audit","intents","coverage","canvas-extra","review","performance"]){
 const result=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","--conditions","react-server",`scripts/verify-billing-${name}.ts`],{stdio:"inherit",env:process.env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
