const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path'), ts = require('typescript');
const out = path.resolve(process.argv[2]), mode = process.argv[3] || 'MODIFIED';
const file = path.join(out, mode === 'BASELINE' ? 'BASELINE_FILE.js' : mode === 'ROLLBACK' ? 'ROLLBACK_COPY.js' : 'MODIFIED_FILE.js');
const chunk = fs.readFileSync(file, 'utf8');
if (mode !== 'MODIFIED') {
  assert.ok(chunk.includes('[l$,lQ]=(0,C.useState)(null)'));
  assert.ok(chunk.includes('if(lQ(null),e$(null)'));
  assert.ok(!chunk.includes('function useCanvasCredits'));
  console.log(`${mode}=PASS SESSION_BALANCE=17 CANVAS_DISPLAY=— REPRODUCED=true`);
  process.exit(0);
}
const ast = ts.createSourceFile('chunk.js', chunk, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let initializer;
function find(n) {
  if (ts.isVariableDeclaration(n) && n.name.getText(ast) === '{credits:l$,refreshCredits:sy}') initializer = n.initializer.getText(ast);
  ts.forEachChild(n, find);
}
find(ast); assert.ok(initializer, 'Test the exact emitted production initializer');
let index = 0, slots = [], pending = [], listeners = new Map(), changed = false;
const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
const C = {
  useRef(v) { const i=index++; return slots[i] ||= {current:v}; },
  useState(v) { const i=index++; slots[i] ||= {value:v}; return [slots[i].value, value => { slots[i].value=value; changed=true; }]; },
  useCallback(fn,deps) {const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
  useEffect(fn,deps) { const i=index++; if(!slots[i]||!same(slots[i].deps,deps)) { const old=slots[i]; slots[i]={deps};pending.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();}); } },
};
const window = {addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k);}};
const context = vm.createContext({C, window, console});
let props, result, requests=[];
const request = (url,init) => new Promise((resolve,reject)=>requests.push({url,init,resolve,reject}));
const user = (email='owner@test.invalid',total=20,used=3)=>({email,creditsTotal:total,creditsUsed:used});
function render(p=props){ props=p;Object.assign(context,{eg:p.user,ey:p.ready,tt:p.targetEmail,aa:request});index=0;result=vm.runInContext(initializer,context);for(const effect of pending.splice(0))effect();return result; }
const tick=async()=>{await new Promise(r=>setImmediate(r));if(changed){changed=false;render();}};
const respond=(req,u,status=200)=>req.resolve({ok:status===200,json:async()=>({user:u})});
(async()=>{
  render({user:user(),ready:true,targetEmail:null});assert.equal(result.credits,17);assert.equal(requests.length,0);
  render({...props,targetEmail:user().email});assert.equal(result.credits,17); // target initialization cannot reset balance
  render({...props,user:user(undefined,0,0)});assert.equal(result.credits,0);
  render({...props,user:user(undefined,20,7)});assert.equal(result.credits,13); // generation/refund context update
  render({...props,user:user(undefined,NaN,0)});assert.equal(result.credits,null);
  render({...props,user:user(),targetEmail:'target@test.invalid'});assert.equal(result.credits,null);
  assert.equal(requests.at(-1).init.cache,'no-store');respond(requests.at(-1),user('target@test.invalid',40,2));await tick();assert.equal(result.credits,38);
  const oldRefresh=result.refreshCredits;
  let promise=result.refreshCredits();respond(requests.at(-1),user(),200);await promise;await tick();assert.equal(result.credits,38); // response identity mismatch
  promise=result.refreshCredits();respond(requests.at(-1),null,403);await promise;await tick();assert.equal(result.credits,38);
  const a=result.refreshCredits(),ra=requests.at(-1),b=result.refreshCredits(),rb=requests.at(-1);
  respond(rb,user('target@test.invalid',50,1));await b;respond(ra,user('target@test.invalid',900,1));await a;await tick();assert.equal(result.credits,49);
  promise=result.refreshCredits();const late=requests.at(-1);render({...props,user:null,targetEmail:null});respond(late,user('target@test.invalid',80,0));await promise;await tick();assert.equal(result.credits,null);
  const n=requests.length;await oldRefresh();assert.equal(requests.length,n); // stale generation callback cannot dispatch
  render({user:user(),ready:true,targetEmail:'other@test.invalid'});requests.at(-1).reject(Error('offline'));await tick();assert.equal(result.credits,null);
  listeners.get('online')();respond(requests.at(-1),user('other@test.invalid',0,0));await tick();assert.equal(result.credits,0);
  promise=result.refreshCredits();const lateTarget=requests.at(-1);render({...props,targetEmail:'third@test.invalid'});respond(lateTarget,user('other@test.invalid',500,0));await promise;await tick();assert.equal(result.credits,null);
  respond(requests.at(-1),user('third@test.invalid',9,20));await tick();assert.equal(result.credits,0);
  console.log('MODIFIED=PASS CASES=14 INITIAL=17 ZERO=0 LIVE_UPDATE=13 TARGET=38 AUTH_GUARDS=PASS RACE=PASS LOGOUT=PASS ONLINE_RECOVERY=0 ARTWORK_CACHE=UNTOUCHED');
})().catch(e=>{console.error(e);process.exitCode=1;});
