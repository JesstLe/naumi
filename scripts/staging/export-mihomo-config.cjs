// Reuse the active local Clash config without changing or printing credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('yaml');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Usage: node export-mihomo-config.cjs SOURCE_DIR PRIVATE_OUTPUT_DIR');
const file = path.join(base, 'clash-verge.yaml');
const before = fs.readFileSync(file);
const document = yaml.parseDocument(before.toString('utf8'));
const original = document.toJSON();
// Hex short IDs that look like scientific notation must retain their literal
// source text. YAML numeric coercion would alter credentials during export.
for (let i = 0; i < (original.proxies || []).length; i++) {
  const node = document.get('proxies', true).items[i];
  const reality = node.get('reality-opts', true);
  const short = reality?.get('short-id', true);
  if (short && typeof short.value !== 'string') {
    original.proxies[i]['reality-opts']['short-id'] = short.source;
  }
}
const config = structuredClone(original);
const profiles = yaml.parse(fs.readFileSync(path.join(base, 'profiles.yaml'), 'utf8'));
const selected = profiles.items.find(x => x.uid === profiles.current)?.selected || [];
config['mixed-port'] = 7897;
config['allow-lan'] = false;
config['bind-address'] = '127.0.0.1';
config['log-level'] = 'warning';
config.ipv6 = false;
config['external-controller'] = '';
delete config['external-controller-pipe'];
delete config['external-controller-unix'];
config.secret = crypto.randomBytes(32).toString('hex');
config.tun = { ...config.tun, enable: false, 'auto-route': false, 'dns-hijack': [] };
config.dns = { ...config.dns, listen: '127.0.0.1:1053', ipv6: false, 'enhanced-mode': 'redir-host' };
let applied = 0;
for (const s of selected) {
  const group = config['proxy-groups'].find(g => g.name === s.name);
  if (group?.type === 'select' && group.proxies.includes(s.now)) {
    group.proxies = [s.now, ...group.proxies.filter(n => n !== s.now)];
    applied++;
  }
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'original-runtime.yaml'), before);
const modified = yaml.stringify(config);
fs.writeFileSync(path.join(out, 'MODIFIED_FILE'), modified);
fs.writeFileSync(path.join(out, 'config.yaml'), modified);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sameNodes = JSON.stringify(original.proxies) === JSON.stringify(config.proxies);
const sameRules = JSON.stringify(original.rules) === JSON.stringify(config.rules);
if (!sameNodes || !sameRules || !before.equals(fs.readFileSync(file))) throw new Error('Source/node/rule integrity failed');
const diff = { sourceSha256: sha(before), modifiedSha256: sha(Buffer.from(modified)), fields: {
  'mixed-port': { before: original['mixed-port'], after: 7897 },
  'bind-address': { before: original['bind-address'], after: '127.0.0.1' },
  'allow-lan': { before: original['allow-lan'], after: false },
  'log-level': { before: original['log-level'], after: 'warning' },
  'ipv6': { before: original.ipv6, after: false },
  'external-controller': { after: 'disabled' },
  'external-controller-pipe': { after: 'removed-Windows-only-option' },
  'secret': { after: 'independent-private-value-not-logged' },
  'tun.enable': { after: false },
  'tun.auto-route': { after: false },
  'dns.listen': { after: '127.0.0.1:1053' },
  'dns.enhanced-mode': { after: 'redir-host' },
  'proxy-groups.default-selection': { appliedGroups: applied }
}, nodesUnchanged: sameNodes, rulesUnchanged: sameRules };
fs.writeFileSync(path.join(out, 'DIFF_FILE'), JSON.stringify(diff, null, 2));
for (const name of ['Country.mmdb', 'ASN.mmdb', 'geoip.dat', 'geosite.dat']) {
  fs.copyFileSync(path.join(base, name), path.join(out, name));
}
console.log(`CLASH_CONFIG_EXPORT=PASS NODES=${config.proxies.length} RULES=${config.rules.length} SELECTIONS=${applied} SOURCE_UNCHANGED=1`);
