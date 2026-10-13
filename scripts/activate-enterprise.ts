import { z } from 'zod';
import { loginIdentifierToEmail } from '../src/lib/account-identity';
async function main(){
  if(process.env.NAUMI_ENTERPRISE_ACTIVATE!=='1')throw new Error('Explicit NAUMI_ENTERPRISE_ACTIVATE=1 required');
  const [teamId,director,...subTeams]=process.argv.slice(2);
  z.string().uuid().parse(teamId);z.string().min(1).parse(director);subTeams.forEach(id=>z.string().uuid().parse(id));
  const {activateEnterprise}=await import('../src/lib/enterprise/server');
  const {getPool}=await import('../src/lib/db');
  try{console.log(JSON.stringify(await activateEnterprise({email:'enterprise-activation',admin:true,consoleAdmin:true},teamId,loginIdentifierToEmail(director),subTeams)))}finally{await getPool().end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
