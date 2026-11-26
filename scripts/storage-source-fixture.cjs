/** Load actual storage source owners with explicit fixture I/O dependencies.
 * Resolves relative aliases after ownership moves; never projects function bodies. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function loadStorageSource(file,dependencies={}){
 const entry=path.resolve(file),base=path.dirname(entry),root=path.resolve(base,'../..'),cache=new Map(),overrides=new Map();
 const resolve=(from,spec)=>spec.startsWith('@/')?path.resolve(root,'src',spec.slice(2))+'.ts':spec.startsWith('.')?path.resolve(path.dirname(from),spec)+'.ts':spec;
 for(const [spec,value] of Object.entries(dependencies))overrides.set(resolve(entry,spec),value);
 function load(filename){if(overrides.has(filename))return overrides.get(filename);if(cache.has(filename))return cache.get(filename).exports;
  const loaded={exports:{}};cache.set(filename,loaded);const source=fs.readFileSync(filename,'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const localRequire=spec=>{if(spec==='server-only')return {};const target=resolve(filename,spec);if(overrides.has(target))return overrides.get(target);return target.endsWith('.ts')?load(target):require(spec);};
  vm.runInNewContext(compiled,{module:loaded,exports:loaded.exports,require:localRequire,Buffer,Response,Request,Headers,AbortController,AbortSignal,URL,process,console,fetch,setTimeout,clearTimeout},{filename});return loaded.exports;
 }
 return load(entry);
}
module.exports={loadStorageSource};
