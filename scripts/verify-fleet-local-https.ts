import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {localFleetStatus} from '../src/lib/fleet/local-status';

const script=fileURLToPath(import.meta.url);
async function run(command:string,args:string[],env:NodeJS.ProcessEnv=process.env){
  return new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',data=>stdout+=String(data));child.stderr.on('data',data=>stderr+=String(data));
    child.on('error',reject);child.on('close',code=>resolve({code:code??-1,stdout,stderr}));
  });
}
/** Generate a disposable TLS fixture and exercise the native local-status transport across host, trust, redirect and size boundaries, or run one child probe. */
async function main(){
  if(process.argv[2]==='probe'){
    globalThis.fetch=async()=>{throw Error('TLS_FIXTURE_NATIVE_TRANSPORT_REQUIRED');};
    console.log(JSON.stringify(await localFleetStatus('s3')));return;
  }
  const directory=await mkdtemp(path.join(tmpdir(),'fleet-local-https-'));
  const certificate=path.join(directory,'fixture-ca.crt'),key=path.join(directory,'fixture-server.key');
  let assertions=0,mode:'version'|'redirect'|'oversized'='version';const hits:{host:string;url:string;sni:string|false}[]=[];
  const check=(value:unknown,message:string)=>{assert.ok(value,message);assertions++;};
  const openssl=process.env.OPENSSL_BIN||(process.platform==='win32'&&existsSync('D:/DEV/Git/usr/bin/openssl.exe')?'D:/DEV/Git/usr/bin/openssl.exe':'openssl');
  const generated=await run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',certificate,'-days','1','-subj','/CN=local-status.fixture.test','-addext','subjectAltName=DNS:local-status.fixture.test,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE']);
  assert.equal(generated.code,0,generated.stderr);
  const server=createServer({key:await readFile(key),cert:await readFile(certificate)},(request,response)=>{
    hits.push({host:request.headers.host??'',url:request.url??'',sni:(request.socket as import('node:tls').TLSSocket).servername||false});
    if(mode==='redirect'){response.writeHead(308,{location:'/redirect-must-not-be-followed'});response.end();return;}
    response.writeHead(200,{'content-type':'application/json'});
    response.end(mode==='oversized'?JSON.stringify({commit:'c'.repeat(40),version:123,extra:'x'.repeat(3000)}):JSON.stringify({commit:'c'.repeat(40),version:123}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  /** Launch a local-status child with the requested Host identity and optional fixture CA trust, returning JSON only on a successful exit. */
  const probe=async(host:string,trusted=true)=>{
    const env:NodeJS.ProcessEnv={...process.env,FLEET_SINGLE_APP_ORIGIN:`https://127.0.0.1:${port}`,FLEET_SINGLE_APP_HOST:host};
    delete env.NODE_EXTRA_CA_CERTS;if(trusted)env.NODE_EXTRA_CA_CERTS=certificate;
    const result=await run(process.execPath,['node_modules/tsx/dist/cli.mjs','--conditions','react-server',script,'probe'],env);
    assert.equal(result.code,0,result.stderr);return JSON.parse(result.stdout.trim());
  };
  try{
    check((await probe('local-status.fixture.test')).source==='c'.repeat(40),'trusted DNS Host verifies selected identity over loopback transport');
    check(hits.length===1&&hits[0].host==='local-status.fixture.test'&&hits[0].url==='/api/version'&&hits[0].sni==='local-status.fixture.test','HTTPS carries explicit Host and DNS SNI');
    check((await probe('127.0.0.1')).source==='c'.repeat(40),'IP Host validates IP subjectAltName');
    check(hits.length===2&&hits[1].host==='127.0.0.1'&&hits[1].sni===false,'IP identity sends no IP SNI');
    check((await probe('wrong.fixture.test')).source==='unknown'&&hits.length===2,'SAN mismatch rejected before HTTP');
    check((await probe('local-status.fixture.test',false)).source==='unknown'&&hits.length===2,'untrusted certificate rejected before HTTP');
    mode='redirect';check((await probe('local-status.fixture.test')).source==='unknown'&&hits.length===3,'308 rejected without second request');
    mode='oversized';check((await probe('local-status.fixture.test')).source==='unknown'&&hits.length===4,'2KB bound enforced by native HTTPS transport');
    console.log(`FLEET_LOCAL_HTTPS=PASS assertions=${assertions} REAL_TLS=1 TRUST_CHAIN=1 DNS_HOST_IDENTITY=1 IP_SAN=1 IP_SNI=0 MISMATCH_UNKNOWN=1 UNTRUSTED_UNKNOWN=1 REDIRECT_FOLLOWED=0 OVERSIZE_UNKNOWN=1`);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
