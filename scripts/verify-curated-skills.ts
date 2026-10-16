import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {OFFICIAL_IMAGE_SKILLS,validateSkillDraft,validateSkillSelection} from '../src/lib/image-skills/catalog';
import {CURATED_ECOMMERCE_SKILLS} from '../src/lib/image-skills/curated';
let checks=0;function ok(value:unknown,label:string){assert.ok(value,label);checks++}
const provenance=JSON.parse(fs.readFileSync('public/image-skills/previews/provenance.json','utf8'));
ok(CURATED_ECOMMERCE_SKILLS.length===8,'eight public e-commerce workflows');ok(OFFICIAL_IMAGE_SKILLS.length===35,'original27 retained');ok(new Set(OFFICIAL_IMAGE_SKILLS.map(s=>s.id)).size===35,'unique IDs');
for(const s of CURATED_ECOMMERCE_SKILLS){
 ok(validateSkillSelection(s)?.id===s.id,'valid immutable selection');ok(validateSkillDraft(s).instructions.length>60,'adapted reusable instructions');ok(s.preview.kind==='upstream-example','preview is not current provider acceptance');ok(/^\/image-skills\/previews\/[a-z0-9_.-]+\.webp$/.test(s.preview.src),'local preview path');
 const asset=provenance.assets.find((x:any)=>x.file===s.preview.src);ok(!!asset,'provenance exists');const bytes=fs.readFileSync('public'+s.preview.src);ok(createHash('sha256').update(bytes).digest('hex')===asset.assetSha256,'preview hash matches');ok(bytes.length>1000&&bytes.length<80000,'bounded preview bytes');
 ok(s.reference.url.startsWith('https://github.com/Comfy-Org/workflow_templates/blob/'+s.reference.commit+'/'),'immutable source link');ok(s.reference.license==='MIT','upstream attribution');ok(s.reference.workflowSha256.length===64&&s.reference.imageSha256===asset.sourceSha256,'workflow/image checksums');
 ok(!s.instructions.includes('ALWAYS produce an image')&&!s.instructions.includes('regardless of format'),'upstream system directives not imported');
}
ok(fs.readFileSync('public/image-skills/previews/LICENSE.Comfy-Org.txt','utf8').includes('Copyright (c) 2023-present Comfy Org'),'MIT license retained');
const ui=fs.readFileSync('src/components/image-skills/skill-book.tsx','utf8');ok(ui.includes('loading="lazy"')&&ui.includes('decoding="async"'),'lazy local preview');ok(ui.includes('效果参考')&&ui.includes('参考工作流'),'accurate labels');ok(ui.includes('企业 Skills')&&ui.includes('作者：'),'enterprise attribution kept');
console.log('CURATED_SKILLS=PASS; CHECKS='+checks+'; WORKFLOWS=8; LOCAL_PREVIEWS=8; TOTAL_SKILLS=35; ATTRIBUTION=MIT; UPSTREAM_EXECUTION=NOT_IMPORTED');
