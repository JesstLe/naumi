import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
const texts=new AsyncLocalStorage<{actor:string;values:Record<string,string>}>();
export function frozenWorkflowText(actor:string,nodeId:string){const scope=texts.getStore();const id=nodeId.replace(/^text:/,"");return scope?.actor===actor.toLowerCase()&&Object.hasOwn(scope.values,id)?scope.values[id]:undefined;}
export function runFrozenWorkflowTexts<T>(actor:string,values:Record<string,string>,run:()=>Promise<T>){return texts.run({actor:actor.toLowerCase(),values},run);}
