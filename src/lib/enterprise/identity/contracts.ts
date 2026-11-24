import {z} from 'zod';
export const DESIGN_GROUPS=['ecommerce-senior','ecommerce-production','packaging','ui','rendering'] as const;
export const GROUPS=[...DESIGN_GROUPS,'operations','management'] as const;
export const TITLES=['system_admin','administrator','design_director','design_supervisor','designer','operations'] as const;
export const PRODUCT_ROLES=['operations','operations_lead','designer','reviewer','design_admin','director','owner','admin'] as const;
export const groupLabels:Record<typeof GROUPS[number],string>={'ecommerce-senior':'电商设计组','ecommerce-production':'美工组',packaging:'包装设计',ui:'UI设计',rendering:'渲染组',operations:'运营',management:'管理层'};
export const titleLabels:Record<typeof TITLES[number],string>={system_admin:'最高系统管理员',administrator:'管理员',design_director:'设计总监',design_supervisor:'设计主管',designer:'设计师',operations:'运营'};
const unique=<T,>(values:T[])=>new Set(values).size===values.length;
export const organizationSchema=z.object({title:z.enum(TITLES),homeGroup:z.enum(GROUPS),
  managedGroups:z.array(z.enum(DESIGN_GROUPS)).max(DESIGN_GROUPS.length).refine(unique),
  reviewGroups:z.array(z.enum(DESIGN_GROUPS)).max(DESIGN_GROUPS.length).refine(unique),
  canTakeDesignTasks:z.boolean(),grade:z.number().int().min(1).max(10),
  skills:z.array(z.string().trim().min(1).max(50)).max(30).refine(unique),
  dailyCapacity:z.number().min(.25).max(12),
}).strict().superRefine((value,ctx)=>{
  const manager=['design_director','design_supervisor'].includes(value.title);
  if(!manager&&(value.managedGroups.length||value.reviewGroups.length))ctx.addIssue({code:'custom',message:'只有设计管理职务可配置跨组调度或审核范围'});
  if(!manager&&value.title!=='designer'&&value.canTakeDesignTasks)ctx.addIssue({code:'custom',message:'当前职务没有制作能力'});
  if(value.title==='designer'&&!DESIGN_GROUPS.includes(value.homeGroup as typeof DESIGN_GROUPS[number]))ctx.addIssue({code:'custom',message:'设计师须归属设计组'});
  if(value.title==='operations'&&value.homeGroup!=='operations')ctx.addIssue({code:'custom',message:'运营须归属运营组'});
});
export type Organization=z.infer<typeof organizationSchema>;
const common={id:z.string().uuid(),enterpriseId:z.string().uuid(),email:z.string().trim().min(1).max(254),expectedVersion:z.number().int().min(0),reason:z.string().trim().min(3).max(500)};
export const identityCommandSchema=z.discriminatedUnion('action',[
  z.object({...common,action:z.literal('organization'),organization:organizationSchema,
    productConfiguration:z.object({expectedVersion:z.number().int().min(0),enabled:z.boolean(),roles:z.array(z.enum(PRODUCT_ROLES)).max(8).refine(unique)}).strict().optional(),
  }).strict(),
  z.object({...common,action:z.literal('product-grant'),productId:z.literal('design-ops'),enabled:z.boolean(),roles:z.array(z.enum(PRODUCT_ROLES)).max(8).refine(unique)}).strict(),
]);
export type IdentityCommand=z.infer<typeof identityCommandSchema>;

/** Independent product role policy. System titles never silently grant business approval. */
export function assertGrantForOrganization(org:Organization,roles:readonly string[]){
  const allowed=new Set<string>();
  if(org.title==='system_admin')allowed.add('admin');
  if(org.title==='administrator')allowed.add('admin');
  if(org.title==='design_director'){allowed.add('director');allowed.add('design_admin');}
  if(org.title==='design_supervisor')allowed.add('design_admin');
  if(org.title==='designer'||org.canTakeDesignTasks)allowed.add('designer');
  if(org.title==='operations')allowed.add('operations');
  if(org.reviewGroups.length)allowed.add('reviewer');
  if(roles.some(role=>!allowed.has(role)))throw Error('PRODUCT_ROLE_OUTSIDE_ORGANIZATION');
}
