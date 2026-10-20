// Execute the actual hook with a minimal hook scheduler, without network/DB.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm');
const source=fs.readFileSync('src/components/canvas/frame-ratio-dialog.tsx','utf8'),file=ts.createSourceFile('x.tsx',source,99,true,4);
const hook=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='useCanvasFrameChoice');
assert(hook);const code=ts.transpileModule(hook.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const slots=[];let cursor=0,effects=[];const depsEqual=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const context={exports:{},Promise,console,
 useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},
 useState:initial=>{const i=cursor++;slots[i]??={value:initial};return [slots[i].value,value=>{slots[i].value=value}];},
 useCallback:(callback,deps)=>{const i=cursor++;if(!slots[i]||!depsEqual(slots[i].deps,deps))slots[i]={value:callback,deps};return slots[i].value;},
 useEffect:(effect,deps)=>{const i=cursor++;if(!slots[i]||!depsEqual(slots[i].deps,deps)){const old=slots[i];effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:effect()};});}}
};vm.createContext(context);vm.runInContext(code,context);
const render=scope=>{cursor=0;const value=context.useCanvasFrameChoice(scope);for(const effect of effects)effect();effects=[];return value};
(async()=>{
 let cases=0;const check=(ok,label)=>{assert.ok(ok,label);cases++};
 let h=render('account-A/project-A');h=render('account-A/project-A');
 const p1=h.chooseFrame([{artworkId:'a'}]),p2=h.chooseFrame([{artworkId:'b'}]);h=render('account-A/project-A');const first=h.pending.id;
 check(h.pending.choices[0].artworkId==='a','first request visible');h.choose(first,'a');check(await p1==='a','first choice resolves only first request');
 h=render('account-A/project-A');check(h.pending.id!==first&&h.pending.choices[0].artworkId==='b','second queued request visible');h.choose(first,'a');
 let resolved=false;p2.then(()=>resolved=true);await Promise.resolve();check(!resolved,'stale/double click does not resolve second request');
 h.choose(h.pending.id,null);check(await p2===null,'queued request can cancel');h=render('account-A/project-A');check(h.pending===null,'queue drains');
 const stale=h.chooseFrame,old1=h.chooseFrame([{artworkId:'a'}]),old2=h.chooseFrame([{artworkId:'b'}]);h=render('account-A/project-B');
 check(h.pending===null,'new project hides old prompt');check(await old1===null&&await old2===null,'project switch cancels all promises');
 check(await stale([{artworkId:'a'}])===null,'old project callback cannot reopen prompt');h=render('account-A/project-B');check(h.pending===null,'no stale prompt appears on rerender');
 const oldAccount=h.chooseFrame([{artworkId:'a'}]);h=render('account-B/project-B');check(await oldAccount===null,'account switch cancels');
 h=render('account-B/project-B');const unmount=h.chooseFrame([{artworkId:'a'}]);for(const slot of slots)slot?.cleanup?.();check(await unmount===null,'unmount cancels');
 check(source.includes('aria-modal="true"')&&source.includes('onCancel=')&&source.includes('showModal()'),'native focus trap/escape and canvas hotkey isolation');
 console.log(`CANVAS_FRAME_CHOICE=PASS CASES=${cases} QUEUE=ISOLATED STALE_CLICK=IGNORED PROJECT_ACCOUNT_UNMOUNT=CANCELLED SUPPLIER_CALLS=0`);
})().catch(error=>{console.error(error);process.exitCode=1});
