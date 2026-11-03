#!/usr/bin/env node
'use strict';

// Real React hook in Chromium. Only persistence/owner inputs are fixtures.
// No Next process, HTTP server, production database or supplier is used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const out = path.resolve(arg('--output-root', process.env.CANVAS_TEXT_AUTOSAVE_EVIDENCE || path.join(root, 'output/canvas-text-autosave')));
const source = path.resolve(arg('--source-root', root));
const hookFile = path.join(source, 'src/components/canvas/use-text-node-autosave.ts');
const origin = 'http://127.0.0.1:15893';
const checks = [], pageErrors = [], external = [], stdout = [];
const say = value => { stdout.push(value); console.log(value); };
const plain = value => JSON.parse(JSON.stringify(value));
const harness = `
import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {useTextNodeAutosave} from ${JSON.stringify(hookFile.replaceAll('\\', '/'))};
let root, state, api;
function initial() { return {owner:'A',epoch:1,nodes:new Map([['a',{id:'a',content:'original',sourceIds:[],width:380}],['b',{id:'b',content:'second',sourceIds:[],width:380}]]),writes:[],saved:new Map(),unsaved:new Set(),waiters:new Map(),mode:'success',ready:false,barrierDone:false,callbackVersion:1}; }
function App({fixture}) {
  const version = fixture.callbackVersion;
  const hook = useTextNodeAutosave({
    getNode: id => fixture.nodes.get(id),
    hasUnsaved: () => fixture.unsaved.size > 0,
    save: async (node, context) => {
      fixture.unsaved.add(node.id);
      const snapshot = structuredClone(node);
      const write = {node:snapshot,owner:context.owner,epoch:context.epoch,callbackVersion:version,outcome:'pending'};
      fixture.writes.push(write);
      if (fixture.mode === 'hold') await new Promise(resolve => fixture.waiters.set(node.id, resolve));
      if (!context.isCurrent()) { fixture.unsaved.delete(node.id);write.outcome='stale';return null; }
      if (fixture.mode === 'fail') {write.outcome='failed';return null;}
      fixture.saved.set(node.id,snapshot);fixture.unsaved.delete(node.id);write.outcome='saved';return snapshot;
    },
  });
  api = hook;
  useEffect(() => {fixture.ready=true;},[fixture]);
  return <main data-testid="real-react-hook">Real useTextNodeAutosave</main>;
}
function context() { const current = state, owner=current.owner, epoch=current.epoch;return {owner,epoch,isCurrent:()=>current.owner===owner&&current.epoch===epoch}; }
window.autosaveFixture = {
  reset() {if(root)root.unmount();document.getElementById('app').replaceChildren();state=initial();root=createRoot(document.getElementById('app'));flushSync(()=>root.render(<App fixture={state}/>));},
  snapshot() {return {ready:state.ready,owner:state.owner,epoch:state.epoch,writes:state.writes,saved:[...state.saved],unsaved:[...state.unsaved],pendingSaveIds:[...state.waiters.keys()],barrierDone:state.barrierDone};},
  edit(id, patch) {state.nodes.set(id,{...state.nodes.get(id),...patch});},
  remove(id) {state.nodes.delete(id);},
  schedule(id) {api.schedule(id,context());},
  flush(id) {return api.flush(id);},
  flushAll() {return api.flushAll();},
  beginBarrier() {state.barrierDone=false;state.barrier=api.flushAll().then(value=>{state.barrierDone=true;return value;});},
  cancel(ids) {api.cancel(ids);},
  owner(value) {state.owner=value;state.epoch++;},
  mode(value) {state.mode=value;},
  release(id) {const resolve=state.waiters.get(id);state.waiters.delete(id);resolve?.();},
  warn() {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;},
  recover() {state.unsaved.clear();},
  rerender() {state.callbackVersion++;flushSync(()=>root.render(<App fixture={state}/>));},
  unmount() {root.unmount();root=null;},
};
window.autosaveFixture.reset();
`;

