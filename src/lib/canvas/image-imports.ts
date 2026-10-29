"use client";
import {prepareImageUploads,uploadFormData} from "../client-image-upload";
import {adaptiveCanvasImageSize,type Artwork} from "../mock-data";
import {NODE_W,NODE_H,NODE_LABEL_H} from "./node-geometry";
import {placeGenerationPreview} from "./generation-feedback";
import {synchronizeCanvasArtworks} from "./input-references";

export const CANVAS_IMAGE_UPLOAD_LIMIT=64*1024*1024;
const X_GAP=90,Y_GAP=48;
export type CanvasImportPoint={parentId:string|null;x:number;y:number};
export type CanvasImageImportBatch={
  id:number;owner:string;workspace:string;project:string|null;total:number;done:number;success:number;finished:boolean;
  errors:{name:string;message:string}[];phase:"optimizing"|"uploading"|"sync"|"done";
  originalBytes:number;uploadBytes:number;uploadedBytes:number;nodeIds?:string[];hidden?:boolean;
};
export type CanvasImageImportContext={
  owner:string;account:string;workspace:string;project:string|null;
  documentCurrent:()=>boolean;viewCurrent:()=>boolean;
  rects:()=>{x:number;y:number;width:number;height:number}[];
  merge:(ids:string[])=>Promise<Artwork[]>;history:(ids:string[],rows:Artwork[])=>void;
  reveal:(id:string)=>void;t:(key:string)=>string;locale:string;
};
type Scope={rootId:string|null;queue:Promise<void>;rects:{x:number;y:number;width:number;height:number;owner:number;index:number}[]};
type SavedImport={context:CanvasImageImportContext;scope:Scope;historyRecorded:boolean;pendingId?:string;attached?:()=>void;reveal?:boolean};
const newScope=():Scope=>({rootId:null,queue:Promise.resolve(),rects:[]});
const EMPTY:CanvasImageImportBatch[]=[];

/** One transport for native import, assistant attachment and placeholder upload.
 * Identity is captured before auth/PUT/commit, never borrowed from a later view. */
async function saveCanvasImportImage(file:File,fields:{email:string;title?:string;canvasGroupId?:string|null;parentId?:string|null;linked?:boolean;x:number;y:number},context:CanvasImageImportContext,progress?:(sent:number,total:number)=>void,extra?:()=>boolean){
  const assertCurrent=()=>{if(!context.documentCurrent()||extra&&!extra())throw new Error("账号、工作空间或对话已切换，已取消尚未开始的上传。");};
  assertCurrent();const form=new FormData();form.append("email",fields.email);form.append("image",file);
  if(fields.title!==undefined)form.append("title",fields.title);
  if(fields.canvasGroupId)form.append("canvasGroupId",fields.canvasGroupId);
  if(fields.parentId)form.append("parentId",fields.parentId);
  if(fields.linked)form.append("linked","1");
  form.append("x",String(fields.x));form.append("y",String(fields.y));
  return uploadFormData<{id?:string;error?:string}>("/api/artworks/add",form,progress,120_000,assertCurrent,
    {"x-naumi-workspace":context.workspace,...(context.project?{"x-naumi-project-context":context.project}:{})});
}

/** Per-editor imports own queue/placement/progress and saved IDs. A failed read
 * retains the original receipt; synchronize never uploads or creates again. */
