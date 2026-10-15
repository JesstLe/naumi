const origin=String(process.env.NAUMI_APP_ORIGIN||"http://app:3000").replace(/\/+$/,"");
const secret=String(process.env.MODEL_HEALTH_WORKER_SECRET||"");
if(secret.trim().length<32){console.error("MODEL_HEALTH_WORKER_SECRET must contain at least 32 characters");process.exit(1);}
const intervalMs=Math.max(60000,Number(process.env.MODEL_HEALTH_WORKER_INTERVAL_MS||60000)||60000);
let running=false;
async function tick(){
  if(running)return;running=true;
  try{
    const response=await fetch(`${origin}/api/model-health/worker/tick`,{method:"POST",headers:{"x-model-health-worker-secret":secret},signal:AbortSignal.timeout(1020000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const result=await response.json();if(result.processed)console.log(JSON.stringify({processed:result.processed,state:result.state,at:result.at}));
  }catch{console.error("model-health tick incomplete; persisted claims will not be resubmitted");}
  finally{running=false;}
}
await tick();setInterval(tick,intervalMs);
