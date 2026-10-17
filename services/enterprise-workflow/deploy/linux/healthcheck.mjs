import {readFile,readdir} from 'node:fs/promises';
try {
  const config=process.env.RUNTIME_CONFIG||'/run/enterprise/runtime.json';
  // The API and Worker may share a network namespace. An API response must not
  // make an absent/misconfigured Worker look healthy. Check this PID namespace.
  const processes=[];
  for(const pid of await readdir('/proc'))if(/^\d+$/.test(pid)) {
    try {const argv=(await readFile('/proc/'+pid+'/cmdline','utf8')).split('\0');const at=argv.indexOf('/app/dist/runtime.mjs');if(at>=0&&['serve','worker'].includes(argv[at+1]))processes.push(argv.slice(at+1));}catch{}
  }
  if(processes.length!==1)throw Error('process');
  const argv=processes[0],role=argv[0]==='serve'?'api':'worker';
  if((process.env.RUNTIME_ROLE&&process.env.RUNTIME_ROLE!==role)||argv[argv.indexOf('--config')+1]!==config)throw Error('role/config');
  const c=JSON.parse(await readFile(config,'utf8'));
  const r=await fetch('http://127.0.0.1:'+(role==='worker'?c.workerPort:c.apiPort)+'/readyz',{signal:AbortSignal.timeout(6000)});
  const b=await r.json();
  if(!r.ok||b.ready!==true||b.role!==role||b.installationId!==c.installationId||b.releaseId!==c.releaseId||b.slot!==c.slot)throw Error('not ready');
} catch { process.exitCode=1; }
