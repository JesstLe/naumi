import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {preparePilot} from './lib/enterprise-pilot-plan.mjs';
import {SourceAuditError} from './lib/enterprise-source-audit.mjs';
try{
 const args=process.argv.slice(2),opts={};if(args.length!==10)throw new SourceAuditError('PILOT_ARGUMENTS_REQUIRED');
 for(let i=0;i<args.length;i+=2){if(!['--site','--request','--summary','--roster','--output'].includes(args[i])||opts[args[i]]||!args[i+1])throw new SourceAuditError('PILOT_ARGUMENT_INVALID');opts[args[i]]=args[i+1];}
 const read=async(name,max)=>{const path=resolve(opts[name]),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw new SourceAuditError('PILOT_INPUT_FILE_INVALID');return JSON.parse(await readFile(path,'utf8'));};
 const result=preparePilot(await read('--site',16384),await read('--request',262144),await read('--summary',65536),await read('--roster',4*1024*1024));
 const out=resolve(opts['--output']);await mkdir(out,{mode:0o700});
 if(process.platform==='win32'){const sid=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true}).trim();if(!/^S-1-5-\d+(?:-\d+)+$/.test(sid))throw new SourceAuditError('PILOT_OUTPUT_ACL_INVALID');execFileSync('icacls.exe',[out,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});}
 for(const [name,value]of [['PROFILE_PROVISION.private.json',result.provision],['REVIEW.private.json',result.review],['SUMMARY.json',result.summary]]){const p=join(out,name),bytes=JSON.stringify(value,null,2)+'\n';await writeFile(p,bytes,{mode:0o600,flag:'wx'});if(await readFile(p,'utf8')!==bytes)throw new SourceAuditError('PILOT_OUTPUT_VERIFY_FAILED');}
 console.log('PILOT_PLAN_READY: accounts='+result.summary.accounts+' profiles='+result.summary.profiles+' source_writes=0 target_writes=0 employee_ready=false');
}catch(e){console.error('PILOT_PLAN_ERROR: '+(e instanceof SourceAuditError?e.message:'PILOT_PREPARATION_FAILED'));process.exitCode=1;}
