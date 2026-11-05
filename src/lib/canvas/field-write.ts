/** Pure field-level three-way merge. Owners supply their own field set and error. */
export function mergeCanvasFields<T extends object>(current:T|null,desired:Partial<T>,base:Partial<T>|null|undefined,fields:readonly string[],conflict:(fields:string[])=>Error):T{
 if(base===undefined)return {...current,...desired} as T;
 const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),keys=fields.filter(key=>Object.hasOwn(desired,key)) as Array<keyof T>;
 if(!current){if(base!==null)throw conflict(["deleted"]);return desired as T;}
 if(base===null){const changed=keys.filter(key=>!equal(current[key],desired[key]));if(changed.length)throw conflict(changed.map(String));return current;}
 const conflicts=keys.filter(key=>!equal(base[key],desired[key])&&!equal(current[key],base[key])&&!equal(current[key],desired[key]));
 if(conflicts.length)throw conflict(conflicts.map(String));
 const merged={...current};for(const key of keys)if(!equal(base[key],desired[key]))merged[key]=desired[key] as T[keyof T];return merged;
}
