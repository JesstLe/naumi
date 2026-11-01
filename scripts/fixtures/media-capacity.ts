import assert from "node:assert/strict";
import {createRequire,syncBuiltinESMExports} from "node:module";
import path from "node:path";
import type {PathLike} from "node:fs";

/** One explicit capacity-read port for an owned test directory. The actual
 * filesystem writes, Sharp processing, PG and storage transport are untouched.
 * A runner's free disk is not the input of every admission-policy scenario. */
export function createMediaCapacityFixture(directory:string, initialAvailableBytes:number) {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
  const fs=createRequire(import.meta.url)("node:fs/promises") as typeof import("node:fs/promises");
  const original=fs.statfs,root=path.resolve(directory);
  let availableBytes=initialAvailableBytes,restored=false;
  const observations:{underlyingAvailableBytes:number;reportedAvailableBytes:number}[]=[];
  function setAvailableBytes(bytes:number) {
    assert.ok(Number.isSafeInteger(bytes)&&bytes>=0);
    assert.equal(restored,false);
    availableBytes=bytes;
  }
  setAvailableBytes(initialAvailableBytes);
  const replacement=(async (target:PathLike,options?:{bigint?:boolean})=>{
    const actual=options?.bigint?await original(target,{bigint:true}):await original(target,{bigint:false});
    if(path.resolve(String(target))!==root)return actual;
    const blocks=Math.floor(availableBytes/Number(actual.bsize));
    observations.push({underlyingAvailableBytes:Number(actual.bavail)*Number(actual.bsize),reportedAvailableBytes:blocks*Number(actual.bsize)});
    return {...actual,bavail:typeof actual.bavail==="bigint"?BigInt(blocks):blocks};
  }) as typeof original;
  fs.statfs=replacement;
  syncBuiltinESMExports();
  return {
    setAvailableBytes,
    observations:()=>observations.map(row=>({...row})),
    restore() {
      assert.equal(fs.statfs,replacement,"Another fixture replaced this capacity port");
      fs.statfs=original;
      syncBuiltinESMExports();
      restored=true;
    },
  };
}
