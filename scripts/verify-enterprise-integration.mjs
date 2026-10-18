import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const name='naumi-integration-fixture-'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
let started=false;
try{
  docker(['run','-d','--name',name,'--label','naumi.fixture=enterprise-integration','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=integration_fixture','-p','127.0.0.1::5432','postgres:16-alpine']);started=true;
  let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break}catch{await new Promise(r=>setTimeout(r,500))}}
  if(!ready)throw new Error('FIXTURE_DATABASE_NOT_READY');
  const port=docker(['port',name,'5432/tcp']).split(':').at(-1),cli=new URL('../node_modules/tsx/dist/cli.mjs',import.meta.url);
  const env={...process.env,DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/integration_fixture`,NAUMI_VERIFY_ISOLATED_DB:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',SMTP_HOST:'',PGOPTIONS:'',...(process.argv.includes('--workspace-preview')?{NAUMI_WORKSPACE_PREVIEW:'1'}:{})};
  const preload=new URL('./enterprise-integration-test-preload.cjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
  if(process.argv.includes('--baseline')&&!process.argv.includes('--regression'))throw new Error('BASELINE_REQUIRES_REGRESSION');
  if(!process.argv.includes('--baseline'))execFileSync(process.execPath,['--require',preload,'--import','tsx','scripts/verify-enterprise-integration.ts'],{stdio:'inherit',timeout:process.argv.includes('--workspace-preview')?3600000:300000,env});
  if(process.argv.includes('--regression'))for(const [database,script] of [['artworks_fixture','scripts/verify-enterprise-artworks.ts'],['analytics_fixture','scripts/verify-enterprise-analytics.ts']]){
    docker(['exec',name,'createdb','-h','127.0.0.1','-U','postgres',database]);
    execFileSync(process.execPath,['--require',preload,'--import','tsx',script],{stdio:'inherit',timeout:120000,env:{...env,DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`,NAUMI_ARTWORKS_EVIDENCE_DIR:process.env.NAUMI_INTEGRATION_EVIDENCE_DIR??'output/enterprise-integration-artworks'}});
  }
  if(process.argv.includes('--preview'))execFileSync(process.execPath,['--require',preload,'--import','tsx','scripts/preview-enterprise-integration.ts'],{stdio:'inherit',timeout:3600000,env});
  if(process.argv.includes('--product'))execFileSync(process.execPath,['--require',preload,'--import','tsx','scripts/preview-enterprise-product.ts'],{stdio:'inherit',timeout:3600000,env});
  console.log(process.argv.includes('--baseline')?'INTEGRATION_BASELINE_PASS: existing_artworks=1 existing_analytics=1 integration_port=0':'INTEGRATION_VERIFY_PASS: disposable_pg=1 production_connections=0 provider_calls=0');
}catch(e){console.error(e.message);process.exitCode=1}finally{if(started){docker(['rm','-f',name]);console.log('INTEGRATION_FIXTURE_CLEANUP_PASS: only_this_container=1')}}
