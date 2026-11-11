import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateModelConfig} from '../src/lib/model-config/schema';
const [mode,beforePath,configPath,manifestPath]=process.argv.slice(2);
assert.ok(['BASELINE','MODIFIED','ROLLBACK'].includes(mode));
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const before=read(beforePath),config=read(configPath),manifest=read(manifestPath);
const trustedOrigins=[...new Set(before.providers.map((p:any)=>new URL(p.baseUrl).origin))] as string[];
validateModelConfig(before,{trustedOrigins});validateModelConfig(config,{trustedOrigins});
const ids=new Set(manifest.models.map((m:any)=>m.upstream.id));
if(mode==='MODIFIED'){
 const expected=structuredClone(before);expected.upstreamModels.push(...manifest.models.map((m:any)=>m.upstream));assert.deepEqual(config,expected);
 assert.equal(config.upstreamModels.filter((u:any)=>ids.has(u.id)).length,5);
 assert.ok(config.upstreamModels.filter((u:any)=>ids.has(u.id)).every((u:any)=>u.enabled===false&&u.capabilities.verified===false));
 console.log('APIB_IMAGE26_CONFIG=PASS MODE=MODIFIED NEW_MODELS=5 ENABLED=0 OLD_CONFIG=UNCHANGED SCHEMA=ACTUAL EXIT=0');
}else{
 assert.deepEqual(config,before);assert.equal(config.upstreamModels.filter((u:any)=>ids.has(u.id)).length,0);
 const exit=mode==='BASELINE'?1:0;
 console.log(`APIB_IMAGE26_CONFIG=${mode==='BASELINE'?'NOT_PREPARED':'RESTORED'} MODE=${mode} NEW_MODELS=0 OLD_CONFIG=UNCHANGED SCHEMA=ACTUAL EXIT=${exit}`);
 process.exitCode=exit;
}
