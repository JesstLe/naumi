import {spawnSync} from 'node:child_process';
// An isolated real Next app and HTTP supplier; no browser route mocks or production credentials.
if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw new Error('Requires isolated loopback database');
const result=spawnSync(process.execPath,['--conditions','react-server','--import','tsx','scripts/imagegen-ui-fixture.ts'],{stdio:'inherit',env:process.env});process.exit(result.status??1);
