'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,before=path.resolve(option('--baseline-root',root)),out=path.resolve(option('--output','output/placement-browser'));
fs.mkdirSync(out,{recursive:true});
function bundle(resolveDir,globalName){return esbuild.buildSync({stdin:{contents:"export {stableArtworkPositions} from './src/lib/canvas/stable-placement';",resolveDir,loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName,nodePaths:[path.join(root,'node_modules')]}).outputFiles[0].text;}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),page=await browser.newPage(),errors=[];let network=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{network++;return route.abort()});
 try{
  await page.setContent('<!doctype html><html><body>Isolated placement comparison</body></html>');await page.addScriptTag({content:bundle(before,'BaselinePlacement')});await page.addScriptTag({content:bundle(root,'ModifiedPlacement')});
  const result=await page.evaluate(async()=>{
   const results=[],make=n=>Array.from({length:n},(_,i)=>({id:'node-'+i,parentId:i?'node-0':null,width:320,height:320}));
   for(let i=0;i<2;i++){BaselinePlacement.stableArtworkPositions(make(100),new Map());ModifiedPlacement.stableArtworkPositions(make(100),new Map())}
   for(const n of [100,300,600])for(let round=0;round<3;round++){
    const nodes=make(n),maps={};for(const mode of round%2?['MODIFIED','BASELINE']:['BASELINE','MODIFIED']){
     await new Promise(r=>setTimeout(r,20));const cache=new Map(),started=performance.now();(mode==='BASELINE'?BaselinePlacement:ModifiedPlacement).stableArtworkPositions(nodes,cache);const elapsed=performance.now()-started;maps[mode]=JSON.stringify([...cache]);const at=performance.now();(mode==='BASELINE'?BaselinePlacement:ModifiedPlacement).stableArtworkPositions(nodes,cache);
     results.push({nodes:n,round,mode,ms:elapsed,cachedMs:performance.now()-at});
    }
    if(maps.BASELINE!==maps.MODIFIED)throw Error('coordinate mismatch');
   }
   return {results,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,coordinatesExact:true};
  });
  assert.deepEqual(errors,[]);assert.equal(network,0);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({...result,errors,networkRequests:network,baselineRoot:before,sourceRoot:root,evidence:'identical esbuild compilation and browser realm; alternate-order synthetic graph helper timing, not whole Canvas INP'},null,2));
  console.log('PLACEMENT_BROWSER=PASS COORDINATES=EXACT NETWORK=0 SAMPLES='+result.results.length);console.log('TIMINGS='+JSON.stringify(result.results));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
