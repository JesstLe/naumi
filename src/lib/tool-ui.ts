/** UI input validation shared by picker, drag/drop and clipboard. No network or billing changes. */
export function toolImageError(file: {name:string;type:string;size:number}, maxBytes=12*1024*1024, accept="image/png,image/jpeg,image/webp") {
  if (!file.size) return "empty";
  if (file.size > maxBytes) return "size";
  const types:Record<string,string>={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",svg:"image/svg+xml",gif:"image/gif",avif:"image/avif"};
  const type=file.type || types[file.name.split('.').pop()?.toLowerCase()||""] || "";
  const allowed=accept.split(',').map(v=>v.trim().toLowerCase());
  if(!allowed.some(v=>v===type || v==='image/*'&&type.startsWith('image/') || v.startsWith('.')&&file.name.toLowerCase().endsWith(v)))return "type";
  return null;
}
export function toolSourceUrl(source?:string) {return source && /^(https?:\/\/|\/media\/|data:image\/|blob:)/.test(source)?source:undefined;}