async function main() {
  fs.mkdirSync(out, {recursive:true});
  const bundle = await build({stdin:{contents:harness,loader:'tsx',resolveDir:root,sourcefile:'text-autosave-hook-fixture.tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,metafile:true,define:{'process.env.NODE_ENV':'"development"'}});
  const code = bundle.outputFiles[0].text;
  assert.ok(Object.keys(bundle.metafile.inputs).some(file=>file.replaceAll('\\','/').endsWith('/use-text-node-autosave.ts')), 'Actual product hook must be bundled');
  fs.writeFileSync(path.join(out,'harness.js'),code);
  fs.writeFileSync(path.join(out,'BUILD.json'),JSON.stringify({inputs:Object.keys(bundle.metafile.inputs),hookFile,hookSha256:crypto.createHash('sha256').update(fs.readFileSync(hookFile)).digest('hex'),bundleSha256:crypto.createHash('sha256').update(code).digest('hex')},null,2));
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/*',route=>{
    const url = new URL(route.request().url());
    if(url.origin!==origin){external.push(url.href);return route.abort();}
    if(url.pathname==='/harness.js')return route.fulfill({contentType:'text/javascript',body:code});
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="app"></div><script src="/harness.js"></script></body></html>'});
    return route.fulfill({status:404,body:''});
  });
  let exit=1, failure;
  const run = async (name, test) => {
    await page.evaluate(()=>window.autosaveFixture.reset());
    await page.waitForFunction(()=>window.autosaveFixture.snapshot().ready);
    await test();checks.push(name);say('CHECK='+name);
  };
  const snapshot = () => page.evaluate(()=>window.autosaveFixture.snapshot());
  try {
    await page.goto(origin+'/',{waitUntil:'load'});
    await page.waitForFunction(()=>window.autosaveFixture?.snapshot().ready);
    await page.clock.install({time:new Date('2026-11-03T10:00:00.000Z')});
    await page.clock.pauseAt(new Date('2026-11-03T10:00:01.000Z'));

    await run('650MS_TYPING_COALESCES_TO_LATEST_BODY',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.edit('a',{content:'first'});f.schedule('a');});
      await page.clock.runFor(300);
      await page.evaluate(()=>{const f=window.autosaveFixture;f.edit('a',{content:'second'});f.schedule('a');});
      await page.clock.runFor(300);
      await page.evaluate(()=>{const f=window.autosaveFixture;f.edit('a',{content:'final'});f.schedule('a');});
      await page.clock.runFor(649);assert.equal((await snapshot()).writes.length,0);
      await page.clock.runFor(1);const s=await snapshot();assert.equal(s.writes.length,1);assert.equal(s.writes[0].node.content,'final');
      await page.clock.runFor(1000);assert.equal((await snapshot()).writes.length,1);
    });
    await run('FLUSHALL_WAITS_FOR_EVERY_CURRENT_SAVE',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.mode('hold');f.schedule('a');f.schedule('b');f.beginBarrier();});
      let s=await snapshot();assert.equal(s.writes.length,2);assert.equal(s.barrierDone,false);
      await page.evaluate(()=>window.autosaveFixture.release('a'));s=await snapshot();assert.equal(s.barrierDone,false);
      await page.evaluate(()=>window.autosaveFixture.release('b'));s=await snapshot();assert.equal(s.barrierDone,true);assert.equal(s.saved.length,2);
      await page.clock.runFor(1000);assert.equal((await snapshot()).writes.length,2);
    });
    await run('CANCEL_STOPS_ONLY_SELECTED_PENDING_IDS',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.schedule('a');f.schedule('b');f.cancel(['a']);});
      await page.clock.runFor(650);assert.deepEqual((await snapshot()).writes.map(write=>write.node.id),['b']);
      assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),false);
    });
    await run('OWNER_A_B_A_INVALIDATES_OLD_EPOCH_WITH_ZERO_WRITES',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.schedule('a');f.owner('B');f.owner('A');});
      assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),false);
      await page.clock.runFor(650);assert.equal((await snapshot()).writes.length,0);
    });
    await run('FLUSH_READS_LATEST_REF_BODY_REFERENCES_AND_GEOMETRY',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.schedule('a');f.edit('a',{content:'new live body',sourceIds:['text-source','image-source'],width:640});});
      await page.evaluate(()=>window.autosaveFixture.flush('a'));const saved=(await snapshot()).writes[0].node;
      assert.deepEqual(plain(saved),{id:'a',content:'new live body',sourceIds:['text-source','image-source'],width:640});
    });
    await run('CALLBACK_REF_USES_LATEST_REACT_RENDER',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.schedule('a');f.rerender();});
      await page.clock.runFor(650);assert.equal((await snapshot()).writes[0].callbackVersion,2);
    });
    await run('BEFOREUNLOAD_BLOCKS_PENDING_AND_CLEARS_AFTER_CANCEL',async()=>{
      await page.evaluate(()=>window.autosaveFixture.schedule('a'));assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),true);
      await page.evaluate(()=>window.autosaveFixture.cancel(['a']));assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),false);
    });
    await run('BEFOREUNLOAD_BLOCKS_INFLIGHT_UNTIL_ACK',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.mode('hold');f.schedule('a');});
      await page.clock.runFor(650);assert.equal((await snapshot()).writes.length,1);
      assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),true);
      await page.evaluate(()=>window.autosaveFixture.release('a'));assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),false);
    });
    await run('FAILED_SAVE_REMAINS_UNSAVED_UNTIL_CALLER_RECOVERY',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.mode('fail');f.schedule('a');});
      await page.clock.runFor(650);assert.equal((await snapshot()).writes[0].outcome,'failed');
      assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),true);
      await page.evaluate(()=>window.autosaveFixture.recover());assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),false);
    });
    await run('UNMOUNT_FLUSHES_SAME_OWNER_PENDING_DRAFT',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.edit('a',{content:'navigation draft'});f.schedule('a');f.unmount();});
      const s=await snapshot();assert.equal(s.writes.length,1);assert.equal(s.writes[0].node.content,'navigation draft');assert.equal(s.saved.length,1);
      await page.clock.runFor(1000);assert.equal((await snapshot()).writes.length,1);
    });
    await run('UNMOUNT_AFTER_OWNER_CHANGE_PERFORMS_ZERO_WRITES',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.schedule('a');f.owner('B');f.unmount();});
      await page.clock.runFor(1000);assert.equal((await snapshot()).writes.length,0);
    });
    await run('DELETED_NODE_IS_NOT_RECREATED_BY_PENDING_TIMER',async()=>{
      await page.evaluate(()=>{const f=window.autosaveFixture;f.schedule('a');f.remove('a');});
      await page.clock.runFor(650);assert.equal((await snapshot()).writes.length,0);assert.equal(await page.evaluate(()=>window.autosaveFixture.warn()),false);
    });
    assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);
    exit=0;say(`CANVAS_TEXT_AUTOSAVE=PASS CHECKS=${checks.length} REAL_REACT_HOOK=YES SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=0`);
  } catch(error) {failure=error.stack||String(error);say('CANVAS_TEXT_AUTOSAVE=FAIL EXIT=1');console.error(error);}
  finally {
    await browser.close();
    fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({command:['node','scripts/verify-canvas-text-autosave.cjs','--source-root',source,'--output-root',out],input:'Real useTextNodeAutosave + React/Chromium; deterministic browser clock; loopback route-delivered assets; persistence and owner boundaries only are fixtures',level:'real-react-hook-browser-with-persistence-fixtures',checks,pageErrors,external,stdout:stdout.join('\n'),failure,exit,realSupplierCalls:0},null,2));
    fs.writeFileSync(path.join(out,'stdout.txt'),stdout.join('\n')+'\n');
    fs.writeFileSync(path.join(out,'exit.txt'),String(exit)+'\n');
  }
  process.exitCode=exit;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
