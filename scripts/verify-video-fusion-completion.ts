import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {runVideoCreationBrowser} from "./verify-video-fusion-creation.mjs";
import {runVideoReferenceBoundaries} from "./verify-video-fusion-reference-boundaries";

async function main(){
  const h=await createVideoFixture({startWorker:false,uiModels:true}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`completion-${randomUUID()}`);
  await mkdir(evidence,{recursive:true});
  try{
    const profile=process.argv.find(value=>value.startsWith("--profiles="))?.slice(11);
    if(profile){
      assert.equal(profile,"reference-boundaries","Unknown completion module selection");
      const references=await runVideoReferenceBoundaries(h,evidence);
      await writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:true,scope:"reference-boundaries-only",references,paidVideoApiCalls:0},null,2));
      process.stdout.write(`VIDEO_REFERENCE_BOUNDARIES=PASS ${evidence}\n`);return;
    }
    const controlsOnly=process.argv.includes("--controls-only"),browser=await runVideoCreationBrowser(h,evidence,{controlsOnly});
    if(controlsOnly){await writeFile(path.join(evidence,"menu-probe-result.json"),JSON.stringify({schemaVersion:1,scope:"menu-probe-only",browser},null,2));process.stdout.write(`VIDEO_MENU_PROBE=OBSERVED ${evidence}\n`);return;}
    await writeFile(path.join(evidence,"browser-result.json"),JSON.stringify(browser,null,2));
    const references=await runVideoReferenceBoundaries(h,evidence);
    await writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:true,browser,references,paidVideoApiCalls:0,realVideoQualityValidated:false},null,2));
    process.stdout.write(`VIDEO_COMPLETION_MODULE=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
