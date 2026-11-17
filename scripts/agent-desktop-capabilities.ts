/** Source coverage, NOT authenticated availability or production acceptance. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createGatewayToolSession,gatewayToolViews} from '../src/lib/agent-gateway/tool-session';
import {CREATIVE_AGENT_TOOLS} from '../src/lib/agent/creative-tool-catalog';
import {TOOL_ACCESS} from '../src/lib/feature-access/catalog';

async function main(){
 if(process.env.DATABASE_URL)throw Error('SOURCE_COVERAGE_REQUIRES_NO_DATABASE');
 process.env.SETTINGS_SECRET ||= randomUUID()+randomUUID();
 const out=resolve(process.argv[2]||'output/desktop-capabilities'),r=relative(resolve('output'),out);
 if(!r||r==='..'||r.startsWith('..'+sep)||isAbsolute(r))throw Error('OUTPUT_MUST_BE_INSIDE_OUTPUT');
 await mkdir(out,{recursive:true});
 const session=createGatewayToolSession({email:'coverage@fixture.invalid',sessionId:'source-coverage',internalOrigin:'http://127.0.0.1:1'});
 const tools=gatewayToolViews(session.tools),byName=new Map(tools.map(t=>[t.name,t]));
 const missing=Object.entries(CREATIVE_AGENT_TOOLS).flatMap(([domain,names])=>names.filter(n=>!byName.has(n)).map(name=>({domain,name})));
 const result={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),evidence:'SOURCE_SCHEMA_ONLY',availability:'GET /tools per account/token/workspace; runtime supply not inferred',tools:tools.map(t=>({...t,feature:TOOL_ACCESS[t.name as keyof typeof TOOL_ACCESS]??null,available:null,domains:Object.entries(CREATIVE_AGENT_TOOLS).filter(([,names])=>names.includes(t.name)).map(([k])=>k)})),missing,excluded:['admin/provider configuration','account/token management','wallet topup'],gaps:['generic project search/create','generic image/text node CRUD','generic edges/layout/undo','video/audio upload through Gateway','full Desktop registration and account UI']};
 await writeFile(resolve(out,'CAPABILITIES.json'),JSON.stringify(result,null,2)+'\n');
 if(missing.length)throw Error('CREATIVE_TOOL_REGISTRY_GAP '+JSON.stringify(missing));
 console.log(`DESKTOP_CREATION_COVERAGE=PASS TOOLS=${tools.length} EXPECTED_MISSING=0 EVIDENCE=SOURCE_SCHEMA_ONLY`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
