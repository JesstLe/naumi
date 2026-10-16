#!/usr/bin/env node
// Only reviewed user-facing copy goes into the public catalog. Never read Git logs.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
const {atomicWrite}=(()=>({atomicWrite(file,value){const temp=file+'.tmp-'+process.pid;fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});try{fs.renameSync(temp,file)}catch(e){fs.unlinkSync(temp);throw e}}}))();
const compiled=esbuild.transformSync(fs.readFileSync(path.resolve(__dirname,'../src/lib/public-release-notes.ts'),'utf8'),{loader:'ts',format:'cjs'}).code;
const context={module:{exports:{}},exports:{}};vm.runInNewContext(compiled,context);const validate=context.module.exports.validatePublicReleaseNotes;
function main(){
 const [command,...args]=process.argv.slice(2);const option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1]};
 const target=path.resolve(option('--catalog')||path.resolve(__dirname,'../src/content/public-release-notes.json'));
 const current=validate(JSON.parse(fs.readFileSync(target,'utf8')));
 if(command==='check'){
   const expected=option('--version');if(expected&&!current.some(note=>note.version===expected))throw Error('Current user-facing release requires a reviewed public note');
   console.log(`PUBLIC_NOTES=PASS RECORDS=${current.length} NO_GIT_IMPORT=TRUE`);return;
 }
 if(command!=='append'||!option('--input')||args.includes('--reviewed')===false)throw Error('Usage: append --input reviewed.json --reviewed [--catalog catalog.json]; or check [--version VERSION]');
 const raw=JSON.parse(fs.readFileSync(path.resolve(option('--input')),'utf8'));
 const next=validate([raw])[0];
 if(current.some(note=>note.version===next.version))throw Error('Version is immutable; duplicate update rejected');
 if(Number(next.version)>Math.floor(Date.now()/1000)+300)throw Error('Future version rejected');
 const updated=validate([...current,next]);atomicWrite(target,updated);
 console.log(`PUBLIC_NOTE=ADDED VERSION=${next.version} RECORDS=${updated.length} RELEASE_NOT_DEPLOYED_BY_THIS_COMMAND=TRUE`);
}
try{main()}catch{console.error('PUBLIC_NOTES=REJECTED Check schema, privacy review, version and command options.');process.exitCode=1;}
