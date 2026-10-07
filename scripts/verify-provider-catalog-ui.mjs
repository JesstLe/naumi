import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('isolated DB required');
if(existsSync('output/provider-catalog-ui.json'))throw Error('existing fixture must be closed');
const original=readFileSync('tsconfig.json'),fixture=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','--conditions','react-server','scripts/provider-catalog-ui-fixture.ts'],{env:process.env,stdio:'inherit',windowsHide:true}),wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<180;i++){if(fixture.exitCode!==null)throw Error('fixture exited');if(existsSync('output/provider-catalog-ui.json'))try{if((await fetch('http://127.0.0.1:54981/api/health')).ok){ready=true;break}}catch{}await wait(1000)}if(!ready)throw Error('fixture startup timeout');
 const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/verify-provider-catalog-ui.ts'],{env:process.env,stdio:'inherit',windowsHide:true});process.exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)})||0;
}finally{
 if(existsSync('output/provider-catalog-ui.json')){const f=JSON.parse(readFileSync('output/provider-catalog-ui.json','utf8'));await fetch(f.control+'/stop',{method:'POST'}).catch(()=>{})}
 for(let i=0;i<50&&fixture.exitCode===null;i++)await wait(200);if(fixture.exitCode===null)fixture.kill();writeFileSync('tsconfig.json',original);
}
