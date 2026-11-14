/** Shared application contract; neither the Canvas nor the HTTP route owns it. */
export type ComfyRunPayload={
  workflowId:string;workflowRevision?:number;texts:Record<string,string>;seeds:Record<string,number>;numerics:Record<string,Record<string,number>>;
};
export type ComfyRunResult={
  state:"completed"|"submitted"|"partial"|"needs_review"|"failed"|"stale";
  images?:{id:string;url:string;width?:number;height?:number}[];
  videos?:{url:string;mime:string}[];
  taskId?:string;creationId?:string;videoArtworkId?:string;
  message?:string;
};
export type ComfyRunInput=Partial<ComfyRunPayload>&{
  parameters?:Record<string,import('zod').z.infer<ReturnType<typeof import('zod').z.json>>>;artworkId?:string;imageUrl?:string;prompt?:string;seed?:number;numericDefaults?:Record<string,number>;
  source?:"canvas"|"workbench"|"agent"|"workflow";mediaType?:"video";idempotencyKey?:string;
  nodeId?:string;expectedRevision?:number;projectKey?:string;durationSeconds?:number;references?:unknown[];inputMappings?:unknown[];
};
