// Identical measurement-only preload for both original and candidate images.
// Does not change HTTP bodies, SQL, callbacks, task routing or product limits.
const fs=require('node:fs'),http=require('node:http'),{monitorEventLoopDelay,performance}=require('node:perf_hooks');
const directory=process.env.PERFORMANCE_OBSERVER_DIR;
if(directory){
 const histogram=monitorEventLoopDelay({resolution:10});histogram.enable();let started=performance.now(),cpu=process.cpuUsage(),rss=process.memoryUsage().rss,requests=[],queries=[],generation=0;
 const originalEmit=http.Server.prototype.emit;
 http.Server.prototype.emit=function(event,...args){
  if(event==='request'){
   const[req,res]=args,begin=performance.now();res.once('finish',()=>{if(requests.length<100000)requests.push({path:String(req.url).split('?')[0],method:req.method,status:res.statusCode,ms:performance.now()-begin});});
  }
  return originalEmit.call(this,event,...args);
 };
 try{
  const {Client}=require('pg'),originalQuery=Client.prototype.query;
  Client.prototype.query=function(...args){
   const begin=performance.now();let observed=false;const done=()=>{if(!observed){observed=true;if(queries.length<100000)queries.push(performance.now()-begin);}};
   if(typeof args.at(-1)==='function'){const callback=args.at(-1);args[args.length-1]=function(...values){done();return callback.apply(this,values);};}
   let result;try{result=originalQuery.apply(this,args);}catch(error){done();throw error;}
   if(result&&typeof result.then==='function')result.then(done,done);return result;
  };
 }catch(error){console.error('PERFORMANCE_PG_OBSERVER_UNAVAILABLE '+error.message);}
 const sample=setInterval(()=>{rss=Math.max(rss,process.memoryUsage().rss);},20);sample.unref();
 process.on('SIGUSR2',()=>{
  const memory=process.memoryUsage(),usage=process.cpuUsage(cpu);let kernelPeakRssBytes;
  try{kernelPeakRssBytes=Number(fs.readFileSync('/proc/self/status','utf8').match(/^VmHWM:\s+(\d+)/m)[1])*1024;}catch{}
  const report={generation:generation++,elapsedMs:performance.now()-started,pid:process.pid,rssBytes:memory.rss,sampledPeakRssBytes:Math.max(rss,memory.rss),kernelLifetimePeakRssBytes:kernelPeakRssBytes,cpu:usage,eventLoop:{count:histogram.count,minMs:histogram.min/1e6,maxMs:histogram.max/1e6,p50Ms:histogram.percentile(50)/1e6,p95Ms:histogram.percentile(95)/1e6,p99Ms:histogram.percentile(99)/1e6},requests,queries};
  const temporary=directory+'/SERVER.json.tmp';fs.writeFileSync(temporary,JSON.stringify(report));fs.renameSync(temporary,directory+'/SERVER.json');
  started=performance.now();cpu=process.cpuUsage();rss=memory.rss;requests=[];queries=[];histogram.reset();
 });
 console.log('PERFORMANCE_OBSERVER=INSTALLED PID='+process.pid+' TRANSPORT=UNCHANGED QUERY=UNCHANGED');
}
