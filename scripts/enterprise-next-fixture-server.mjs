// Test-only real Next server. No synthetic login endpoint or session injection.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import next from 'next';
assert(process.env.NAUMI_VERIFY_ISOLATED_DB==='1'&&new URL(process.env.DATABASE_URL).hostname==='127.0.0.1');
assert.equal(await readFile('.enterprise-composition-fixture','utf8'),'owned disposable source copy\n');
const port=Number(process.env.PORT);assert(port>=1024&&port<=65535);
const app=next({dev:true,dir:process.cwd(),hostname:'127.0.0.1',port});await app.prepare();
const handle=app.getRequestHandler(),server=createServer((req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(400);res.end();return;}
 void handle(req,res);
});server.listen(port,'127.0.0.1');await once(server,'listening');
console.log('NEXT_COMPOSITION_READY: real_next=1 synthetic_login_route=0');
let stopping=false;async function stop(){if(stopping)return;stopping=true;await new Promise(r=>server.close(r));await app.close();process.exit(0);}
process.on('message',m=>{if(m==='shutdown')void stop();});process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
