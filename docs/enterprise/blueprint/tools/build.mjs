import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esc = x => String(x).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const entries = [];
for (const dir of ['modules', 'shared']) {
  for (const name of (await readdir(resolve(root, dir))).filter(n => n.endsWith('.md')).sort()) {
    const path = `${dir}/${name}`, markdown = (await readFile(resolve(root, path), 'utf8')).replaceAll('\r\n','\n');
    const title = markdown.match(/^# (.+)$/m)?.[1];
    const id = name.startsWith('M') ? name.slice(0, 3) : `S${name.slice(0, 2)}`;
    const metadata = markdown.split('\n').find(l => l.startsWith('服务域：')) || '';
    const dependencies = [...(metadata.split('依赖：')[1] || '').matchAll(/M\d{2}/g)].map(m => m[0]);
    const sources = new Set([...(metadata.split('上游：')[1]?.split('｜')[0] || '').matchAll(/D\d{2}/g)].map(m => m[0]));
    for (const m of metadata.matchAll(/D(\d{2})[—-]D(\d{2})/g)) for (let n=+m[1];n<=+m[2];n++) sources.add(`D${String(n).padStart(2,'0')}`);
    entries.push({ id, path, title, metadata, dependencies, sourceIds: [...sources].sort(), markdown, chars: [...markdown].length });
  }
}
const modules = entries.filter(e => e.id.startsWith('M'));
const shared = entries.filter(e => e.id.startsWith('S'));
const parser = unified().use(remarkParse).use(remarkGfm);
const pathToId = new Map(entries.map(e => [e.path, e.id]));
function render(node, current) {
  const children = () => (node.children || []).map(n => render(n, current)).join('');
  switch (node.type) {
    case 'root': return children();
    case 'text': return esc(node.value);
    case 'paragraph': return `<p>${children()}</p>`;
    case 'heading': return `<h${node.depth}>${children()}</h${node.depth}>`;
    case 'strong': return `<strong>${children()}</strong>`;
    case 'emphasis': return `<em>${children()}</em>`;
    case 'delete': return `<del>${children()}</del>`;
    case 'inlineCode': return `<code>${esc(node.value)}</code>`;
    case 'code': return `<pre><code>${esc(node.value)}</code></pre>`;
    case 'list': return `<${node.ordered ? 'ol' : 'ul'}>${children()}</${node.ordered ? 'ol' : 'ul'}>`;
    case 'listItem': return `<li>${children()}</li>`;
    case 'blockquote': return `<blockquote>${children()}</blockquote>`;
    case 'thematicBreak': return '<hr>';
    case 'break': return '<br>';
    case 'table': return `<div class="table-wrap"><table>${node.children.map((row, i) => `<tr>${row.children.map(cell => `<${i ? 'td':'th'}>${cell.children.map(n => render(n,current)).join('')}</${i ? 'td':'th'}>`).join('')}</tr>`).join('')}</table></div>`;
    case 'link': {
      const target = relative(root, resolve(root, dirname(current.path), node.url.split('#')[0])).replaceAll('\\', '/');
      const linkedId = pathToId.get(target);
      const safe = /^https?:\/\//.test(node.url) ? node.url : linkedId ? `#${linkedId}` : null;
      return safe ? `<a href="${esc(safe)}">${children()}</a>` : children();
    }
    default: return children();
  }
}
for (const entry of entries) entry.html = render(parser.parse(entry.markdown), entry);
const workPackages = JSON.parse(await readFile(resolve(root, 'work-packages.json'), 'utf8'));
const manifest = { version: '0.1', date: '2026-10-16', stage: 'design-review', moduleCount: modules.length,
  sharedCount: shared.length, workPackageCount: Object.values(workPackages).reduce((n,a) => n+a.length, 0),
  confirmed: ['钉钉', '聚水潭', '需求在本系统填表并按表归属', '当前4核8GB，可升级'],
  modules: modules.map(({markdown,html,...rest})=>rest), shared: shared.map(({markdown,html,...rest})=>rest) };
await writeFile(resolve(root, 'manifest.json'), JSON.stringify(manifest,null,2)+'\n');

let readme = `# 企业电商协作平台详细建设方案\n\n版本：v0.1评审稿｜日期：2026-10-16｜**状态：方案，不代表业务已经实现/上线。**\n\n`;
readme += `本方案含 **${modules.length}份独立模块文档、${shared.length}份共享规范、128项开发工作包**。每模块写清职责、页面、字段/来源、状态、联动、权限、接口事件、异常验收和开发工作包。\n\n`;
readme += `## 已确认输入\n\n- 公司使用钉钉、聚水潭及待盘点其他系统；名称确认不代表接口权限已取得。\n- 现有需求在钉钉填表；目标直接在本系统填，按表单业务字段决定承接归属，不再双填。\n- 需求负责人/承接团队/执行人/验收人分开，匹配异常进入待分配队列。\n- 当前4核8GB，允许需要时升级；32逻辑模块不等于32微服务，不为省资源牺牲完整业务。\n\n`;
readme += `## 推荐阅读\n\n- [离线完整阅读版](portal.html)：单HTML内含所有正文，可搜索/切换；不需联网或服务器。\n- [总体架构](shared/00-overall-architecture.md) → [表单归属样例](shared/11-routing-form-example.md) → [公司使用场景](shared/04-company-scenarios.md)。\n- 开发按[实施计划](shared/06-delivery-roadmap.md)、[工作分解](shared/12-work-breakdown.md)、[API事件](shared/03-api-events.md)和[验收矩阵](shared/08-acceptance-matrix.md)推进。\n- IT/数据人员先读[数据源](shared/01-data-sources.md)、[权限责任](shared/05-permissions-raci.md)和[资源升级](shared/07-capacity-upgrade.md)。\n\n`;
readme += `## 32份模块目录\n\n| 模块 | 内容 | 直接依赖 | 数据来源 |\n| --- | --- | --- | --- |\n`;
for (const e of modules) readme += `| ${e.id} | [${e.title.replace(/^M\d{2} /,'')}](${e.path}) | ${e.dependencies.join('、') || '无'} | ${e.sourceIds.join('、')} |\n`;
readme += `\n## 共享规范\n\n`+shared.map(e=>`- [${e.title}](${e.path})`).join('\n')+'\n';
readme += `\n## 实施顺序\n\nP0样本/权限/归属/资源确认 → P1系统表单、归属、拆单、认领、执行、评审/验收、签收和证据 → P2自动接入/规模化/绩效影子核算 → P3受控发布、经营效果、外包和公司推广。\n\n当前仅已有独立工作流基础和现有Naumi能力；新业务页面/生产适配/完整绩效均待开发。未确认的制度、容量和SLO是建议，详见[决策登记](shared/10-decisions-questions.md)。\n\n`;
readme += '## 文档维护与校验\n\n```sh\nnode docs/enterprise/blueprint/tools/build.mjs\nnode docs/enterprise/blueprint/tools/verify.mjs\n```\n\n从仓库根目录执行，生成目录/manifest/离线阅读版并校验文档结构、链接、依赖、数据源和工作包；不调用生产/外部接口。模块正文为人工细化设计，构建工具只负责汇编，不用通用模板替代业务内容。\n';
await writeFile(resolve(root,'README.md'), readme);

const escapeScript = JSON.stringify(entries.map(({id,title,path,metadata,markdown,html})=>({id,title,path,metadata,markdown,html}))).replaceAll('<','\\u003c');
const home = `<h1>企业电商协作平台 · 建设方案</h1><p class="muted">2026-10-16 · v0.1评审稿 · 不是已上线功能</p><div class="stats"><div><b>32</b>模块文档</div><div><b>13</b>共享规范</div><div><b>128</b>工作包</div><div><b>4核8GB</b>起步，可升级</div></div><div class="callout">钉钉：身份/组织与通知拟接入。聚水潭：店铺、商品与SKU拟接入。新需求直接在本系统填表，按表归属，匹配异常进入待分配；具体API能力待验证。</div><h2>第一条业务闭环</h2><div class="flow">${['系统填表','按表归属','受理/拆单','指派/认领','执行/交付','评审/验收','签收/留证','绩效复核'].map((s,i)=>`<span><small>${String(i+1).padStart(2,'0')}</small>${s}</span>`).join('')}</div><h2>先读这些</h2><div class="cards">${shared.filter(e=>['S00','S11','S04','S06','S07','S01'].includes(e.id)).map(e=>`<a href="#${e.id}"><strong>${esc(e.title)}</strong><small>${esc(e.path)}</small></a>`).join('')}</div><h2>使用说明</h2><p>左侧选择模块或规范；搜索同时检索正文。每模块包含10个章节与4项工作包。所有正文已内嵌在这个HTML，离线也可阅读；文件名与Markdown目录一致。</p><p>32个逻辑模块按领域组合部署，不创建32个空服务。先跑通真实多人业务，绩效规则和资源参数经公司确认/实测后启用。</p>`;
const portal = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>企业电商协作平台详细方案</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#26344a;font:14px/1.8 Inter,"Microsoft YaHei",sans-serif}header{background:white;border-bottom:1px solid #e2e8f0;padding:14px 24px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:2}header b{font-size:17px}header small{color:#63738c}input{font:inherit;padding:8px 12px;border:1px solid #ccd7e7;border-radius:8px;min-width:220px;margin-left:auto}main{max-width:1520px;margin:auto;display:grid;grid-template-columns:300px minmax(0,1fr)}nav{padding:20px 12px;position:sticky;top:65px;height:calc(100vh - 65px);overflow:auto}nav a{display:block;padding:8px 10px;border-radius:7px;color:#435570;text-decoration:none;line-height:1.5;margin:2px 0}nav a:hover,nav a.active{background:#e8effc;color:#2458aa}nav h3{font-size:12px;color:#75839a;padding-left:10px;margin:20px 0 8px}article{background:#fff;margin:24px;padding:28px 36px;min-width:0;border:1px solid #e4e9f2;border-radius:12px;min-height:500px}h1{font-size:26px;line-height:1.45;margin:0 0 12px}h2{font-size:19px;margin-top:30px;padding-bottom:6px;border-bottom:1px solid #e7edf5}h3{font-size:16px}p,li{overflow-wrap:anywhere}a{color:#245db7}code{font:12px/1.6 Consolas,monospace;background:#eef3f9;padding:2px 5px;border-radius:4px}pre{background:#f1f5fa;padding:16px;border-radius:9px;overflow:auto}pre code{padding:0;background:none}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:520px;font-size:13px}th,td{border:1px solid #dce4ef;padding:9px 10px;text-align:left;vertical-align:top}th{background:#f0f4fa;color:#415774}.muted{color:#77839a}.callout{background:#edf4ff;padding:16px;border-left:3px solid #5c86d5;border-radius:7px;margin:18px 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stats div{background:#f4f7fb;padding:16px;border-radius:9px}.stats b{display:block;color:#285eae;font-size:23px}.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.flow span{background:#f4f7fb;border:1px solid #e4ebf4;border-radius:8px;padding:12px}.flow small{display:block;color:#6683b5}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.cards a{padding:16px;border:1px solid #dce6f5;border-radius:9px;text-decoration:none}.cards small{display:block;color:#8794a9;font-size:11px}.source{margin-top:28px;color:#8490a5;font-size:12px}.mobile-menu{display:none}button{padding:7px 10px;background:#fff;border:1px solid #cfd9e8;border-radius:6px;color:#315580;cursor:pointer}@media(max-width:760px){header{padding:12px;flex-wrap:wrap}header small{display:none}input{width:100%;min-width:0;order:3}main{display:block}nav{display:none;position:static;height:auto;max-height:360px}nav.open{display:block}.mobile-menu{display:inline-block;margin-left:auto}article{padding:20px 16px;margin:12px}.stats{grid-template-columns:1fr 1fr}.flow{grid-template-columns:1fr 1fr}.cards{grid-template-columns:1fr}h1{font-size:22px}}@media print{header,nav{display:none}main{display:block}article{border:0;margin:0;padding:0}body{background:#fff}.table-wrap{overflow:visible}table{min-width:0}}
</style></head><body><header><b>企业详细方案</b><small>32模块 · 13规范 · 128工作包</small><button class="mobile-menu" id="menu" aria-label="展开文档目录">目录</button><input id="search" type="search" aria-label="搜索文档标题与正文" placeholder="搜索模块、字段、规则…"></header><main><nav id="nav" aria-label="文档目录"></nav><article id="article">${home}</article></main><script id="documents" type="application/json">${escapeScript}</script><script>
const docs=JSON.parse(document.getElementById('documents').textContent);const home=${JSON.stringify(home).replaceAll('<','\\u003c')};const nav=document.getElementById('nav');const article=document.getElementById('article');let query='';function drawNav(){nav.innerHTML='<a href="#home">总览</a>';for(const group of [['模块方案','M'],['共享规范','S']]){const matched=docs.filter(d=>d.id.startsWith(group[1])&&(!query||(d.title+' '+d.markdown).toLowerCase().includes(query)));if(matched.length){const h=document.createElement('h3');h.textContent=group[0]+' · '+matched.length;nav.append(h);for(const d of matched){const a=document.createElement('a');a.href='#'+d.id;a.textContent=d.title;if(location.hash==='#'+d.id)a.className='active';nav.append(a);}}}}function show(){const id=location.hash.slice(1)||'home';const d=docs.find(d=>d.id===id);article.innerHTML=d?d.html+'<div class="source"></div>':home;if(d)article.querySelector('.source').textContent='文档路径：'+d.path+' · 评审稿/未代表上线';document.title=d?d.title+' · 企业方案':'企业电商协作平台详细方案';drawNav();nav.classList.remove('open');window.scrollTo(0,0)}document.getElementById('search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();drawNav()});document.getElementById('menu').onclick=()=>nav.classList.toggle('open');window.addEventListener('hashchange',show);show();console.log('PORTAL_READY modules='+docs.filter(d=>d.id.startsWith('M')).length+' shared='+docs.filter(d=>d.id.startsWith('S')).length);
</script></body></html>`;
await writeFile(resolve(root,'portal.html'),portal);
console.log(`BLUEPRINT_BUILD_PASS: modules=${modules.length} shared=${shared.length} work_packages=${manifest.workPackageCount} offline_documents=${entries.length}`);
