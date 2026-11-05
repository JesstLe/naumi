/** Verify resolution from the packaged directory, never fall through to the
 * developer's parent node_modules and mistake that for a standalone dependency. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const root=path.resolve(process.argv[2]||'.next/standalone'),bundleRoot=path.resolve(process.argv[3]||'dist/worker');
const manifest=JSON.parse(fs.readFileSync(path.join(bundleRoot,'manifest.json'),'utf8'));
if(createHash('sha256').update(fs.readFileSync(path.join(bundleRoot,manifest.entry))).digest('hex')!==manifest.sha256)throw Error('WORKER_BUNDLE_HASH_MISMATCH');
const require=createRequire(path.join(root,'worker-package-check.cjs')),realRoot=fs.realpathSync(root);
for(const spec of manifest.imports){
 const resolved=fs.realpathSync(require.resolve(spec)),relative=path.relative(realRoot,resolved);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('WORKER_DEPENDENCY_OUTSIDE_PACKAGE: '+spec);
 const name=spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0];
 let dir=path.dirname(resolved),matched=false;
 while(path.relative(realRoot,dir)&&!path.relative(realRoot,dir).startsWith('..')){
  const file=path.join(dir,'package.json');if(fs.existsSync(file)){const p=JSON.parse(fs.readFileSync(file,'utf8'));if(p.name===name){if(p.version!==manifest.dependencies[name])throw Error('WORKER_DEPENDENCY_VERSION_DRIFT: '+name);matched=true;break;}}
  dir=path.dirname(dir);
 }
 if(!matched)throw Error('WORKER_DEPENDENCY_METADATA_MISSING: '+spec);
}
console.log('APPLICATION_WORKER_PACKAGE=PASS IMPORTS='+manifest.imports.length+' PACKAGES='+Object.keys(manifest.dependencies).length+' BUNDLE_SHA256='+manifest.sha256+' PARENT_DEPENDENCIES=0');
