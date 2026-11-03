/** Capture/seal the existing full build; this command never runs a build. */
import path from 'node:path';
import {createRequire} from 'node:module';
import {captureModelUiProduction,sealModelUiProduction} from './verification/model-ui-production-build.mjs';
const args=process.argv.slice(2),action=args.shift();
if(!['before-build','seal'].includes(action))throw Error('Usage: prepare-model-ui-production.mjs before-build|seal [--root ROOT] [--out OUTPUT]');
for(let i=0;i<args.length;i+=2)if(!['--root','--out'].includes(args[i])||!args[i+1])throw Error('MODEL_UI_BUILD_ARGUMENT');
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];},root=path.resolve(option('--root')||'.');
// Same production dotenv loader as Next; only effective public/config values
// are persisted. Private runtime credentials are neither serialized nor logged.
const {loadEnvConfig}=createRequire(import.meta.url)('@next/env');
loadEnvConfig(root,false,{info(){},warn(){},error:console.error},true);
const result=await(action==='before-build'?captureModelUiProduction:sealModelUiProduction)({root,out:option('--out'),env:process.env});
console.log(`MODEL_UI_PRODUCTION_${action==='before-build'?'CAPTURE':'SEAL'}=PASS SOURCE=${result.source.commit} DIRTY=${result.source.dirty?1:0} INPUTS=${Object.keys(result.inputs||result.buildInputs).length}${result.buildId?' BUILD_ID='+result.buildId:''}`);
