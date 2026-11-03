// Production metadata source + Next icon resolver/renderer; no app startup, DB or HTTP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { resolveIcons } = require('next/dist/lib/metadata/resolvers/resolve-icons');
const { IconsMetadata } = require('next/dist/lib/metadata/generate/icons');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8');
const ast = ts.createSourceFile('layout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = ast.statements.filter(node =>
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'platformMetadata')) ||
  (ts.isFunctionDeclaration(node) && node.name?.text === 'generateMetadata'));
assert.equal(selected.length, 2, 'Expected actual platformMetadata and generateMetadata declarations');
const metadataSource = selected.map(node => node.getText(ast)).join('\n');

function executeModule(code, globals = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, ...globals }, { timeout: 1000 });
  return module.exports;
}

function load(env, siteProfile) {
  const brand = executeModule(fs.readFileSync(path.join(root, 'src/lib/brand.ts'), 'utf8'), { process: { env } });
  return { brand, metadata: executeModule(metadataSource, { ...brand, siteProfile }).generateMetadata };
}

function iconLinks(metadata) {
  const html = renderToStaticMarkup(React.createElement(IconsMetadata, { icons: resolveIcons(metadata.icons) }));
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => ({
    rel: /\brel="([^"]*)"/.exec(tag)?.[1],
    href: /\bhref="([^"]*)"/.exec(tag)?.[1]?.replaceAll('&amp;', '&'),
  }));
  return { html, links };
}

const fixtures = [
  { name: 'default', env: {}, icon: '/brand/naumi/app-dark.png' },
  { name: 'explicit-favicon', env: { NEXT_PUBLIC_BRAND_NAME: 'Custom', NEXT_PUBLIC_BRAND_LOGO: '/custom-logo.png', NEXT_PUBLIC_BRAND_FAVICON: ' https://brand.example/icon.png?v=1&theme=light ' }, icon: 'https://brand.example/icon.png?v=1&theme=light' },
  { name: 'logo-fallback', env: { NEXT_PUBLIC_BRAND_LOGO: ' /custom-logo.png ' }, icon: '/custom-logo.png' },
  { name: 'blank-fallback', env: { NEXT_PUBLIC_BRAND_LOGO: '  ', NEXT_PUBLIC_BRAND_FAVICON: ' ' }, icon: '/brand/naumi/app-dark.png' },
];

(async () => {
  let cases = 0, failed = 0;
  async function check(name, run) {
    cases++;
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
  }
  for (const fixture of fixtures) for (const mode of ['platform', 'enterprise']) {
    await check(`${mode}/${fixture.name}`, async () => {
      let reads = 0;
      const profile = mode === 'platform' ? { mode } : { mode, policy: { brand: 'Fixture 企业' } };
      const { brand, metadata } = load(fixture.env, async () => { reads++; return profile; });
      const result = await metadata();
      assert.equal(reads, 1);
      assert.equal(result.title, mode === 'enterprise' ? 'Fixture 企业' : `${brand.BRAND}- AI创作平台`);
      if (mode === 'enterprise') {
        assert.equal(result.description, 'Fixture 企业创作协作系统');
        assert.equal(result.robots.index, false);
        assert.equal(result.robots.follow, false);
        assert.equal(result.keywords, undefined, 'Do not copy platform SEO into enterprise mode');
      } else {
        assert.ok(result.description.includes(brand.BRAND));
        assert.ok(result.keywords.includes(brand.BRAND));
        assert.equal(result.robots, undefined);
      }
      const { links } = iconLinks(result);
      assert.equal(links.length, 3, `Expected 3 rendered icon links, got ${links.length}`);
      assert.deepEqual(links.map(x => x.rel).sort(), ['apple-touch-icon', 'icon', 'shortcut icon']);
      for (const link of links) assert.equal(link.href, fixture.icon);
    });
  }
  await check('site-profile-error-is-preserved', async () => {
    const original = new Error('FIXTURE_SITE_NOT_CONFIGURED');
    const { metadata } = load({}, async () => { throw original; });
    await assert.rejects(metadata, error => error === original);
  });
  await check('default-icon-is-existing-png', () => {
    const bytes = fs.readFileSync(path.join(root, 'public/brand/naumi/app-dark.png'));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
  });
  console.log(`ENTERPRISE_FAVICON=${failed ? 'FAIL' : 'PASS'} CASES=${cases} FAILED=${failed} NEXT_ICON_RENDER=1 NETWORK=0`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 2; });
