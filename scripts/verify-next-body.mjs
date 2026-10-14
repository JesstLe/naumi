import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {patchNextBody} from "./patch-next-body.mjs";
const root=fs.mkdtempSync(path.join(os.tmpdir(),"naumi-next-body-"));
try {
 const paths=["dist/server/next-server.js","dist/esm/server/next-server.js"];
 fs.writeFileSync(path.join(root,"package.json"),JSON.stringify({version:"15.5.27"}));
 for(const name of paths){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),"async function handle(){if (hasRequestBody) {requestData.body.finalize();}}");}
 assert.equal(patchNextBody(root),2);assert.equal(patchNextBody(root),0);
 for(const name of paths) assert.match(fs.readFileSync(path.join(root,name),"utf8"),/await requestData\.body\.finalize\(\)/);
 fs.writeFileSync(path.join(root,paths[0]),"unexpected implementation");
 assert.throws(()=>patchNextBody(root),/unexpected body-finalization/);
 fs.writeFileSync(path.join(root,paths[0]),"async function handle(){if (hasRequestBody) {requestData.body.finalize();}}");
 fs.unlinkSync(path.join(root,paths[1]));
 assert.throws(()=>patchNextBody(root),/ENOENT/);
 assert.equal(patchNextBody(root,true),1);assert.equal(patchNextBody(root,true),0);
 console.log("NEXT_BODY_PATCH=PASS (CJS/ESM/idempotency/drift guard)");
} finally {fs.rmSync(root,{recursive:true,force:true});}
