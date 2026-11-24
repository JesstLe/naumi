/** Pure catalog/qualification checks; no database, process config or production I/O. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DESIGN_GROUPS,GROUPS,groupLabels,organizationSchema,assertGrantForOrganization,type Organization} from '../src/lib/enterprise/identity/contracts';
import {APPROVED_ROSTER_DESIGN_GROUPS} from './lib/central-roster-identity';

let checks=0;
const check=(name:string,run:()=>void)=>{run();checks++;console.log('PASS '+name);};
const org=(overrides:Partial<Organization>={}):Organization=>({title:'designer',homeGroup:'ui',managedGroups:[],reviewGroups:[],canTakeDesignTasks:true,grade:2,skills:[],dailyCapacity:6,...overrides});
const manager=()=>org({title:'design_supervisor',homeGroup:'rendering',managedGroups:[...DESIGN_GROUPS],canTakeDesignTasks:false});

check('stable_codes_retained_rendering_appended',()=>assert.deepEqual(DESIGN_GROUPS,['ecommerce-senior','ecommerce-production','packaging','ui','rendering']));
check('business_labels_without_operations_or_ui_reclassification',()=>{
 assert.equal(groupLabels['ecommerce-senior'],'电商设计组');assert.equal(groupLabels['ecommerce-production'],'美工组');assert.equal(groupLabels.rendering,'渲染组');
 assert.equal(groupLabels.packaging,'包装设计');assert.equal(groupLabels.ui,'UI设计');assert.equal(groupLabels.operations,'运营');assert.equal(groupLabels.management,'管理层');
});
for(const homeGroup of APPROVED_ROSTER_DESIGN_GROUPS)check('legacy_group_'+homeGroup,()=>assert.deepEqual(organizationSchema.parse(org({homeGroup})),org({homeGroup})));
check('rendering_designer_empty_skills_unchanged',()=>assert.deepEqual(organizationSchema.parse(org({homeGroup:'rendering'})).skills,[]));
check('rendering_does_not_infer_modeling_skill',()=>assert(!organizationSchema.parse(org({homeGroup:'rendering'})).skills.includes('建模渲染')));
check('manager_five_scopes_without_automatic_review',()=>{const parsed=organizationSchema.parse(manager());assert.equal(parsed.managedGroups.length,5);assert.deepEqual(parsed.reviewGroups,[]);assert.deepEqual(parsed.skills,[]);});
check('explicitly_authorized_five_review_scopes_schema_supported',()=>assert.equal(organizationSchema.parse({...manager(),reviewGroups:[...DESIGN_GROUPS]}).reviewGroups.length,5));
check('duplicate_management_scope_rejected',()=>assert(!organizationSchema.safeParse({...manager(),managedGroups:[...DESIGN_GROUPS,'rendering']}).success));
check('duplicate_review_scope_rejected',()=>assert(!organizationSchema.safeParse({...manager(),reviewGroups:['rendering','rendering']}).success));
check('unknown_group_rejected',()=>assert(!organizationSchema.safeParse({...manager(),homeGroup:'render'}).success));
check('ordinary_designer_cannot_manage_groups',()=>assert(!organizationSchema.safeParse(org({homeGroup:'rendering',managedGroups:['rendering']})).success));
check('ordinary_designer_cannot_review_groups',()=>assert(!organizationSchema.safeParse(org({homeGroup:'rendering',reviewGroups:['rendering']})).success));
check('operations_behavior_unchanged',()=>{const ops=org({title:'operations',homeGroup:'operations',canTakeDesignTasks:false});assert(organizationSchema.safeParse(ops).success);assertGrantForOrganization(ops,['operations']);assert.throws(()=>assertGrantForOrganization(ops,['designer']));assert(!organizationSchema.safeParse({...ops,managedGroups:['rendering']}).success);});
check('rendering_designer_has_no_admin_or_reviewer_grant',()=>{const d=org({homeGroup:'rendering'});assertGrantForOrganization(d,['designer']);assert.throws(()=>assertGrantForOrganization(d,['admin']));assert.throws(()=>assertGrantForOrganization(d,['reviewer']));});
check('managed_scope_is_not_professional_review_authority',()=>{const m=manager();assertGrantForOrganization(m,['design_admin']);assert.throws(()=>assertGrantForOrganization(m,['reviewer']));assert.throws(()=>assertGrantForOrganization(m,['director']));assert.throws(()=>assertGrantForOrganization(m,['admin']));});
check('director_role_rules_unchanged',()=>{const d={...manager(),title:'design_director' as const,reviewGroups:['rendering'] as Organization['reviewGroups']};assertGrantForOrganization(d,['director','design_admin','reviewer']);assert.throws(()=>assertGrantForOrganization(d,['admin']));});
check('site_admin_title_not_a_business_qualification',()=>{const a=org({title:'administrator',homeGroup:'management',canTakeDesignTasks:false});assertGrantForOrganization(a,['admin']);assert.throws(()=>assertGrantForOrganization(a,['designer']));assert(!organizationSchema.safeParse({...a,managedGroups:['rendering']}).success);});
check('historical_202_roster_frozen_not_auto_granted_rendering',()=>{assert.deepEqual(APPROVED_ROSTER_DESIGN_GROUPS,['ecommerce-senior','ecommerce-production','packaging','ui']);assert(!APPROVED_ROSTER_DESIGN_GROUPS.some(g=>(g as string)==='rendering'));const source=readFileSync(new URL('./provision-central-roster.ts',import.meta.url),'utf8');assert(source.includes('managedGroups: manager ? [...APPROVED_ROSTER_DESIGN_GROUPS] : []'));});
check('catalog_is_shared_by_existing_identity_picker',()=>{const source=readFileSync(new URL('../src/components/enterprise/identity-manager.tsx',import.meta.url),'utf8');assert(source.includes('DESIGN_GROUPS.map'));assert(GROUPS.includes('rendering'));});
check('projection_protocol_stays_schema_version_1',()=>assert.match(readFileSync(new URL('../src/lib/enterprise/identity/service.ts',import.meta.url),'utf8'),/schemaVersion:\s*1/));
console.log(`CENTRAL_RENDERING_GROUPS_PASS checks=${checks} live_writes=0 deployment=HOLD`);
