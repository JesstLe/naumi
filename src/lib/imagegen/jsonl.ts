import {z} from "zod";
const row=z.strictObject({key:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/).optional(),name:z.string().trim().min(1).max(100).optional(),prompt:z.string().trim().min(1).max(6000)});
/** Import preview only: no file paths, network or execution options. */
export function parseImagegenJsonl(text:string){
 if(new TextEncoder().encode(text).length>256*1024)throw new Error("JSONL不能超过256KiB");
 const lines=text.split(/\r?\n/).filter(s=>s.trim());if(!lines.length||lines.length>100)throw new Error("批次需要1–100条提示词");
 const items=lines.map((line,i)=>{let value;try{value=row.parse(JSON.parse(line));}catch{throw new Error(`第${i+1}行需包含prompt，可选key/name`);}return {key:value.key||`item-${i+1}`,name:value.name||`图像-${i+1}`,prompt:value.prompt};});
 if(new Set(items.map(i=>i.key)).size!==items.length)throw new Error("批次编号重复");return items;
}
