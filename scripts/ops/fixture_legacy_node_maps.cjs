// Local synthetic target only. It never loads Naumi or a database/supplier.
const vm=require('node:vm'),http=require('node:http');
const mode=process.env.FIXTURE_MAP_MODE||'mixed';
if(mode==='title')process.title='next-server (fixture)';
const session=(id,extra={})=>({id,email:'fixture-private@example.invalid',agent:{state:{}},running:false,canvasExecuting:false,...extra});
global.maps=[new Map(),new Map([['unrelated',{running:true}]])];
if(!['empty','subclass'].includes(mode)){
 const idle=session('ag-idle');global.maps.push(new Map([[idle.email+'::'+idle.id,idle]]));
 const context=vm.createContext({});vm.runInContext(`globalThis.maps=[new Map(),new Map([['fixture-private@example.invalid::ag-context',{id:'ag-context',email:'fixture-private@example.invalid',agent:{},running:false,canvasExecuting:false}]])];`,context);global.context=context;
}
if(mode==='mixed'){
 for(const row of [session('ag-running',{running:true}),session('cv-canvas',{canvasExecuting:true}),session('tmp-volatile')])global.maps.push(new Map([[row.email+'::'+row.id,row]]));
 global.maps.push(new Map([['fixture-private@example.invalid::ag-creating',new Promise(()=>{})],['fixture-private@example.invalid::ag-settled',Promise.resolve(1)]]));
}
if(mode==='getter'){
 const trap={};Object.defineProperty(trap,'id',{get(){global.getterInvoked=true;throw Error('GETTER_MUST_NOT_RUN');}});
 global.maps.push(new Map([['fixture-private@example.invalid::ag-getter',trap]]));
 global.maps.push(new Map([['fixture-private@example.invalid::ag-proxy',new Proxy({},{getOwnPropertyDescriptor(){global.getterInvoked=true;throw Error('PROXY_MUST_NOT_RUN');}})]]));
}
if(mode==='shared'){global.shared=vm.createContext({Map});vm.runInContext('globalThis.m=new Map()',global.shared);}
if(mode==='subclass'){class SubMap extends Map{};const s=session('ag-subclass',{running:true});global.maps.push(new SubMap([[s.email+'::'+s.id,s]]));}
if(mode==='pending'){for(const s of [session('ag-persist',{persistPending:new Promise(()=>{})}),session('ag-tool',{toolResultsPending:new Promise(()=>{})})])global.maps.push(new Map([[s.email+'::'+s.id,s]]));}
if(mode==='alternate'){require('node:inspector').open(9230,'127.0.0.1');}
http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({mode,getterInvoked:!!global.getterInvoked,pid:process.pid}));}).listen(9081,'127.0.0.1');
console.log('FIXTURE_READY '+mode);
