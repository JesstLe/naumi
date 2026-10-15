import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {build} from 'esbuild';
const require=createRequire(import.meta.url),out=path.resolve(process.env.AUTH_LOGIN_OUTPUT||'dist/auth-login/server.cjs');fs.mkdirSync(path.dirname(out),{recursive:true});
await build({entryPoints:['scripts/auth-login-server.ts'],outfile:out,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',alias:{'server-only':path.resolve('scripts/fleet-server-only.cjs'),'next/server':require.resolve('next/server')},tsconfig:'tsconfig.json',logLevel:'warning'});
console.log('AUTH_LOGIN_BUNDLE=PASS BYTES='+fs.statSync(out).size);
