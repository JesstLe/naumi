import {mergeCanvasFields} from "./field-write";
/** Field-level three-way write shared by autosave and history. No database,
 * clocks, UI, generation or wallet policy. Unchanged fields keep remote values. */
export const CANVAS_TEXT_WRITE_FIELDS=["projectKey","title","prompt","content","status","canvasX","canvasY","width","height","sourceIds","targetIds","productIds"] as const;
export type CanvasTextWriteField=typeof CANVAS_TEXT_WRITE_FIELDS[number];
export class CanvasTextWriteConflict<T=unknown> extends Error{
 readonly code="CANVAS_TEXT_CONFLICT";
 constructor(readonly id:string,readonly fields:string[],readonly current:T|null){super("此文字节点已在其他页面修改，本页内容已保留");}
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function mergeCanvasTextWrite<T extends object>(id:string,current:T|null,desired:Partial<T>,base:Partial<T>|null|undefined):T{
 return mergeCanvasFields(current,desired,base,CANVAS_TEXT_WRITE_FIELDS,fields=>new CanvasTextWriteConflict(id,fields,current));
}

export function assertCanvasTextVersion<T extends object>(id:string,current:T|null,expected:Partial<T>){
 const fields=CANVAS_TEXT_WRITE_FIELDS.filter(key=>Object.hasOwn(expected,key)&&!equal(current?.[key as keyof T],expected[key as keyof T]));
 if(!current||fields.length)throw new CanvasTextWriteConflict(id,current?fields:["deleted"],current);
}
