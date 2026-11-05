import type {GeneratedImage} from "./generation-types";
import type {SessionUser} from "../auth-context";

/** The browser's view of an existing generation job, not another task engine.
 * The backend alone owns acceptance, execution, results and customer billing. */
export type GenerationDraft={
  prompt:string;category:string;ratio:string;resolution:string;quality:string;style:string;count:number;model:string;
  parentId:string;template:{id:string;image:string;prompt:string}|null;files:File[];sourceLoading:boolean;
};
export type GenerationReceipt={status?:string;jobId?:string;error?:string;images?:GeneratedImage[];user?:SessionUser};
export type GenerationRead={ok:boolean;status:number;data:GenerationReceipt};
export type GenerationSessionContext={
  ready:boolean;remaining:number;cost:number;
  messages:{prompt:string;insufficient:string;failed:string;missingJob:string;retry:string;timeout:string};
  signIn():void;
  submit(input:GenerationDraft,account:string,beforeSend:()=>void):Promise<GenerationRead>;
  read(jobId:string,signal:AbortSignal):Promise<GenerationRead|null>;
  remember(jobId:string|null):void;
  loading(value:boolean,current:()=>boolean):void;
  error(value:string|null,current:()=>boolean):void;
  images(change:(previous:GeneratedImage[])=>GeneratedImage[]):void;
  delivered(current:()=>boolean):void;
  user(value:SessionUser):void;
  consume(credits:number):void;
};
type Scope={account:string;submitAccount:string;active:boolean;discoveryGeneration:number};
type Observation={scope:Scope;generation:number;controller:AbortController;jobId:string|null};

export function createGenerationSession(currentAccount:()=>string|undefined){
  let scope:Scope|null=null,observation:Observation|null=null,generation=0;
  const normalized=(email:string|undefined)=>email?.trim().toLowerCase()||"";
  const owns=(owner:Observation)=>owner.scope.active&&scope===owner.scope&&owner.generation===generation&&normalized(currentAccount())===owner.scope.account;
  function detach(){generation++;observation?.controller.abort();observation=null;}
  function bindAccount(email:string|undefined){
    detach();if(scope)scope.active=false;
    const next={account:normalized(email),submitAccount:email||"",active:true,discoveryGeneration:generation};scope=next;
    return ()=>{next.active=false;if(scope===next)detach();};
  }
  function begin(context:GenerationSessionContext){
    if(!scope?.active||!scope.account||scope.account!==normalized(currentAccount())||observation)return null;
    const owner:Observation={scope,generation:++generation,controller:new AbortController(),jobId:null};
    observation=owner;const current=()=>owns(owner);
    context.loading(true,current);context.error(null,current);return owner;
  }
  function delay(owner:Observation){
    return new Promise<void>(resolve=>{
      const signal=owner.controller.signal;
      if(signal.aborted){resolve();return;}
      const finish=()=>{clearTimeout(timer);signal.removeEventListener("abort",finish);resolve();};
      const timer=setTimeout(finish,2500);signal.addEventListener("abort",finish,{once:true});
    });
  }
  async function receive(owner:Observation,jobId:string,cost:number,context:GenerationSessionContext){
    owner.jobId=jobId;const deadline=Date.now()+30*60*1000,current=()=>owns(owner);
    while(current()){
      const result=await context.read(jobId,owner.controller.signal);
      if(!current())return;
      if(result){
        const {ok,status,data}=result;
        if(!ok){
          if(status===403||status===404)context.remember(null);
          // A transient receipt failure is not permission to repeat a paid POST.
          if(status<500&&status!==429)throw Error(data.error||context.messages.failed);
        }else{
          if(data.user)context.user(data.user);
          if(data.status==="error"){context.remember(null);throw Error(data.error||context.messages.failed);}
          if(data.status==="done"){
            if(!Array.isArray(data.images))throw Error(context.messages.failed);
            const images=data.images;
            if(!data.user&&cost)context.consume(cost);
            context.images(previous=>current()?[
              ...previous,...images.filter(image=>!previous.some(existing=>existing.id===image.id)),
            ]:previous);
            context.delivered(current);context.remember(null);return;
          }
        }
      }
      if(Date.now()>deadline)throw Error(context.messages.timeout);
      await delay(owner);
    }
  }
  async function execute(owner:Observation,context:GenerationSessionContext,run:()=>Promise<void>){
    const current=()=>owns(owner);
    try{await run();}
    catch(error){if(current())context.error(error instanceof Error?error.message:context.messages.retry,current);}
    finally{
      if(current())context.loading(false,current);
      if(observation===owner)observation=null;
      owner.controller.abort();
    }
  }
  async function generate(input:GenerationDraft,context:GenerationSessionContext){
    if(observation||input.sourceLoading)return;
    if(!currentAccount()){if(context.ready)context.signIn();return;}
    const validationScope=scope,validationGeneration=generation;
    const accountCurrent=()=>Boolean(validationScope?.active&&scope===validationScope&&generation===validationGeneration&&scope.account===normalized(currentAccount()));
    if(!input.prompt.trim()){context.error(context.messages.prompt,accountCurrent);return;}
    if(context.remaining<context.cost){context.error(context.messages.insufficient,accountCurrent);return;}
    const owner=begin(context);if(!owner)return;
    // Capture editable references, not a mutable file list supplied by the view.
    const frozen={...input,files:[...input.files],template:input.template?{...input.template}:null};
    await execute(owner,context,async()=>{
      const assertCurrent=()=>{if(!owns(owner))throw new DOMException("Generation view detached","AbortError");};
      const {ok,data}=await context.submit(frozen,owner.scope.submitAccount,assertCurrent);
      if(!owns(owner))return;
      if(!ok)throw Error(data.error||context.messages.failed);
      if(!data.jobId)throw Error(context.messages.missingJob);
      context.remember(data.jobId);
      await receive(owner,data.jobId,context.cost,context);
    });
  }
  async function resume(jobId:string,context:GenerationSessionContext){
    // Discovery started at account bind. A later explicit click wins even if
    // its task has already finished when the old active-list response arrives.
    if(!jobId||observation||scope?.discoveryGeneration!==generation)return;
    const owner=begin(context);if(!owner)return;
    await execute(owner,context,()=>receive(owner,jobId,0,context));
  }
  return {bindAccount,generate,resume};
}
