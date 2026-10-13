"use client";

import { authHeader } from "@/lib/supabase";

export type PreparedUpload = {
  file: File;
  originalBytes: number;
  uploadBytes: number;
  optimized: boolean;
  width: number;
  height: number;
};

const MIN_OPTIMIZE_BYTES = 1.5 * 1024 * 1024;
const DEFAULT_MAX_EDGE = 3072;

function webpName(name: string) {
  return name.replace(/\.[^.]+$/, "") + ".webp";
}

/**
 * Reduce transfer size before upload. Small files and images that do not become
 * at least 8% smaller keep their original bytes. The original File is never mutated.
 */
export async function prepareImageUpload(
  original: File,
  options: { maxEdge?: number; quality?: number } = {}
): Promise<PreparedUpload> {
  if (typeof createImageBitmap !== "function") {
    return { file: original, originalBytes: original.size, uploadBytes: original.size, optimized: false, width: 0, height: 0 };
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(original);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (original.size < MIN_OPTIMIZE_BYTES) {
      return { file: original, originalBytes: original.size, uploadBytes: original.size, optimized: false, width: sourceWidth, height: sourceHeight };
    }
    const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("canvas unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/webp", options.quality ?? 0.88)
    );
    // Keep the source if the browser cannot encode WebP or savings are negligible.
    if (!blob || blob.size >= original.size * 0.92) {
      return { file: original, originalBytes: original.size, uploadBytes: original.size, optimized: false, width: sourceWidth, height: sourceHeight };
    }
    const file = new File([blob], webpName(original.name), {
      type: "image/webp",
      lastModified: original.lastModified,
    });
    return { file, originalBytes: original.size, uploadBytes: file.size, optimized: true, width, height };
  } catch {
    return { file: original, originalBytes: original.size, uploadBytes: original.size, optimized: false, width: 0, height: 0 };
  } finally {
    bitmap?.close();
  }
}

export async function prepareImageUploads(files: File[], concurrency = 3) {
  const results = new Array<PreparedUpload>(files.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (next < files.length) {
      const index = next++;
      results[index] = await prepareImageUpload(files[index]);
    }
  }));
  return results;
}

export async function uploadFormData<T>(
  url: string,
  form: FormData,
  onProgress?: (loaded: number, total: number) => void,
  timeoutMs = 120_000
): Promise<T> {
  const headers = await authHeader();
  const file=form.get('image');
  if(url==='/api/artworks/add' && file instanceof File) {
    const pendingResponse=await fetch('/api/media/uploads',{method:'POST',headers:{...headers,'content-type':'application/json'},
      body:JSON.stringify({action:'prepare',bytes:file.size,contentType:file.type||'image/png'})});
    const pending=await pendingResponse.json() as {enabled?:boolean;id?:string;putUrl?:string;contentType?:string;error?:string};
    if(!pendingResponse.ok)throw new Error(pending.error||'上传申请失败');
    if(pending.enabled&&pending.id&&pending.putUrl) {
      await new Promise<void>((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('PUT',pending.putUrl!);xhr.timeout=timeoutMs;
        xhr.setRequestHeader('Content-Type',pending.contentType!);
        xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(e.loaded,e.total);};
        xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(`素材上传失败（${xhr.status}）`));
        xhr.onerror=()=>reject(new Error('素材网络连接失败，请重新上传'));
        xhr.ontimeout=()=>reject(new Error('素材上传超时，请重试'));
        xhr.send(file);
      });
      const x=form.get('x'),y=form.get('y');
      const response=await fetch('/api/media/uploads',{method:'POST',headers:{...headers,'content-type':'application/json'},
        body:JSON.stringify({action:'complete',id:pending.id,title:String(form.get('title')||file.name),
          parentId:form.get('parentId')||null,canvasGroupId:form.get('canvasGroupId')||null,linked:form.get('linked')==='1',
          ...(x!==null&&Number.isFinite(Number(x))?{x:Number(x)}:{}),...(y!==null&&Number.isFinite(Number(y))?{y:Number(y)}:{})})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'素材保存失败');return data as T;
    }
  }
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      let data: unknown;
      try { data = JSON.parse(xhr.responseText); }
      catch { reject(new Error(`上传响应异常（${xhr.status || 0}）`)); return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(typeof (data as { error?: unknown })?.error === "string" ? (data as { error: string }).error : `上传失败（${xhr.status}）`));
        return;
      }
      resolve(data as T);
    };
    xhr.onerror = () => reject(new Error("网络中断，请重新上传"));
    xhr.ontimeout = () => reject(new Error("上传超时，请检查网络后重试"));
    xhr.send(form);
  });
}

export function bytesLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
