import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { workerTickWebIdentity } from "../src/lib/release-runtime/worker-tick-receipts";
import { releaseIdentity } from "../src/lib/release-runtime/identity";

const names=["NAUMI_INSTANCE_ID","SOURCE_COMMIT","NAUMI_RELEASE_RUNTIME","NAUMI_RELEASE_BOOT_ID","NAUMI_RELEASE_BOOT_SOURCE"],saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
let checks=0;const is=(a:unknown,b:unknown)=>{assert.equal(a,b);checks++;};
try {
  Object.assign(process.env,{NAUMI_INSTANCE_ID:"fixture-web-boot",SOURCE_COMMIT:"a".repeat(40),NAUMI_RELEASE_RUNTIME:"1",NAUMI_RELEASE_BOOT_ID:randomUUID(),NAUMI_RELEASE_BOOT_SOURCE:"preload"});
  const expected=process.env.NAUMI_RELEASE_BOOT_ID,web=workerTickWebIdentity(),app=releaseIdentity();
  is(web.bootId,expected);is(web.bootId,app.bootId);is(web.instanceId,app.instanceId);is(web.commit,app.commit);is(web.bootSource,"preload");
  for(const bad of [undefined,"","not-uuid","a".repeat(36)]) {
    if(bad===undefined)delete process.env.NAUMI_RELEASE_BOOT_ID;else process.env.NAUMI_RELEASE_BOOT_ID=bad;
    assert.throws(workerTickWebIdentity,/WORKER_TICK_PRELOAD_BOOT_INVALID/);checks++;
  }
  delete process.env.NAUMI_RELEASE_BOOT_SOURCE;process.env.NAUMI_RELEASE_BOOT_ID=expected!;
  const fallback=workerTickWebIdentity();is(fallback.bootSource,"process-fallback");assert.notEqual(fallback.bootId,expected);checks++;is(fallback.bootId,workerTickWebIdentity().bootId);
  process.env.NAUMI_RELEASE_BOOT_SOURCE="untrusted-environment";process.env.NAUMI_RELEASE_BOOT_ID=randomUUID();is(workerTickWebIdentity().bootId,fallback.bootId);
  delete process.env.NAUMI_RELEASE_BOOT_SOURCE;delete process.env.NAUMI_RELEASE_BOOT_ID;is(workerTickWebIdentity().bootId,fallback.bootId);
  delete process.env.NAUMI_INSTANCE_ID;assert.throws(workerTickWebIdentity,/FIXED_WEB_IDENTITY_REQUIRED/);checks++;
  console.log(`WORKER_TICK_BOOT=PASS CHECKS=${checks} PRELOAD=EXACT_APP_BOOT INVALID_PRELOAD=FAIL_CLOSED FALLBACK=EXPLICIT_PARTIAL PROVIDER_CALLS=0`);
}finally{for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
