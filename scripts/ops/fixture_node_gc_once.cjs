const http=require('node:http');process.title='next-server (gc-fixture)';
global.sentinel={text:'reachable-sentinel',rows:Array.from({length:40000},(_,i)=>({i,value:'keep-'+i}))};
global.pendingTask={state:'pending',promise:new Promise(()=>{})};
global.garbage=Array.from({length:400000},(_,i)=>({i,text:'garbage-'+i}));
setTimeout(()=>{global.garbage=null;console.log('GC_FIXTURE_READY')},100);
http.createServer((req,res)=>res.end(JSON.stringify({sentinel:global.sentinel.text,rows:global.sentinel.rows.length,last:global.sentinel.rows[39999].i,task:global.pendingTask.state,retainedPromise:global.pendingTask.promise instanceof Promise}))).listen(9081,'127.0.0.1');
