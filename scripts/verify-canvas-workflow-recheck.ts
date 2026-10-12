import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getPool, getOrCreateUser, listArtworksByIds } from "../src/lib/db";
import { importCanvasWorkflow, fillWorkflowAsset } from "../src/lib/canvas-workflow-import";
import { readWorkflowClipboard } from "../src/lib/canvas/workflow-clipboard";
import { saveCanvasHistory, historyRequest } from "../src/lib/canvas-history";
import { MEDIA_DIR } from "../src/lib/storage";
import { gaodingFixture, clipboardHtml } from "./fixtures/gaoding-clipboard";

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://naumi_fixture:fixture_local_only@127.0.0.1:13049/naumi_workflow_paste_acceptance", "isolated DB only");
  assert.ok(MEDIA_DIR.replaceAll("\\", "/").includes("gaoding-workflow-recheck-20261012/"), "isolated media only");
  const email="workflow-recheck@fixture.local";
  await getOrCreateUser(email,"工作流复核");
  const ledger=async()=>(await getPool().query("SELECT count(*)::int AS count, coalesce(sum(delta),0)::int AS delta FROM app_ledger")).rows[0];
  const before=await ledger();
  const fixture=gaodingFixture();
  const a=structuredClone(fixture.elements[0].elements[1]);
  const nested=fixture.elements[0].elements[2];
  if (!("elements" in nested) || !("url" in a)) throw Error("invalid synthetic fixture");
  const b=structuredClone(nested.elements[0]);
  a.metaInfo.workflow!.previous=[];b.metaInfo.workflow!.previous=["text-a","outside-copy"];
  b.height=1600;b.left=2400;
  const html=clipboardHtml({version:fixture.version,elements:[{...fixture.elements[0],elements:[a,b]}]});
  const input={html,operationId:randomUUID(),projectKey:null,x:120,y:-80};
  const progress: number[]=[];
  const [first,retry]=await Promise.all([
    importCanvasWorkflow(email,input,{progress:done=>progress.push(done),prepare:async()=>{throw Error("text-only must not download");}}),
    importCanvasWorkflow(email,input,{prepare:async()=>{throw Error("idempotent retry must not download");}}),
  ]);
  assert.deepEqual(first,retry);assert.deepEqual(progress,[0]);
  assert.equal(first.artworks.length,0);assert.equal(first.textNodes.length,2);assert.equal(first.missingReferences,1);
  assert.match(first.projectKey,/^tree:text-import-/);
  assert.deepEqual(first.textNodes[1].sourceIds,[first.textNodes[0].id]);
  const second=await importCanvasWorkflow(email,{...input,operationId:randomUUID(),projectKey:first.projectKey,x:500,y:280});
  assert.equal(second.projectKey,first.projectKey);
  assert.equal(new Set([...first.textNodes,...second.textNodes].map(n=>n.id)).size,4);
  assert.deepEqual(second.textNodes[1].sourceIds,[second.textNodes[0].id]);
  for(let i=0;i<2;i++) {assert.equal(second.textNodes[i].canvasX-first.textNodes[i].canvasX,380);assert.equal(second.textNodes[i].canvasY-first.textNodes[i].canvasY,360);}
  await saveCanvasHistory(email,historyRequest.parse({operationId:randomUUID(),operations:first.textNodes.map(n=>({type:"text-delete",id:n.id}))}));
  await assert.rejects(()=>importCanvasWorkflow(email,input),/撤销或删除/);
  await saveCanvasHistory(email,historyRequest.parse({operationId:randomUUID(),operations:first.textNodes.map(node=>({type:"text-restore",node}))}));
  const restored=(await importCanvasWorkflow(email,input)).textNodes;
  for(let i=0;i<2;i++) assert.deepEqual({...restored[i],updatedAt:first.textNodes[i].updatedAt},first.textNodes[i]);
  console.log("TEXT_ONLY=PASS ZERO_DOWNLOADS=YES CONCURRENT_RETRY=ONE_IMPORT REPEATED_PASTE=NEW_IDS_LINKS OFFSET=380_360 EXTERNAL_REFERENCES=1 UNDO_REDO=PASS");

  const image=structuredClone(fixture.elements[0].elements[0]);
  if (!("url" in image)) throw Error("invalid synthetic image fixture");
  image.url="";
  const emptyImageHtml=clipboardHtml({version:fixture.version,elements:[image]});
  const imported=await importCanvasWorkflow(email,{...input,operationId:randomUUID(),html:emptyImageHtml});
  const placeholder=imported.artworks[0],original=readWorkflowClipboard(emptyImageHtml)!.nodes[0];
  assert.equal(placeholder.source,"workflow-placeholder");
  assert.equal(placeholder.canvasWidth,original.width);assert.equal(placeholder.canvasHeight,original.height);
  assert.equal(imported.manifest.origins[0].missingAsset,"素材地址缺失");
  const png=await sharp({create:{width:64,height:48,channels:4,background:"#aabbcc"}}).png().toBuffer();
  const filled=await fillWorkflowAsset(email,placeholder.id,randomUUID(),png);
  await getPool().query("UPDATE app_artworks SET canvas_x=canvas_x+25,title='edited title' WHERE email=$1 AND id=$2",[email,placeholder.id]);
  const late=await importCanvasWorkflow(email,{...input,operationId:imported.operationId,html:emptyImageHtml});
  assert.equal(late.artworks[0].image,filled.node.image);assert.equal(late.artworks[0].source,"workflow-import");
  assert.equal(late.artworks[0].canvasX,placeholder.canvasX!+25);assert.equal(late.artworks[0].title,"edited title");
  assert.equal((await listArtworksByIds(email,[placeholder.id])).length,1);
  assert.equal((await sharp(await fs.readFile(path.join(MEDIA_DIR,placeholder.image!.slice(7)))).metadata()).format,"png");
  assert.deepEqual(await ledger(),before);
  console.log("MISSING_URL=PLACEHOLDER SAME_NODE_FILL=PASS LATE_RETRY=LIVE_PIXELS_TITLE_POSITION LEDGER=UNCHANGED PROVIDER_CALLS=0");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>getPool().end());
