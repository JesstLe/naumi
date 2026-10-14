import assert from "node:assert/strict";
import {createServer} from "node:http";
import {access,readFile} from "node:fs/promises";
import path from "node:path";
import {chromium} from "@playwright/test";
const fixture=path.resolve(process.argv[2]||"output/canvas-video-fusion-20261013/checkpoint-c/direct-generation-fixture.js"),bundle=await readFile(fixture);
let executablePath;for(const candidate of [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean)){try{await access(candidate);executablePath=candidate;break;}catch{}}
assert.ok(executablePath,"Set CHROME_PATH to an installed Chrome");
const server=createServer((request,response)=>{if(request.url==="/"){response.setHeader("content-type","text/html; charset=utf-8");response.end('<!doctype html><html><body><script src="/fixture.js"></script></body></html>');}else if(request.url==="/fixture.js"){response.setHeader("content-type","application/javascript");response.end(bundle);}else{response.statusCode=404;response.end();}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));let browser;
try{browser=await chromium.launch({headless:true,executablePath});const page=await browser.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);assert.deepEqual(errors,[]);await page.waitForFunction(()=>typeof window.runDirectGenerationFixture==="function");const result=await page.evaluate(()=>window.runDirectGenerationFixture());assert.equal(result.result,"DIRECT_GENERATION_BROWSER=PASS",JSON.stringify(result));assert.equal(result.feeConfirmations,0);assert.equal(result.apiCostPlusDeclined,"NO_POST");assert.equal(result.apiCostPlusAccepted,"FROZEN_CAP_36");assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({...result,actualChromeReactBillingProvider:true,mockedHttpBillingAndGeneration:true,paidModelCalls:0})+"\n");}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
