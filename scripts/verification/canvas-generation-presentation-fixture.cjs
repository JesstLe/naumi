/** Bind the actual production owner to observed Canvas VM state. Legacy read
 * aliases keep existing assertions; they do not implement presentation rules. */
exports.bindGenerationPresentation=(box,api,workspace)=>{
  if(!api.createCanvasGenerationPresentation)return null;
  const store=api.createCanvasGenerationPresentation();
  const key=()=>JSON.stringify([box.canvasAccountRef.current,workspace(),box.activeProjectRef.current?.key||'workspace']);
  let view=store.bind(key());box.generationPresentation=view;
  const pendingStore=api.createCanvasPendingPresentation?.();let pending=pendingStore?.bind(key());
  if(pending){
    pending.set(box.pendNodes??[]);box.pendingPresentation=pending;
    Object.defineProperty(box,'pendNodes',{configurable:true,get:()=>pending.getSnapshot(),set:value=>pending.set(value)});
    Object.defineProperty(box.pendNodesRef,'current',{configurable:true,get:()=>pending.getSnapshot(),set:value=>pending.set(value)});
    box.setPendNodes=change=>pending.set(change);
  }
  Object.defineProperty(box,'generationTasks',{configurable:true,get:()=>view.getSnapshot().tasks});
  Object.defineProperty(box.generationOperationRef,'current',{configurable:true,get:()=>view.getSnapshot().operations});
  Object.defineProperty(box.generationTaskPosRef,'current',{configurable:true,get:()=>view.getSnapshot().positions});
  return {store,current:()=>view,render(){view=store.bind(key());box.generationPresentation=view;if(pendingStore){pending=pendingStore.bind(key());box.pendingPresentation=pending;}return view;}};
};
