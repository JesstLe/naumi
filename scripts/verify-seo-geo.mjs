import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const baseline = process.argv.includes('--baseline');
const production = process.argv.includes('--production');
const rootArg = process.argv.find(a => a.startsWith('--root='));
const root = rootArg ? resolve(rootArg.slice(7)) : process.cwd();
const port = Number(process.env.SEO_TEST_PORT || 3037);
const external = process.env.SEO_TEST_URL;
const evidence = process.env.SEO_EVIDENCE;
let count = 0;
function check(value, message) { assert.ok(value, message); count++; }
function get(path, host = 'naumi.top', agent = 'bingbot') {
  const target = external ? new URL(path, external) : new URL(`http://127.0.0.1:${port}${path}`);
  return new Promise((res, rej) => {
    const req = request(target, { headers: { host, 'user-agent': agent } }, r => {
      let body = ''; r.setEncoding('utf8'); r.on('data', d => body += d);
      r.on('end', () => res({ status: r.statusCode, headers: r.headers, body }));
    });
    req.on('error', rej); req.setTimeout(120000, () => req.destroy(new Error(`timeout: ${path}`))); req.end();
  });
}
const delay = ms => new Promise(r => setTimeout(r, ms));
const next = resolve('node_modules/next/dist/bin/next');
const child = external ? null : spawn(process.execPath, [next, production ? 'start' : 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: root, env: { ...process.env, DATABASE_URL: '', OPENAI_API_KEY: 'local-fixture-no-provider-requests', NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: production ? '.next-seo-build' : '.next-seo-test', NAUMI_ENTERPRISE_DEPLOYMENT_MODE: 'shared', FLEET_PORTAL_ONLY: '0', NAUMI_VIDEO_WORKER_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let logs = ''; child?.stdout.on('data', d => logs += d); child?.stderr.on('data', d => logs += d);
const receipts = [];
async function fetchPage(path, host) { const r = await get(path, host); receipts.push({ path, host: host || 'naumi.top', status: r.status, headers: r.headers, body: r.body }); return r; }
try {
  if (child) {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(`Next exited ${child.exitCode}\n${logs}`);
      if (/Ready in/.test(logs)) { ready = true; break; }
      await delay(500);
    }
    check(ready, 'Next ready');
  }
  if (baseline) {
    for (const path of ['/sitemap.xml', '/llms.txt', '/guides']) {
      const r = await fetchPage(path); check(r.status === 404, `${path} baseline missing`);
    }
    const r = await fetchPage('/'); check(r.status === 200, 'baseline homepage');
    check(!r.body.includes('rel="canonical"'), 'baseline canonical missing');
    check(!r.body.includes('application/ld+json'), 'baseline schema missing');
    console.log('BASELINE_SEO=CONFIRMED sitemap=404 llms=404 guides=404 canonical=absent jsonld=absent home=200');
  } else {
    const { guides, publicPages, publicRobots, isPublicSeoHost, serializeJsonLd, guideJsonLd, homeJsonLd } = await import('../src/lib/seo/catalog.ts');
    for (const h of ['naumi.top','NAUMI.TOP','www.naumi.top','naumi.top:3000']) check(isPublicSeoHost(h), `official ${h}`);
    for (const h of ['evil.test','naumi.top.evil.test','evil@naumi.top','naumi.top/','localhost',null]) check(!isPublicSeoHost(h), `nonofficial ${h}`);
    check(!isPublicSeoHost('naumi.top', true), 'enterprise excluded'); check(!isPublicSeoHost('naumi.top', false, true), 'fleet excluded');
    check(!serializeJsonLd({ value: '</script><script>alert(1)</script>' }).includes('<'), 'JSON-LD escaping');
    check(!JSON.stringify(homeJsonLd()).includes('aggregateRating'), 'no invented ratings');
    const paths = publicPages.map(p => p.path);
    for (const path of paths) {
      const r = await fetchPage(path); check(r.status === 200, `${path} 200`);
      const head = r.body.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
      const canonical = head.match(/rel="canonical" href="([^"]+)"/)?.[1];
      check(canonical && new URL(canonical).href === `https://naumi.top${path}`, `${path} canonical`);
      check(/name="description" content="[^"]{10,}"/.test(head), `${path} description`);
      check(/name="robots" content="index, follow"/.test(head), `${path} index`);
      check(head.includes('property="og:image"'), `${path} OG`);
      check(head.includes('name="twitter:card" content="summary_large_image"'), `${path} twitter`);
      check((r.body.match(/<h1[\s>]/g) || []).length === 1, `${path} single h1`);
      if (path === '/') check(r.body.includes('href="/guides"'), 'home server-rendered guide link');
      if (path.startsWith('/guides/')) {
        const data = JSON.parse(r.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        const guide = guides.find(g => path.endsWith(g.slug));
        check(JSON.stringify(data) === JSON.stringify(guideJsonLd(guide)), `${path} schema source`);
        for (const q of guide.questions) { check(r.body.includes(q.question), 'visible question'); check(r.body.includes(q.answer), 'visible answer'); }
        for (const section of guide.sections) for (const paragraph of section.body) check(r.body.includes(paragraph), 'SSR body not client-only');
      }
    }
    const xml = await fetchPage('/sitemap.xml'); check(xml.status === 200, 'sitemap 200');
    check(xml.headers['content-type'].includes('xml'), 'XML content type');
    check((xml.body.match(/<loc>/g) || []).length === publicPages.length, 'sitemap allowlist only');
    for (const p of paths) check(xml.body.includes(`https://naumi.top${p === '/' ? '/' : p}</loc>`), 'sitemap path');
    const robots = await fetchPage('/robots.txt'); check(robots.status === 200, 'robots 200');
    check(robots.body.includes('Sitemap: https://naumi.top/sitemap.xml'), 'sitemap discovery');
    const rules = publicRobots(true).rules;
    const robotAllowed = path => rules.allow.some(pattern => new RegExp('^' + pattern.replaceAll('.', '\\.').replaceAll('*', '.*')).test(path));
    for (const p of paths) check(robotAllowed(p), `crawl public ${p}`);
    for (const p of ['/api/creations', '/canvas?project=private', '/admin', '/account', '/works', '/media/private.png', '/dashboard', '/sign-in', '/guides/unknown', '/guides?tracking=1']) check(!robotAllowed(p), `do not crawl private ${p}`);
    const llms = await fetchPage('/llms.txt'); check(llms.status === 200, 'llms 200');
    check(llms.headers['content-type'].includes('text/plain'), 'llms text type');
    for (const p of paths) check(llms.body.includes(`https://naumi.top${p === '/' ? '/' : p}`), 'AI references public pages');
    for (const p of ['/llms.txt','/guides','/guides/ai-product-images']) { const r = await fetchPage(p, 'unrelated.example'); check(r.status === 404, 'nonofficial no public guide'); }
    const otherHome = await fetchPage('/', 'unrelated.example');
    check(/name="robots" content="noindex, nofollow"/.test(otherHome.body), 'other home noindex');
    check(!otherHome.body.includes('application/ld+json'), 'no Naumi schema on other host');
    const otherSitemap = await fetchPage('/sitemap.xml','unrelated.example'); check(!otherSitemap.body.includes('<loc>'), 'other sitemap empty');
    const otherRobots = await fetchPage('/robots.txt','unrelated.example'); check(otherRobots.body.includes('Disallow: /') && !otherRobots.body.includes('Sitemap:'), 'other host robots closed');
    const unknown = await fetchPage('/guides/does-not-exist'); check(unknown.status === 404, 'unknown guide 404');
    for (const p of ['/sign-in','/setup']) { const r = await fetchPage(p); check(r.body.includes('noindex'), 'private default noindex'); }
    const query = await fetchPage('/guides/ai-product-images?utm_source=fixture'); check(query.body.includes('rel="canonical" href="https://naumi.top/guides/ai-product-images"'), 'query canonical stripped');
    const image = await fetchPage('/brand/naumi/social-card.png'); check(image.status === 200, 'share image exists');
    for (const agent of ['bingbot','Twitterbot','OAI-SearchBot','ChatGPT-User','Claude-SearchBot','PerplexityBot']) {
      const r = await get('/', 'naumi.top', agent);
      check(r.status === 200, `${agent} home 200`);
      check(/rel="canonical"/.test(r.body.match(/<head>([\s\S]*?)<\/head>/)?.[1] || ''), `${agent} metadata in head, not streamed late`);
    }
    console.log(`SEO_GEO=PASS checks=${count} public_pages=${paths.length} guides=${guides.length} private_indexing=disabled provider_calls=0`);
  }
} finally {
  if (evidence) {
    writeFileSync(join(evidence, baseline ? 'baseline-http.json' : 'modified-http.json'), JSON.stringify(receipts, null, 2));
    writeFileSync(join(evidence, baseline ? 'baseline-next.log' : 'modified-next.log'), logs);
  }
  if (child && child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), delay(8000)]); }
}
