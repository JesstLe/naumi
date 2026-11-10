/** Dedicated loopback PostgreSQL + actual repository, release locks and runtime.
 * The model callback must never run in the delete-before-admission case. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  let requests=0,checks=0;
  const fixture=await createModelFixture((_req,res)=>{requests++;res.writeHead(500);res.end("No provider calls allowed");});
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${fixture.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_RELEASE_RUNTIME:"1",NAUMI_INSTANCE_ID:"agent-chain-fixture",SOURCE_COMMIT:"a".repeat(40),NAUMI_RELEASE_ADMISSION_START:"open",AGENT_API_KEY:"fixture-local-key",OPENAI_API_KEY:"fixture-local-key",AGENT_BASE_URL:fixture.origin+"/v1",INTERNAL_APP_ORIGIN:fixture.origin});
  const db=await import("../src/lib/db"),repo=await import("../src/lib/agent/session-repository"),release=await import("../src/lib/release-runtime/store"),identity=await import("../src/lib/release-runtime/identity"),runtime=await import("../src/lib/agent/runtime"),life=await import("../src/lib/agent/session-lifecycle");
  const owner=`audit-${randomUUID()}@example.test`,id=`ag-${randomUUID()}`;
  const sessions=[id];
  const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;console.log("PASS "+label);};
  try{
    await db.getOrCreateUser(owner,"Audit fixture");
    const revision=await repo.saveAgentSession(owner,id,"original",[{role:"user",content:"original"}],[],null);
    const run=await release.beginAgentActivity(owner,id,"workbench");
    // No local runtime session exists. The persistent owner still blocks writes.
    check(runtime.getSession(owner,id)===null,"no local session in the observing slot");
    check(await life.agentHistoryRunning(owner,id),"history sees global running owner");
    await assert.rejects(repo.renameAgentSession(owner,id,"overwritten"),(e:any)=>e.code==="AGENT_SESSION_BUSY");checks++;
    await assert.rejects(repo.deleteAgentSession(owner,id),(e:any)=>e.code==="AGENT_SESSION_BUSY");checks++;
    check((await repo.getAgentSession(owner,id))?.revision===revision,"busy mutations do not write history");
    await release.finishActivity(run);
    check(!await life.agentHistoryRunning(owner,id),"idle owner can be observed on another slot");
    const {signUserSession}=await import("../src/lib/native-auth");
    await db.getPool().query("UPDATE app_release_session_owners SET instance_id='retired-slot' WHERE account_key=$1 AND session_id=$2",[identity.accountKey(owner),id]);
    const api=await import("../src/app/api/agent/route");
    const observed=await api.GET(new Request(fixture.origin+`/api/agent?sessionId=${id}&since=0`,{headers:{cookie:`nv_user=${signUserSession(owner,Date.now())}`}}));
    check(observed.status===200&&(await observed.json()).running===false,"idle history is readable after the old slot retires");
    check(await repo.renameAgentSession(owner,id,"renamed"),"idle rename succeeds");
    const next=await release.beginAgentActivity(owner,id,"workbench");await release.unknownActivity(next,"fixture unknown");
    await assert.rejects(repo.deleteAgentSession(owner,id),(e:any)=>e.code==="AGENT_OWNER_UNKNOWN");checks++;
    await assert.rejects(life.agentHistoryRunning(owner,id),(e:any)=>e.code==="AGENT_OWNER_UNKNOWN");checks++;

    const race=`ag-${randomUUID()}`;await repo.saveAgentSession(owner,race,"race",[],[],null);
    const tx=await db.getPool().connect();
    try{
      await tx.query("BEGIN");await release.assertIdleAgentSessionTx(tx,owner,race,"workbench");
      let started=false;const pending=release.beginAgentActivity(owner,race,"workbench").then(value=>{started=true;return value;});
      // Wait on actual pg_stat_activity, not a guessed scheduling delay.
      const deadline=Date.now()+5000;let waiting=false;
      while(Date.now()<deadline){const rows=await db.getPool().query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'SELECT pg_advisory_xact_lock(hashtextextended%' LIMIT 1");if(rows.rowCount){waiting=true;break;}await new Promise(r=>setTimeout(r,10));}
      check(waiting&&!started,"run admission waits for history mutation lock");
      await tx.query("UPDATE app_agent_sessions SET title='transaction title' WHERE email=$1 AND id=$2",[owner,race]);await tx.query("COMMIT");
      const active=await pending;check(started,"admission resumes after mutation commits");
      await assert.rejects(repo.deleteAgentSession(owner,race),(e:any)=>e.code==="AGENT_SESSION_BUSY");checks++;
      await release.finishActivity(active);await repo.deleteAgentSession(owner,race);check(!await repo.getAgentSession(owner,race),"idle deletion succeeds");
    }finally{await tx.query("ROLLBACK").catch(()=>{});tx.release();}

    const missing=`ag-${randomUUID()}`;sessions.push(missing);
    const session=await runtime.getOrCreateSession(owner,missing,[],{cookie:`nv_user=${signUserSession(owner,Date.now())}`,authorization:""},"fixture-text");
    await runtime.persistAgentSession(session);await repo.deleteAgentSession(owner,missing);
    let modelCalls=0;session.agent.streamFunction=(()=>{modelCalls++;throw Error("Model must not run");}) as any;
    await assert.rejects(session.agent.prompt("must not run after deletion"),(e:any)=>e.code==="AGENT_SESSION_CONFLICT");checks++;
    check(modelCalls===0,"delete-before-admission fails CAS before model or tools");
    check(!await repo.getAgentSession(owner,missing),"deleted history cannot be resurrected");
    check(requests===0,"no provider or application network calls");
    console.log(`AGENT_CHAIN_HISTORY_PG=PASS CHECKS=${checks} REAL_PG=1 SUPPLIER=0`);
  }finally{
    for(const liveId of sessions){const session=runtime.getSession(owner,liveId);if(session){session.running=false;session.canvasExecuting=false;runtime.removeRuntimeSession(owner,liveId);}}
    await release.releasePool().end();await db.getPool().end();await fixture.cleanup();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