export function createCanvasImageImports(){
  const importScopeRef={current:newScope()},saved=new Map<number,SavedImport>(),pendingRuns=new Map<string,Promise<string>>(),resync=new Set<number>(),listeners=new Set<()=>void>();
  let sequence=0,imageImports=EMPTY,scopeIdentity="";
  const getSnapshot=()=>imageImports,subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
  function setImageImports(update:(current:CanvasImageImportBatch[])=>CanvasImageImportBatch[]){imageImports=update(imageImports);for(const id of saved.keys())if(!imageImports.some(batch=>batch.id===id))saved.delete(id);for(const fn of listeners)fn();}
  function update(id:number,fields:Partial<CanvasImageImportBatch>){setImageImports(rows=>rows.map(row=>row.id===id?{...row,...fields}:row));}
  function dismiss(id:number){
    // Dismissing presentation never discards an already saved pending receipt.
    const batch=imageImports.find(row=>row.id===id),record=saved.get(id);
    if(record?.pendingId&&batch?.nodeIds?.length&&batch.phase==="sync"){update(id,{hidden:true});return;}
    setImageImports(rows=>rows.filter(row=>row.id!==id));saved.delete(id);
  }
  function reset(){importScopeRef.current=newScope();scopeIdentity="";}
  function captureScope(context:CanvasImageImportContext){
    const identity=JSON.stringify([context.account,context.workspace]);
    if(scopeIdentity!==identity){importScopeRef.current=newScope();scopeIdentity=identity;}
    return importScopeRef.current;
  }
  async function synchronize(id:number,context:CanvasImageImportContext,extra:()=>boolean=()=>true){
    const batch=imageImports.find(row=>row.id===id),record=saved.get(id);
    if(!batch?.nodeIds?.length||!record||resync.has(id))return;
    if(batch.owner!==context.owner.toLowerCase()||record.context.account!==context.account||record.context.workspace!==context.workspace||!context.documentCurrent()||!extra())throw Error("账号或工作空间已切换；图片已保存，请返回原位置同步");
    resync.add(id);update(id,{finished:false,phase:"sync"});
    try{
      const rows=await synchronizeCanvasArtworks(batch.nodeIds,()=>context.merge(batch.nodeIds!),()=>context.documentCurrent()&&extra());
      if((importScopeRef.current===record.scope||context.viewCurrent()&&context.project===record.context.project)&&!record.historyRecorded){
        context.history(batch.nodeIds,rows);record.historyRecorded=true;record.attached?.();
        // Artwork reads complete before publishing a navigation target. An
        // unrelated project refresh must not consume an ID absent from state.
        if(record.reveal&&context.viewCurrent())context.reveal(batch.nodeIds[0]);
      }
      update(id,{finished:true,phase:"done",errors:batch.errors.filter(error=>error.name!==context.t("canvas.importSync"))});
      return rows;
    }catch(error){update(id,{finished:true,phase:"sync"});throw error;}
    finally{resync.delete(id);}
  }
  function upload(picked:File[],ctx:CanvasImportPoint,context:CanvasImageImportContext,options?:{assistant:boolean;isCurrent:()=>boolean}):Promise<string[]>{
    if(!picked.length||!context.documentCurrent())return Promise.resolve([]);
    const {t,locale}=context,scope=captureScope(context);if(ctx.parentId)scope.rootId=ctx.parentId;
    const id=++sequence,email=context.owner;saved.set(id,{context,scope,historyRecorded:false,reveal:!options?.assistant});
    const failures: { name: string; message: string }[] = [];
    const valid = picked.filter(file => {
      const supported = /^(image\/png|image\/jpeg|image\/webp)$/.test(file.type) ||
        (!file.type && /\.(png|jpe?g|webp)$/i.test(file.name));
      const message = !supported ? t("canvas.importUnsupported") :
        file.size > CANVAS_IMAGE_UPLOAD_LIMIT ? t("canvas.importTooLarge") :
        file.size === 0 ? t("canvas.importEmpty") : "";
      if (message) failures.push({ name: file.name, message });
      return !message;
    });
    const canvasGroupId = valid.length > 1
      ? `canvas-import-${Date.now()}-${id}`
      : null;
    const columns = Math.min(4, Math.ceil(Math.sqrt(valid.length)));
    const entries = valid.map(file => ({ file, pos: { x: ctx.x, y: ctx.y } }));
    setImageImports(current => [...current.filter(batch => !batch.finished || batch.errors.length > 0), {
      id, owner: email.toLowerCase(), workspace:context.workspace,project:context.project,total: picked.length, done: failures.length, success: 0, errors: failures, finished: false,
      phase: "optimizing", originalBytes: valid.reduce((sum, file) => sum + file.size, 0),
      uploadBytes: valid.reduce((sum, file) => sum + file.size, 0), uploadedBytes: 0,
    }]);
    const run = async () => {
      if(!context.documentCurrent()||options&&!options.isCurrent()){
        setImageImports(current=>current.map(batch=>batch.id===id?{...batch,finished:true,phase:"done"}:batch));
        return [];
      }
      const prepared = await prepareImageUploads(entries.map(entry => entry.file), 1, {preserveOriginal:true});
      // 解码完成后按图片比例生成舒适的画布初始尺寸；原图像素仍单独保存。
      const preparedCanvasSizes = prepared.map((item) =>
        adaptiveCanvasImageSize(item.width, item.height)
      );
      const rowCount = Math.max(1, columns);
      let batchWidth = 0;
      let batchHeight = 0;
      const relative: { x: number; y: number }[] = [];
      for (let start = 0; start < prepared.length; start += rowCount) {
        const row = preparedCanvasSizes.slice(start, start + rowCount);
        let rowX = 0;
        const rowHeight = Math.max(
          ...row.map((item) => item.height + NODE_LABEL_H),
          NODE_H
        );
        row.forEach((item, offset) => {
          relative[start + offset] = { x: rowX, y: batchHeight };
          rowX += item.width + X_GAP;
        });
        batchWidth = Math.max(batchWidth, Math.max(0, rowX - X_GAP));
        batchHeight += rowHeight + Y_GAP;
      }
      batchHeight = Math.max(0, batchHeight - Y_GAP);
      const firstCanvasSize = preparedCanvasSizes[0] ?? { width: NODE_W, height: NODE_H - NODE_LABEL_H };
      const baseX = ctx.x + NODE_W / 2 - firstCanvasSize.width / 2;
      const baseY = ctx.y + NODE_H / 2 - (firstCanvasSize.height + NODE_LABEL_H) / 2;
      const existingRects = [...context.rects(),...scope.rects];
      // Allocate only the new batch near the requested point. A distant node must
      // never push an upload to the bottom of the entire project.
      const nearby = placeGenerationPreview({ x: baseX, y: baseY },
        { width: batchWidth, height: batchHeight }, existingRects);
      entries.forEach((entry, index) => {
        entry.pos.x = Math.round(nearby.x + relative[index].x);
        entry.pos.y = Math.round(nearby.y + relative[index].y);
      });
      const batchRects = entries.map((entry, index) => ({
        x: entry.pos.x,
        y: entry.pos.y,
        width: preparedCanvasSizes[index]?.width || NODE_W,
        height: (preparedCanvasSizes[index]?.height || NODE_H - NODE_LABEL_H) + NODE_LABEL_H,
        owner: id,
        index,
      }));
      // Queued drops close over an earlier React render, so rfNodes alone cannot see the
      // preceding batch. Keep native-size rectangles in the shared import scope as soon
      // as the batch is laid out, then retain only successfully imported rectangles.
      scope.rects.push(...batchRects);
      const uploadBytes = prepared.reduce((sum, item) => sum + item.uploadBytes, 0);
      const loaded = new Array(prepared.length).fill(0) as number[];
      setImageImports(current => current.map(batch => batch.id === id ? {
        ...batch, phase: "uploading", uploadBytes,
      } : batch));
      const ids: (string | undefined)[] = [];
      const upload = async (index: number) => {
        const { file, pos } = entries[index];
        const selected = prepared[index];
        let error = "";
        try {
          if(options&&!options.isCurrent())throw new Error(locale==='en'?'Conversation changed; upload cancelled.':'对话已切换，已取消尚未开始的上传。');
          if(selected.error)throw new Error(selected.error);
          const d = await saveCanvasImportImage(selected.file, {
            email, title:file.name,canvasGroupId,parentId:scope.rootId,x:pos.x,y:pos.y,
          },context,(sent,total)=>{
            loaded[index]=total?Math.min(selected.uploadBytes,sent/total*selected.uploadBytes):0;
            setImageImports(current=>current.map(batch=>batch.id===id?{...batch,uploadedBytes:Math.round(loaded.reduce((sum,value)=>sum+value,0))}:batch));
          },options?.isCurrent);
          if (!d?.id) throw new Error(d?.error || t("canvas.importFailed"));
          ids[index] = d.id;
          if (!scope.rootId) scope.rootId = d.id;
        } catch (e) {
          error = e instanceof Error ? e.message : t("canvas.importFailed");
        }
        loaded[index] = selected.uploadBytes;
        setImageImports(current => current.map(batch => batch.id === id ? {
          ...batch, done: batch.done + 1, success: batch.success + (error ? 0 : 1),
          errors: error ? [...batch.errors, { name: file.name, message: error }] : batch.errors,
          uploadedBytes: Math.round(loaded.reduce((sum, value) => sum + value, 0)),
        } : batch));
      };
      let next = 0;
      // The first successful image is the project root; a failed first image must not split the batch.
      while (!scope.rootId && next < entries.length) await upload(next++);
      await Promise.all(Array.from({ length: Math.min(2, entries.length - next) }, async () => {
        while (next < entries.length) await upload(next++);
      }));
      const added = ids.filter((value): value is string => !!value);
      scope.rects = scope.rects.filter((rect) => rect.owner !== id || !!ids[rect.index]);
      setImageImports(current => current.map(batch => batch.id === id ? { ...batch, nodeIds: added, phase: "sync" } : batch));
      if(added.length){
        await synchronize(id,context,options?.isCurrent);
      }
      setImageImports(current => current.map(batch => batch.id === id ? {
        ...batch, finished: true, phase: "done", uploadedBytes: batch.uploadBytes, nodeIds: added,
      } : batch));
      return added;
    };
    // Ordered batches; only the first successful upload establishes the root.
    const result=scope.queue.then(run,run).catch(()=>{
      setImageImports(current=>current.map(batch=>batch.id===id?{...batch,finished:true,phase:batch.nodeIds?.length?"sync":batch.phase,
        errors:[...batch.errors,{name:t("canvas.importSync"),message:batch.nodeIds?.length?"图片已保存，画布尚未同步；请点击同步图片，无需重新上传":t("canvas.importSyncFailed")}]}:batch));
      return [];
    });scope.queue=result.then(()=>{});return result;
  }
  async function runPending(file:File,point:CanvasImportPoint&{linked:boolean;pendingId:string},context:CanvasImageImportContext,callbacks:{progress:(percent:number)=>void;attached:(id:string)=>void}){
    const previous=pendingBatch(point.pendingId,context);
    if(previous?.nodeIds?.length){await synchronize(previous.id,context);return previous.nodeIds[0];}
    if(!context.documentCurrent())throw Error("账号或工作空间已切换");
    const id=++sequence,scope=captureScope(context),email=context.owner,{t}=context;
    saved.set(id,{context,scope,historyRecorded:false,pendingId:point.pendingId});
    setImageImports(rows=>[...rows.filter(batch=>!batch.finished||batch.errors.length>0),{id,owner:email.toLowerCase(),workspace:context.workspace,project:context.project,total:1,done:0,success:0,finished:false,errors:[],phase:"uploading",originalBytes:file.size,uploadBytes:file.size,uploadedBytes:0}]);
    try{
      const [prepared]=await prepareImageUploads([file],1,{preserveOriginal:true});
      if(prepared.error)throw Error(prepared.error);
      const response=await saveCanvasImportImage(prepared.file,{email,parentId:point.parentId,linked:point.linked,x:Math.round(point.x),y:Math.round(point.y)},context,(sent,total)=>{
        update(id,{uploadedBytes:total?Math.round(sent/total*file.size):0});
        if(importScopeRef.current===scope&&context.documentCurrent())callbacks.progress(total?sent/total*100:0);
      });
      if(!response.id)throw Error(response.error||t("canvas.genFail"));const nodeId=response.id;
      saved.get(id)!.attached=()=>callbacks.attached(nodeId);
      update(id,{done:1,success:1,nodeIds:[nodeId],phase:"sync",uploadedBytes:file.size});
      await synchronize(id,context);return nodeId;
    }catch(error){
      const batch=imageImports.find(row=>row.id===id);update(id,{done:1,finished:true,phase:batch?.nodeIds?.length?"sync":"done",errors:[{name:batch?.nodeIds?.length?t("canvas.importSync"):file.name,message:batch?.nodeIds?.length?"图片已保存，画布尚未同步；请点击同步图片，无需重新上传":error instanceof Error?error.message:t("canvas.importFailed")}]});
      throw error;
    }
  }
  function pendingBatch(pendingId:string,context:CanvasImageImportContext){
    const record=[...saved].find(([,item])=>item.pendingId===pendingId&&item.context.account===context.account&&item.context.workspace===context.workspace);
    return record?imageImports.find(batch=>batch.id===record[0]):undefined;
  }
  function uploadPending(...args:Parameters<typeof runPending>){
    const [,point,context]=args,key=JSON.stringify([context.account,context.workspace,point.pendingId]);
    const existing=pendingRuns.get(key);if(existing)return existing;
    const promise=runPending(...args).finally(()=>{if(pendingRuns.get(key)===promise)pendingRuns.delete(key);});pendingRuns.set(key,promise);return promise;
  }
  return {getSnapshot,subscribe,upload,uploadPending,pendingBatch,synchronize,reset,dismiss};
}
export const EMPTY_CANVAS_IMAGE_IMPORTS=EMPTY;
