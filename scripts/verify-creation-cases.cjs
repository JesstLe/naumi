/* Public editorial catalogue/media contract. No DB, credentials or paid calls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {buildSync} = require('esbuild');
const root = path.resolve(process.argv[2] || '.');
const mode = process.argv[3] || 'modified';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const files = ['src/components/home/creation-discovery.tsx','src/app/templates/page.tsx','src/app/video/page.tsx','src/components/video/video-studio-session.tsx'];
if (mode === 'baseline') {
  assert(!fs.existsSync(path.join(root,'src/lib/creation-cases/catalog.json')));
  assert(read(files[0]).includes('TemplatesClient'));
  assert(read(files[1]).includes('TemplatesClient'));
  assert(!read(files[2]).includes('initialCaseId'));
  assert(!read(files[3]).includes('initialPrompt'));
  console.log('BASELINE_PASS public_cases=0 legacy_templates=preserved video_case_seed=absent');
  process.exit(0);
}
const data=JSON.parse(read('src/lib/creation-cases/catalog.json'));
const manifest=JSON.parse(read('public/creation-cases/ATTRIBUTION.json'));
assert.equal(data.length,18); assert.equal(new Set(data.map(c=>c.id)).size,18);
assert.equal(data.filter(c=>c.kind==='image').length,12);assert.equal(data.filter(c=>c.kind==='video').length,6);
const bundle=buildSync({entryPoints:[path.join(root,'src/lib/creation-cases/catalog.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('module','exports',bundle.outputFiles[0].text)(mod,mod.exports);
const {findCreationCase,creationCaseHref,filterCreationCases}=mod.exports;
assert.equal(findCreationCase('../../secret'),undefined);assert.equal(findCreationCase('gold-pendant','video'),undefined);
assert.equal(filterCreationCases('video','','').length,6);
assert.equal(filterCreationCases('all','','  金饰  微距 ').length,1);
assert.equal(filterCreationCases('image','商品摄影','').length,4);
assert.equal(filterCreationCases('all','','not-a-real-case').length,0);
let bytes=0,media=0;
for(const item of data){
  const source=manifest.items.find(x=>x.id===item.id);assert(source);
  for(const [file,sha] of Object.entries(source.files)){
    assert(!file.includes('..'));const buffer=fs.readFileSync(path.join(root,'public',file));
    assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'),sha,file);
    if(file.endsWith('.webp')){assert.equal(buffer.toString('ascii',8,12),'WEBP');}
    bytes+=buffer.length;media++;
  }
  assert(item.width>0&&item.height>0);assert(item.prompt.length>40);assert.equal(item.steps.length,3);
  assert(item.poster.startsWith('/creation-cases/'));assert(item.source.url.startsWith('https://github.com/'));
  const href=new URL(creationCaseHref(item),'https://naumi.test');
  assert(!href.searchParams.has('model'));assert(!href.searchParams.has('gen'));assert(!href.searchParams.has('src'));
  if(item.kind==='image'){
    assert.equal(href.pathname,'/generate');assert.equal(href.searchParams.get('prompt'),item.prompt);
    assert.equal(source.attribution.license,'CC-BY-4.0');
  }else{
    assert.equal(href.pathname,'/video');assert.equal(href.searchParams.get('case'),item.id);
    const file=path.join(root,'public',item.video);
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height,pix_fmt','-show_entries','format=duration','-of','json',file],{encoding:'utf8'});
    assert.equal(probe.status,0,probe.stderr);const info=JSON.parse(probe.stdout);
    assert.equal(info.streams.length,1);assert.equal(info.streams[0].codec_name,'h264');
    assert.equal(info.streams[0].width,item.width);assert.equal(info.streams[0].height,item.height);
    assert.equal(info.streams[0].pix_fmt,'yuv420p');assert(Math.abs(Number(info.format.duration)-item.duration)<.05);
    const decode=spawnSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{encoding:'utf8'});assert.equal(decode.status,0,decode.stderr);
  }
}
assert(bytes<8*1024*1024);
assert(read(files[0]).includes('<TemplateLibrary home'));
assert(read(files[1]).includes('<TemplateLibrary />'));
assert(read(files[2]).includes('findCreationCase(query.case, "video")'));
assert(read(files[3]).includes('prompt:initialPrompt'));
assert(read(files[3]).includes('caseSeed.current!==initialPrompt'));
assert(!read('src/components/templates/creation-case-gallery.tsx').includes('<video'));
assert(read('src/components/templates/template-library.tsx').includes('<TemplatesClient'));
console.log(`MODIFIED_PASS images=12 videos=6 media=${media} hash=PASS decode=PASS routes=PASS legacy_templates=preserved`);
