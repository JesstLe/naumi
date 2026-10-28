/** Operator-only first binding. No user accounts, works, prices or roles are rewritten. */
import fs from 'node:fs';
import { createInstance, enqueueCommand } from '../src/lib/fleet/server';
import { getPool } from '../src/lib/db/connection';
import { ALL_FEATURE_IDS } from '../src/lib/feature-access/catalog';
import { WORKSPACE_MODULES, sitePolicyInputSchema } from '../src/lib/site-control/contracts';
import { z } from 'zod';

const schema=z.object({instanceId:z.string().uuid(),commandId:z.string().uuid(),operator:z.string().email(),
  enterpriseId:z.string().uuid(),sourceInstanceId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),
  brand:z.string().min(1).max(80)}).strict();
async function main(){
  const [mode,file,receipt]=process.argv.slice(2);
  if(!['register','publish'].includes(mode)||!file?.startsWith('/')||!receipt?.startsWith('/'))throw Error('INSTALL_ARGUMENTS');
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.size>4096)throw Error('PRIVATE_INSTALL_INPUT');
  const input=schema.parse(JSON.parse(fs.readFileSync(file,'utf8')));
  if(process.env.FLEET_CONTROL_ENABLED!=='1')throw Error('CENTRAL_ONLY');
  const pool=getPool();
  try{
    const operator=(await pool.query("SELECT 1 FROM app_users WHERE email=$1 AND role='admin' AND NOT banned AND (account_expires_at IS NULL OR account_expires_at>now())",[input.operator])).rowCount;
    if(!operator)throw Error('ACTIVE_PLATFORM_OPERATOR_REQUIRED');
    if(fs.existsSync(receipt))throw Error('RECONCILE_EXISTING_RECEIPT');
    const result=mode==='register'
      ?await createInstance(input.operator,input.brand,'enterprise',true,input.instanceId)
      :await enqueueCommand(input.operator,input.instanceId,input.commandId,{type:'site.policy.set',expectedRevision:0,
        policy:sitePolicyInputSchema.parse({enterpriseId:input.enterpriseId,sourceInstanceId:input.sourceInstanceId,brand:input.brand,
          enabledFeatures:[...ALL_FEATURE_IDS],workspaceModules:WORKSPACE_MODULES.map(x=>x.id)})});
    const fd=fs.openSync(receipt,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(result)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    console.log('SITE_INSTALL='+mode.toUpperCase()+'; RECEIPT_PRIVATE=1; USER_ROWS_CHANGED=0');
  }finally{await pool.end();}
}
main().catch(()=>{console.error('SITE_INSTALL_FAILED: inspect the private operator receipt before retrying');process.exitCode=1;});
