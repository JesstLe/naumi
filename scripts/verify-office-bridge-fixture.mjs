import {readFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import pg from 'pg';import {createLocalOfficeBridge} from './enterprise-office-bridge.mjs';
const out=resolve(process.argv[2]),config=JSON.parse(await readFile(resolve(out,'connection.json'),'utf8'));
if(!config.container?.startsWith('naumi-office-test-')||new URL(config.databaseUrl).hostname!=='127.0.0.1')throw Error('OFFICE_FIXTURE_REQUIRED');
const pool=new pg.Pool({connectionString:config.databaseUrl,max:4}),secret=await readFile(process.env.OFFICE_TEST_SECRET_FILE||'data/enterprise-office-local/engine-secret','utf8');
const bridge=await createLocalOfficeBridge({pool,enterpriseId:config.enterpriseId,blobRoot:resolve('data/enterprise-local-import/blobs'),stateDir:resolve(out,'sessions'),port:18552,engineSecret:secret,allowedOrigins:['http://127.0.0.1:18550']});
bridge.server.listen(18552,'127.0.0.1',()=>console.log('OFFICE_BRIDGE_FIXTURE_READY: port=18552 local_only=1'));
const close=()=>{bridge.server.closeAllConnections();bridge.server.close(()=>void pool.end().then(()=>process.exit(0)));};process.once('SIGINT',close);process.once('SIGTERM',close);
