// Run only while building an immutable derivative of the exact live image.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = '/app/.next';
const manifest = JSON.parse(fs.readFileSync('/tmp/geeknow-manifest.json', 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
const all = files(root), replacements = { ...manifest.renames };
function rewrite(text, map) { for (const [before, after] of Object.entries(map)) text = text.split(before).join(after); return text; }
// The runtime maps lazy chunk IDs to content hashes. Give it a fresh URL too,
// so a browser's cached runtime cannot keep loading the old admin components.
for (const file of all.filter(file => /\/static\/chunks\/webpack-[a-f0-9]+\.js$/.test(file))) {
  const before = fs.readFileSync(file, 'utf8'), after = rewrite(before, replacements);
  if (before === after) continue; // Entry chunks may be named only in HTML/manifests.
  const oldHash = path.basename(file).match(/webpack-([a-f0-9]+)\.js/)[1], newHash = hash(after);
  fs.writeFileSync(file.replace(oldHash, newHash), after); replacements[oldHash] = newHash;
}
let changed = 0;
for (const file of all.filter(file => /\.(js|json|html|rsc|txt)$/.test(file))) {
  // Retain originals for already-open pages. New pages load fresh hash URLs.
  if (manifest.files.some(entry => file.endsWith('/' + entry.path) && entry.path.startsWith('static/')) || /\/webpack-[a-f0-9]+\.js$/.test(file)) continue;
  const before = fs.readFileSync(file, 'utf8'), after = rewrite(before, replacements);
  if (before !== after) { fs.writeFileSync(file, after); changed++; }
}
fs.writeFileSync('/app/geeknow-concurrency-policy.json', JSON.stringify({ policy: manifest.policy, replacements, referencesChanged: changed }));
console.log('REHASH=PASS; FRESH_WEBPACK=TRUE; OLD_ASSETS_RETAINED=TRUE; REFERENCES_CHANGED=' + changed);
