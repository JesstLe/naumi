import {z} from 'zod';
const id=z.string().uuid().transform(s=>s.toLowerCase()),note=z.string().trim().min(1).max(2000);
const ids=z.array(id).max(20).refine(v=>new Set(v).size===v.length);
export const handoverMaterialsInput=z.strictObject({progressNote:note,remainingWork:note,risks:note,checklist:z.array(z.strictObject({id,label:z.string().trim().min(1).max(240)})).min(1).max(20).refine(v=>new Set(v.map(x=>x.id)).size===v.length),assetIds:ids,emptyAssetReason:z.string().trim().max(500)}).refine(v=>v.assetIds.length>0||v.emptyAssetReason.length>=3);
export const handoverPackageActions=[
 z.strictObject({type:z.literal('propose-handover-package'),taskId:id,handoverId:id,assignee:z.string().trim().min(1).max(254),reason:note,materials:handoverMaterialsInput}),
 z.strictObject({type:z.literal('accept-handover-package'),taskId:id,handoverId:id,checkedIds:ids,confirmedAssetIds:ids,statement:note}),
]as const;
export type HandoverAsset={id:string;revision:number;name:string;bytes:number;sha256:string};
export type HandoverMaterials=Omit<z.infer<typeof handoverMaterialsInput>,'assetIds'>&{version:1;assets:HandoverAsset[];captured:{status:string;percent:number;assignee:string;orderVersion:number}};
export type HandoverConfirmation={checkedIds:string[];confirmedAssetIds:string[];statement:string;confirmedAt:string;confirmedBy:string};
export const sameIds=(a:string[],b:string[])=>a.length===b.length&&new Set(a).size===a.length&&a.every(id=>b.includes(id));
