import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

async function main() {
  let gates = 0;
  const secret = 'fixture-worker-middleware-private-secret-20261014';
  const compiled = (await build({ stdin: { contents: 'import {middleware} from "./src/middleware";globalThis.route=middleware;', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'fixture-access-gate', setup(b) {
      b.onResolve({ filter: /^(next\/server|@\/lib\/feature-access\/server|@\/lib\/feature-access\/catalog|@\/lib\/settings-secret)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'next/server' ? 'export const NextResponse={next(){return Response.json({forwarded:true})},redirect(){throw Error("API must not redirect")}};' :
        a.path.endsWith('/settings-secret') ? 'export const workerSecret=()=>globalThis.secret;' : a.path.endsWith('/catalog') ? 'export const requestRequirement=()=>true;' :
        'export const ACCESS_HEADERS={};export const accessJson=(body,status)=>Response.json(body,{status});export const featureRequestGate=async()=>{globalThis.gated();return Response.json({error:"请先登录"},{status:401})};', loader: 'js' }));
    } }] })).outputFiles[0].text;
  const context = vm.createContext({ secret, gated: () => gates++, Buffer, require: createRequire(import.meta.url), Headers, Response }); vm.runInContext(compiled, context);
  const route = (context as any).route;
  const request = (path: string, method = 'GET', credential = secret) => ({ method, nextUrl: { pathname: path }, headers: new Headers({ 'x-video-worker-secret': credential }) });
  assert.equal((await route(request('/api/video/worker/drain-status'))).status, 200); assert.equal(gates, 0);
  for (const [path, method] of [['/api/video/worker/drain-status', 'POST'], ['/api/video/worker/drain-status', 'DELETE'], ['/api/video/worker/drain-status/other', 'GET'], ['/api/video/worker/tick', 'GET'], ['/api/video/projects', 'GET'], ['/api/canvas/video-nodes', 'POST']])
    assert.equal((await route(request(path, method))).status, 401);
  assert.equal((await route(request('/api/video/worker/drain-status', 'GET', 'wrong'))).status, 401);
  assert.equal((await route(request('/api/video/worker/tick', 'POST'))).status, 200);
  assert.equal((await route(request('/api/generate-image', 'POST'))).status, 200);
  console.log('WORKER_DRAIN_MIDDLEWARE=PASS EXACT_GET_SECRET_REQUIRED ALL_OTHER_PATHS_METHODS_STILL_USER_GATED EXISTING_POST_RECOVERY_RETAINED');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
