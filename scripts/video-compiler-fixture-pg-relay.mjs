// Verification transport only: preserve the fixture's loopback-only DB guard
// while a disposable production container publishes its own loopback Web port.
// This endpoint is the existing local fixture PG, never an arbitrary DB URL.
import assert from 'node:assert/strict';
import {createServer,connect} from 'node:net';
import {spawn} from 'node:child_process';
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
assert.equal(process.platform,'linux');
const database=new URL(process.env.DATABASE_URL);
assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'5432');assert.equal(database.pathname,'/video_compiler_fixture');
const driver=process.argv[2];assert(driver?.startsWith('/evidence/'));
const sockets=new Set();
const proxy=createServer(client=>{
 const upstream=connect({host:'host.docker.internal',port:15579});
 for(const socket of [client,upstream]){sockets.add(socket);socket.on('close',()=>sockets.delete(socket));}
 client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
 client.pipe(upstream).pipe(client);
});
await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(5432,'127.0.0.1',resolve);});
const child=spawn(process.execPath,[driver,...process.argv.slice(3)],{env:process.env,stdio:'inherit'});
try{
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code??1));});
 process.exitCode=code;
}finally{
 for(const socket of sockets)socket.destroy();
 await new Promise(resolve=>proxy.close(resolve));
 console.log('FIXTURE_PG_RELAY_CLEANUP=PASS CHILD_EXIT_OBSERVED=1 SOCKETS_CLOSED=1');
}
