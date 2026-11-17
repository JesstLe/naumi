// Executes the actual cutout owner. Only account/storage/billing/provider I/O
// are explicit local ports. It is not a production billing or provider test.
const path=require('node:path'),Module=require('node:module'),{build}=require('esbuild');
async function loadCutoutFixture(){
 const state={output:Buffer.alloc(0),calls:0,artworks:[],checkpoints:[],reserves:0,refunds:0,ledger:0};
 const mocks={
  'src/platform/db/pool.ts':'export const dbEnabled=true;',
  'src/lib/imagegen/context.ts':'export const currentImagegenStep=()=>null;',
  'src/lib/model-config/context.ts':'export const currentModelExecution=()=>null;',
  'src/lib/billing/synchronous-operation.ts':'export const checkpointSynchronousResult=async x=>__fixture.checkpoints.push(x);export const currentSynchronousBilling=()=>null;export const configuredToolCost=async()=>1;export const synchronousChargedCredits=x=>x;',
  'src/lib/billing/legacy-credit-reservation.ts':'export const reserveCredits=async()=>{__fixture.reserves++;return true};export const refundCredits=async()=>{__fixture.refunds++};',
  'src/lib/billing/legacy-ledger.ts':'export const addLedgerEntry=async()=>{__fixture.ledger++};',
  'src/lib/artworks/writer.ts':'export const addArtworks=async(_owner,rows)=>__fixture.artworks.push(...rows);',
  'src/lib/accounts/session.ts':'export const getUser=async()=>({email:"fixture@example.test"});',
  'src/lib/accounts/repository.ts':'export const isBanned=async()=>false;',
  'src/lib/object-storage/runtime.ts':'export const storageEnabled=false;',
  'src/lib/media-upload.ts':'export const uploadImage=async()=>{throw Error("Unexpected storage access")};',
  'src/lib/settings.ts':'export const getCutoutSettings=async()=>({backend:"openai",openaiModel:"fixture-image"});export const getOpenAISettings=async()=>({apiKey:"fixture-only"});',
  'src/lib/imagegen/cutout-provider.ts':'export const cutoutOpenAI=async()=>{__fixture.calls++;return __fixture.output};export const cutoutReplicate=async()=>{throw Error("Unexpected fallback")};',
 };
 const result=await build({stdin:{contents:'export {executeCutout} from "./src/lib/imagegen/cutout";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'fixture-ports',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'fixture-empty'}));b.onLoad({filter:/.*/,namespace:'fixture-empty'},()=>({contents:''}));b.onLoad({filter:/\.[cm]?tsx?$/},a=>{const key=path.relative(process.cwd(),a.path).replaceAll('\\','/');if(mocks[key])return{contents:mocks[key],loader:'ts'}})}}]});
 const m=new Module(path.resolve('scripts/.cutout-output-fixture.cjs'));m.filename=path.resolve('scripts/.cutout-output-fixture.cjs');m.paths=module.paths;
 const code='const __fixture=globalThis.__cutoutFixture;\n'+result.outputFiles[0].text;
 globalThis.__cutoutFixture=state;try{m._compile(code,m.filename)}finally{delete globalThis.__cutoutFixture}
 return{state,execute:async output=>{state.output=output;return m.exports.executeCutout({bytes:Buffer.from('original-not-decoded-by-fixture-provider'),type:'image/png',email:'forged@example.test',parentId:'original',title:'Cutout',category:'main',ratio:'1:1',resolution:'1K',quality:'medium'},{actor:async()=>'fixture@example.test',ip:null})}};
}
module.exports={loadCutoutFixture};
