import {copyText} from "../clipboard";
import {readBrowserImage} from "../browser-image-cache";
import {cdnUrl} from "../cdn";
import {canvasNodeClipboardHtml,setCanvasNodeClipboardData} from "./node-clipboard";

/** The clipboard transport owns native API/HTTP fallback, not node state or
 * document writes. An obsolete async attempt never falls back into a new session. */
export async function writeCanvasNodeClipboard(node:{id:string;title:string},current:()=>boolean){
  if(!current())return false;
  try{
    if(navigator.clipboard?.write&&typeof ClipboardItem!=="undefined"){
      await navigator.clipboard.write([new ClipboardItem({"text/plain":new Blob([node.title],{type:"text/plain"}),"text/html":new Blob([canvasNodeClipboardHtml(node.id,node.title)],{type:"text/html"})})]);
      return current();
    }
  }catch{/* Native permission/HTTP failures use the same portable marker. */}
  if(!current())return false;
  let wrote=false,copied=false;
  const onCopy=(event:ClipboardEvent)=>{if(!current()||!event.clipboardData)return;wrote=true;event.preventDefault();setCanvasNodeClipboardData(event.clipboardData,node.id,node.title);};
  document.addEventListener("copy",onCopy,{capture:true,once:true});
  try{copied=document.execCommand("copy");}catch{/* Text-only fallback remains available. */}
  finally{document.removeEventListener("copy",onCopy,true);}
  if(!current())return false;
  return copied||wrote||await copyText(node.title);
}

export async function copyCanvasImage(image:string,current:()=>boolean){
  try{
    let blob=await readBrowserImage(image);if(!current())return false;
    if(blob.type!=="image/png"){
      const bitmap=await createImageBitmap(blob);
      try{
        if(!current())return false;
        const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext("2d")?.drawImage(bitmap,0,0);
        blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Clipboard PNG conversion failed")),"image/png"));
      }finally{bitmap.close();}
    }
    if(!current())return false;
    if(!navigator.clipboard?.write)throw new Error("Clipboard API unavailable");
    await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);return current();
  }catch{return current()?await copyText(cdnUrl(image)):false;}
}
