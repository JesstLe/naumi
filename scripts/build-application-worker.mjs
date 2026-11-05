import fs from 'node:fs';
import path from 'node:path';
import {isBuiltin} from 'node:module';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const out=path.resolve(process.env.APPLICATION_WORKER_DIST||'dist/worker');
fs.mkdirSync(out,{recursive:true});
const result=await build({entryPoints:['src/lib/worker/application.ts'],outfile:path.join(out,'application.cjs'),bundle:true,metafile:true,
 platform:'node',target:'node24',format:'cjs',external:['pg','sharp'],alias:{'server-only':path.resolve('scripts/fleet-server-only.cjs')},tsconfig:'tsconfig.json'});
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const imports=[...new Set(Object.values(result.metafile.outputs).flatMap(output=>output.imports.filter(row=>row.external&&!isBuiltin(row.path)).map(row=>row.path)))].sort();
const packageName=name=>name.startsWith('@')?name.split('/').slice(0,2).join('/'):name.split('/')[0];
const dependencies=Object.fromEntries([...new Set(imports.map(packageName))].map(name=>{
 const version=lock.packages['node_modules/'+name]?.version;if(!version)throw Error('Unpinned Worker dependency: '+name);return [name,version];
}));
const source=Object.fromEntries(Object.keys(result.metafile.inputs).map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const bundle=fs.readFileSync(path.join(out,'application.cjs'));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schema:1,node:'24',entry:'application.cjs',sha256:createHash('sha256').update(bundle).digest('hex'),bytes:bundle.length,imports,dependencies,source},null,2)+'\n');
console.log('APPLICATION_WORKER_BUILD=PASS INPUTS='+Object.keys(source).length+' PACKAGES='+Object.keys(dependencies).length+' BYTES='+bundle.length+' HTTP_ROUTE_INPUTS='+Object.keys(source).filter(f=>f.startsWith('src/app/')).length);
