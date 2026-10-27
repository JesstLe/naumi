const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const target = path.join(root, 'index.html');
let html = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync(path.join(root, 'subpages.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'subpages.js'), 'utf8');
const style = `/* SUBPAGES_STYLE_START */\n${css}\n/* SUBPAGES_STYLE_END */`;
const script = `<!-- SUBPAGES_SCRIPT_START -->\n<script>\n${js}\n</script>\n<!-- SUBPAGES_SCRIPT_END -->`;
html = /\/\* SUBPAGES_STYLE_START \*\/[\s\S]*?\/\* SUBPAGES_STYLE_END \*\//.test(html)
  ? html.replace(/\/\* SUBPAGES_STYLE_START \*\/[\s\S]*?\/\* SUBPAGES_STYLE_END \*\//, () => style)
  : html.replace('</style>', () => style + '\n</style>');
html = /<!-- SUBPAGES_SCRIPT_START -->[\s\S]*?<!-- SUBPAGES_SCRIPT_END -->/.test(html)
  ? html.replace(/<!-- SUBPAGES_SCRIPT_START -->[\s\S]*?<!-- SUBPAGES_SCRIPT_END -->/, () => script)
  : html.replace('</body>', () => script + '\n</body>');
fs.writeFileSync(target, html);
console.log('ADMIN_PREVIEW_BUILT bytes=' + Buffer.byteLength(html));
