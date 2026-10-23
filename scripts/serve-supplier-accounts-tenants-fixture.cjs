// Real production React components/CSS. Only navigation/auth/API are local fixtures.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), esbuild = require('esbuild');
const port = Number(process.env.FIXTURE_PORT || 14698);
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const now = () => new Date().toISOString();
let requests = [], failure = false, delayed = false;
const account = (id, label, measurement, status = 'ok') => ({ accountId: id, accountLabel: label, identity: 'published_credential', providers: [{ id, name: id === 'a' ? '供应商 A · 演示' : '供应商 B · 演示', enabled: true }], credentialAvailable: true, status,
  measurement, errorCode: status === 'ok' ? null : 'NETWORK_ERROR', checkedAt: status === 'ok' ? now() : null, attemptedAt: now(), source: null, cache: { state: 'hit', expiresAt: now(), persisted: true, refreshLimited: false }, lastKnown: null });
(async () => {
  const bundle = await esbuild.build({ stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import{AdminCenterShell}from'./src/components/admin/center-shell';import{SupplierBalancePage}from'./src/components/admin/model-health/supplier-balance-page';import{TenantUsagePanel}from'./src/components/saas/tenant-usage-panel';import{PlatformConsole}from'./src/components/saas/platform-console';
    window.fixtureErrors=[];window.addEventListener('error',e=>window.fixtureErrors.push(e.message));
    function App(){const [id,setId]=React.useState('${a}'),[revision,setRevision]=React.useState(0),[period,setPeriod]=React.useState(undefined);window.fixtureSetPeriod=setPeriod;window.fixtureSwitchTenant=setId;window.fixtureRefresh=()=>setRevision(v=>v+1);const usage=location.pathname==='/enterprise-usage';return location.pathname.startsWith('/admin/tenants/')?<PlatformConsole view='tenant' tenantId={id}/>:usage?<div style={{padding:20,background:'#f7f9fc',minHeight:'100vh'}}><h1>企业用量 · 界面验收</h1><TenantUsagePanel tenantId={id} enterprise refreshRevision={revision} selectedPeriod={period}/></div>:<AdminCenterShell active='supplier-balances' light><SupplierBalancePage/></AdminCenterShell>};createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, outdir: 'output/supplier-accounts-tenants-20261023/browser-bundle', platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, plugins: [{ name: 'fixture-only-auth-navigation', setup(build) {
      build.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), loader: 'tsx', contents: args.path === 'auth' ? 'export async function authHeader(){return {}}' : args.path === 'next/navigation' ? `export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}export function useRouter(){return {replace:(url)=>location.href=url,push:(url)=>location.href=url}}` : `import React from'react';export default function Link({href,children,prefetch,...rest}){return <a href={href} {...rest}>{children}</a>}` }));
    } }] });
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).contents, css = bundle.outputFiles.find(f => f.path.endsWith('.css')).contents;
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>供应商余额与企业用量 · 本机演示</title><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,'Microsoft Yahei',sans-serif}a{color:inherit;text-decoration:none}button,input{font-family:inherit}h1{font-size:24px}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>`;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://fixture'); const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (u.pathname === '/__control') { failure = u.searchParams.get('failure') === '1'; delayed = u.searchParams.get('delayed') === '1'; return json({ requests, failure, delayed }); }
    if (u.pathname === '/__requests') return json(requests);
    if (u.pathname === '/__stop' && req.method === 'POST') { json({ stopped: true }); server.close(); return; }
    if (u.pathname.startsWith('/api/')) {
      requests.push(u.pathname + u.search);
      if (u.pathname === '/api/admin/fleet/status') return json({}, 404);
      if (failure) return json({ error: 'fixture', code: 'PROVIDER_OPS_UNAVAILABLE' }, 503);
      if (delayed) await new Promise(resolve => setTimeout(resolve, 650));
      if (u.pathname === '/api/admin/bi/provider-ops') return json({ accounts: [account('a', '凭据账户 · 演示 A', { kind: 'account_balance', remaining: 1280.5, used: 219.5, total: null, unlimited: null, unit: null }), account('b', '凭据账户 · 演示 B', { kind: 'api_key_quota', remaining: null, used: 456, total: null, unlimited: true, unit: null })], configVersion: 132, generatedAt: now(), cacheTtlSeconds: 300 });
      if(u.pathname.startsWith('/api/admin/tenants/'))return json({tenant:{tenantId:a,name:'演示企业 A',owner:{name:'演示负责人',email:'owner@example.test'},status:'active',entitlementName:'专业版',validUntil:null,seatLimit:20,activeMembers:8,featurePolicy:{},createdAt:now(),updatedAt:now()},members:[],roles:[],audit:[],usage:{}});
      if (u.pathname.endsWith('/tenant-usage')) return json({ tenantId: u.searchParams.get('tenantId'), scope: 'tenant', fundingModel: 'platform_shared', billingModel: 'member_accounts', period: { from: u.searchParams.get('from'), to: u.searchParams.get('to') }, availability: 'available', creations: 8, chargedCredits: u.searchParams.get('tenantId') === b ? 222 : 17, reservedCredits: 7, settledOperations: 3, pendingOperations: 1, unrecordedCreations: 1, generatedAt: now() });
      return json({ error: 'fixture endpoint not provided' }, 404);
    }
    if (u.pathname === '/fixture.js' || u.pathname === '/fixture.css') { res.setHeader('Content-Type', u.pathname.endsWith('js') ? 'application/javascript' : 'text/css'); res.end(u.pathname.endsWith('js') ? js : css); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  });
  server.listen(port, '127.0.0.1', () => console.log(`SUPPLIER_ACCOUNTS_UI_READY=http://127.0.0.1:${port} REAL_COMPONENTS=1 SUPPLIER_CALLS=0`));
})().catch(error => { console.error(error); process.exitCode = 1; });
