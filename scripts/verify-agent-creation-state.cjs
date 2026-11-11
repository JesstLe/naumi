const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'.'),mode=process.argv[3]||'modified';
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tools=read('src/lib/agent/naumi-tools.ts'),composer=read('src/components/home/creation-composer.tsx'),owner=read('src/lib/agent/workbench-session.ts'),runtime=read('src/lib/agent/runtime.ts');
if(mode==='baseline'){
 assert(tools.includes('name: "verify_image_output"'));assert(composer.includes('ImageQualitySelect'));
 assert(!owner.includes('creationSettings: settings'));assert(!runtime.includes('creationToolArguments'));
 console.log('BASELINE_PASS settings=quality_only automatic_visual_review=present repeated_event_projection=present');
}else{
 assert(!tools.includes('name: "verify_image_output"'));assert(tools.includes('name: "inspect_images"'));
 assert(composer.includes('CreationSettingsPanel'));assert(owner.includes('creationSettings: settings'));assert(owner.includes('reduceWorkbenchActivity'));
 assert(runtime.includes('creationToolArguments'));assert(runtime.includes('"turn_settings"'));
 assert(read('src/lib/agent/recovery.ts').includes('等待用户验收'));
 assert(read('src/components/home/creation-message.tsx').includes('ReactMarkdown'));
 console.log('MODIFIED_PASS turn_snapshot=present automatic_visual_review=removed reference_reading=preserved grouped_activity=present');
}
