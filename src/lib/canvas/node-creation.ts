import type {CanvasPendingNode} from './scene-types';
import type {CanvasTextNode} from './text-document-model';
import type {CanvasHistoryAction} from './history-model';
import type {CanvasNativeKind} from './native-node-records';
import {newCanvasText} from './node-commands';
import {NODE_W,NODE_H} from './node-geometry';

type Point={x:number;y:number};
type Viewport=Point&{zoom:number};
type Area=Point&{width:number;height:number};
type PendingHistory=Extract<CanvasHistoryAction,{kind:'pending-add'}>;
type TextHistory=Extract<CanvasHistoryAction,{kind:'text-add'}>;
export type CanvasCreatableNodeKind='image'|'text'|Exclude<CanvasNativeKind,'comfy'>;

export type CanvasPendingCreationPorts={
 project:string|null;
 viewport:()=>Viewport;
 nextSequence:()=>number;
 now:()=>number;
 imageLabel:string;
 append:(node:CanvasPendingNode)=>void;
 history:(action:PendingHistory)=>void;
 activate:(node:CanvasPendingNode,multiple:boolean)=>void;
 focus:(area:Area)=>void;
};

/** A synchronous creation use case. Pending/document/history stores retain
 * their existing ownership; presentation is an explicit event port. Creating
 * a node never quotes,purchases,starts or cancels a generation task. */
function publishPending(node:CanvasPendingNode,multiple:boolean,ports:CanvasPendingCreationPorts){
 ports.append(node);
 ports.history({kind:'pending-add',records:[node],projectKey:ports.project});
 ports.activate(node,multiple);
 ports.focus({x:node.x,y:node.y,width:NODE_W,height:NODE_H});
 return node;
}

export function createCanvasPendingAtScreen(point:Point,parentId:string|null,linked:boolean,ports:CanvasPendingCreationPorts){
 const viewport=ports.viewport(),zoom=viewport.zoom||1;
 const x=(point.x-viewport.x)/zoom-NODE_W/2,y=(point.y-viewport.y)/zoom-NODE_H/2;
 const sequence=ports.nextSequence();
 return publishPending({id:`pend-${ports.now()}-${sequence}`,x,y,parentId,linked,
  label:`${ports.imageLabel} ${sequence}`,uploading:false,progress:0,inputs:linked&&parentId?[parentId]:[],
 },false,ports);
}

export function createCanvasMultiReferenceNode(input:{
 ids:readonly string[];artworkCount:number;readOnly:boolean;limit:number;gap:number;
 nodes:(ids:readonly string[])=>readonly (Point&{width:number})[];
 referenceLimit:()=>void;
},ports:CanvasPendingCreationPorts){
 if(input.readOnly||input.artworkCount<2)return;
 const inputs=input.ids.slice(0,input.limit),nodes=input.nodes(inputs),sequence=ports.nextSequence();
 const maxX=nodes.length?Math.max(...nodes.map(node=>node.x+node.width)):0;
 const averageY=nodes.length?nodes.reduce((sum,node)=>sum+node.y,0)/nodes.length:0;
 const node=publishPending({id:`pend-${ports.now()}-${sequence}`,x:maxX+input.gap,y:averageY,
  parentId:inputs[0]??null,linked:true,label:`${ports.imageLabel} ${sequence}`,uploading:false,progress:0,inputs,
 },true,ports);
 if(input.ids.length>input.limit)input.referenceLimit();
 return node;
}

export type CanvasTextCreationOptions={forceNewProject?:boolean;title?:string;prompt?:string;sourceIds?:string[]};
export type CanvasTextCreationPorts={
 writable:boolean;project:string|null;defaultTitle:string;viewport:()=>Viewport;
 append:(node:CanvasTextNode)=>void;
 activate:(node:CanvasTextNode,prompt:string)=>void;
 focus:(area:Area,project:string)=>void;
 history:(action:TextHistory)=>void;
 save:(node:CanvasTextNode)=>Promise<unknown>;
};
export function createCanvasTextAtScreen(point:Point,options:CanvasTextCreationOptions|undefined,ports:CanvasTextCreationPorts){
 if(!ports.writable)return;
 const node=newCanvasText({...options,x:point.x,y:point.y,viewport:ports.viewport(),project:ports.project,title:options?.title||ports.defaultTitle});
 ports.append(node);
 ports.activate(node,options?.prompt||'');
 // Preserve the original focus rectangle independently of document dimensions.
 ports.focus({x:node.canvasX,y:node.canvasY,width:300,height:176},node.projectKey);
 ports.history({kind:'text-add',records:[node]});
 void ports.save(node);
 return node;
}

export function dispatchCanvasNodeCreation(kind:CanvasCreatableNodeKind,point:Point,ports:{
 readOnly:boolean;canVideo:()=>boolean;actions:Record<CanvasCreatableNodeKind,(point:Point)=>{id:string}|void|Promise<{id:string}|void>>;
}){
 if(ports.readOnly)return;
 if(kind==='video'&&!ports.canVideo())return;
 return ports.actions[kind](point);
}
