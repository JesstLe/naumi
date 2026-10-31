/** The mixed full-image benchmark's schedule/statistics, not a product queue.
 * Offered arrivals are clock-driven; slow responses never silently lower load. */
export function mixedSchedule(plan,profile){
 if(plan.schemaVersion!==1||!Array.isArray(plan.profiles?.[profile]))throw Error('INVALID_MIXED_PROFILE');
 const phases=[];let offset=0;
 for(const phase of plan.profiles[profile]){
  if(!/^[a-z][a-z0-9_-]*$/.test(phase.id)||!Number.isInteger(phase.seconds)||phase.seconds<1||phase.seconds>7200)throw Error('INVALID_MIXED_PHASE');
  for(const value of [phase.imageRps,phase.mediaRps,plan.readRps,plan.saveRps])if(!Number.isFinite(value)||value<0||value>20)throw Error('INVALID_MIXED_RATE');
  phases.push({...phase,startMs:offset,endMs:offset+phase.seconds*1000});offset+=phase.seconds*1000;
 }
 if(new Set(phases.map(p=>p.id)).size!==phases.length)throw Error('DUPLICATE_MIXED_PHASE');
 const events=[];
 for(const phase of phases)for(const [kind,rate]of [['image',phase.imageRps],['media',phase.mediaRps],['read',plan.readRps],['save',plan.saveRps]])
  for(let i=0;i<Math.floor(phase.seconds*rate+1e-9);i++)events.push({kind,phase:phase.id,atMs:phase.startMs+i*1000/rate});
 events.sort((a,b)=>a.atMs-b.atMs||a.kind.localeCompare(b.kind));
 return{phases,events,durationMs:offset,offered:Object.fromEntries(['image','media','read','save'].map(k=>[k,events.filter(e=>e.kind===k).length]))};
}
export function distribution(values){
 const sorted=values.filter(Number.isFinite).toSorted((a,b)=>a-b),q=p=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;
 return{n:sorted.length,min:sorted[0]??null,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)??null,estimator:'nearest-rank;small-sample tails are not production tail estimates'};
}
export function slope(rows,value){
 if(rows.length<2)return null;const x0=rows[0].atMs,x=rows.map(r=>(r.atMs-x0)/1000),y=rows.map(value),mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length,den=x.reduce((s,v)=>s+(v-mx)**2,0);
 return den?x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/den:null;
}
export function summarizeMixed(events,phases){
 return Object.fromEntries(phases.map(phase=>[phase.id,Object.fromEntries(['plan','accept','receipt','read','save','media-accept','media-receipt'].map(kind=>{const rows=events.filter(e=>e.phase===phase.id&&e.kind===kind);return[kind,{...distribution(rows.map(r=>r.ms)),requests:rows.length,errors:rows.filter(r=>r.error||r.status>=400).length,arrivalLatenessMs:distribution(rows.map(r=>r.lateMs))}]}))]));
}

/** Read-only DB observations,not a replacement for the production claim query.
 * Time-ready does not assert channel eligibility or permission to send. */
export function imageQueueObservation(rows,dbClock,providers,laneCapacity){
 const now=new Date(dbClock).getTime();if(!Number.isFinite(now)||!Array.isArray(providers)||!Number.isInteger(laneCapacity)||laneCapacity<1)throw Error('INVALID_QUEUE_OBSERVATION');
 const generate=rows.filter(row=>row.kind==='generate'),active=row=>!!row.lease_token&&new Date(row.lease_until).getTime()>now;
 const unsent=row=>row.status==='pending'&&row.queue_state==='execution'&&String(row.paid_version)==='1'&&row.unresolved_submission===false;
 const queued=generate.filter(unsent),activeGenerate=generate.filter(active).length;
 const capacity=providers.length?providers.reduce((n,row)=>n+Number(row.max_concurrent),0):null,occupied=providers.length?providers.reduce((n,row)=>n+Number(row.in_flight),0):null;
 if(capacity!==null&&(!Number.isFinite(capacity)||!Number.isFinite(occupied)||capacity<0||occupied<0))throw Error('INVALID_PROVIDER_OCCUPANCY');
 const cooling=queued.filter(row=>!row.lease_token&&new Date(row.lease_until).getTime()>now).length;
 const timeReady=queued.filter(row=>!active(row)&&(!row.lease_until||new Date(row.lease_until).getTime()<=now)).length;
 const free=capacity===null?null:Math.max(0,capacity-occupied),room=activeGenerate<laneCapacity;
 return{dbClock:new Date(now).toISOString(),generateLaneCapacity:laneCapacity,activeGenerate,knownUnsent:queued.length,coolingKnownUnsent:cooling,timeReadyKnownUnsent:timeReady,activeProviderLeases:occupied,providerCapacity:capacity,freeProviderSlots:free,coolingWhileSlotsFree:free===null?null:room&&free>0&&cooling>0,timeReadyWhileSlotsFree:free===null?null:room&&free>0&&timeReady>0,caveat:'One DB snapshot;time-ready does not establish channel eligibility;lease occupancy is not supplier HTTP or hardware utilization'};
}
export function summarizeQueueWaitSamples(samples){
 let observedMs=0,coolingMs=0,timeReadyMs=0,missing=0;
 for(let i=0;i+1<samples.length;i++){
  const a=samples[i],b=samples[i+1],d=a.queueObservation,ms=b.atMs-a.atMs;
  if(!d||d.freeProviderSlots===null){missing++;continue;}
  if(!Number.isFinite(ms)||ms<0)throw Error('INVALID_QUEUE_SAMPLE_ORDER');
  observedMs+=ms;if(d.coolingWhileSlotsFree)coolingMs+=ms;if(d.timeReadyWhileSlotsFree)timeReadyMs+=ms;
 }
 return{observedSeconds:observedMs?observedMs/1000:null,coolingWhileSlotsFreeSeconds:observedMs?coolingMs/1000:null,timeReadyWhileSlotsFreeSeconds:observedMs?timeReadyMs/1000:null,missingIntervals:missing,caveat:'Left-sample intervals,not exact scheduling delay or proof all time-ready tasks are dispatchable;missing historical fields remain unknown'};
}
