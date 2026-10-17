const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),cp=require('node:child_process');
const input=process.argv[2]||'src/components/admin/model-management/model-management.tsx',mode=process.argv[3]||'modified';
const source=fs.readFileSync(input,'utf8').replace(/\r\n/g,'\n');
if(mode==='baseline') {
  assert(source.includes('className={styles.rowActions}'));
  assert(source.includes('{r.routes.map((route, index)'));
  assert(source.includes('{r.features.map(f =>'));
  console.log('BASELINE=PASS INLINE_ACTIONS=VISIBLE ALL_ROUTES=VISIBLE ALL_TOOL_TAGS=VISIBLE');
} else {
  assert(source.includes('<ModelMappingCard key={r.id}'));
  assert(!source.includes('className={styles.rowActions}'));
  assert(!source.includes('把模型连接，变简单。'));
  const card=fs.readFileSync('src/components/admin/model-management/model-mapping-card.tsx','utf8');
  assert(card.includes('const [expanded, setExpanded] = useState(false)'));
  assert(card.includes('row.routes.filter(route => route.enabled)'));
  assert(card.includes('row.routes.filter(route => !route.enabled)'));
  assert(card.includes('<details className={styles.disabledRoutes}>'));
  assert(card.includes('price?.credits != null'));
  assert(card.includes('aria-expanded={expanded}'));
  assert(card.includes('row.conditional ? "条件路由 / 回退"'));
  for(const action of ['setRename(r)','setPrice(r)','setRow(r)','setChannelRow(r)','setVideoParameters(r)','setParameters(r)','setResolutionRow(r)','setAdvancedRow(r)','setScope(r)'])assert(source.includes(action),action);
  // Compare the actual mutation/publication helpers and all existing dialogs ASTs to the baseline.
  const baselineFile='output/model-mapping-clarity-20261017/BASELINE.tsx';
  const baseline=(fs.existsSync(baselineFile)?fs.readFileSync(baselineFile,'utf8'):cp.execFileSync('git',['show','e997b290b39fc9df63e4c3b6387fa008b7b0e18d:src/components/admin/model-management/model-management.tsx'],{encoding:'utf8'})).replace(/\r\n/g,'\n');
  const ast=text=>ts.createSourceFile('x.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const functions=text=>{const map=new Map();const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name)map.set(n.name.text,n.getText().replace(/\s+/g,' '));ts.forEachChild(n,visit)};visit(ast(text));return map};
  const old=functions(baseline),now=functions(source);
  for(const [name,body] of old)if(name!=='ModelManagement')assert.equal(now.get(name),body,'unchanged function '+name);
  assert.equal(source.slice(source.indexOf('  async function run('),source.indexOf('  const rows =')),baseline.slice(baseline.indexOf('  async function run('),baseline.indexOf('  const rows =')));
  console.log('MODIFIED=PASS SUMMARY=COLLAPSED INACTIVE_ROUTES=DISCLOSED REAL_ACTIONS=PRESERVED DIALOG_FUNCTIONS=UNCHANGED PUBLICATION=UNCHANGED');
}
console.log('SUPPLIER_CALLS=0 EXIT=0');
