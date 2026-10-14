import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
const out=path.resolve(process.env.FLEET_DIST_DIR||'dist/fleet');
fs.mkdirSync(out,{recursive:true});
await build({entryPoints:{connector:'scripts/fleet-connector.ts',scheduler:'scripts/fleet-scheduler.ts'},outdir:out,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',alias:{'server-only':'./scripts/fleet-server-only.cjs','lucide-react':'./node_modules/lucide-react/dist/esm/lucide-react.js'},tsconfig:'tsconfig.json'});
for(const name of ['connector','scheduler'])if(fs.statSync(path.join(out,name+'.js')).size<1000)throw Error('Empty runtime');
console.log('FLEET_RUNTIME=BUILT CONNECTOR=1 SCHEDULER=1');
