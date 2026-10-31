import assert from 'node:assert/strict';
import {fixtureDatabase} from './fixture';

/** A fixed-image runner owns the isolated PG namespace. Native cases only
 * borrow a verified connection; they never create/drop/stop that parent's DB. */
export function nativeParentDatabaseUrl(env:NodeJS.ProcessEnv=process.env,platform:NodeJS.Platform=process.platform){
 const value=env.NATIVE_FIXTURE_DATABASE_URL;
 if(value===undefined)return undefined;
 assert.equal(platform,'linux','Parent native PG is limited to the fixed Linux fixture');
 assert.equal(env.NAUMI_VERIFY_ISOLATED_DB,'1','Explicit isolated fixture required');
 assert.equal(env.VIDEO_FIXTURE_BUILT_APP_ROOT,'/fixed-app','Fixed full App required');
 assert.match(env.VIDEO_FIXTURE_BUILT_SOURCE_COMMIT||'',/^[a-f0-9]{40}$/,'Fixed App source required');
 assert.match(env.VIDEO_FIXTURE_BUILT_VERSION||'',/^\d{10}$/,'Fixed App version required');
 const url=new URL(value);
 assert.ok(url.protocol==='postgresql:'&&url.hostname==='127.0.0.1'&&/^\/naumi_video_fixture_fixed_[a-f0-9]+$/.test(url.pathname)&&!url.search&&!url.hash,'Exact isolated loopback native PG required');
 return value;
}

export async function connectNativeParentDatabase(){
 const url=nativeParentDatabaseUrl();
 if(url===undefined)return undefined;
 // Existing SQL guard verifies actual database identity and the fixture owner
 // marker before returning a pool. A failed check closes its own pool.
 return {url,pool:await fixtureDatabase(url)};
}
