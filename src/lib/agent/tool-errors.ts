import {AsyncLocalStorage} from "node:async_hooks";

/** Submission knowledge belongs to one invocation, never the whole resident
 * session. A later failed poll cannot turn an accepted write into a refusal. */
const attempts=new AsyncLocalStorage<{mayHaveSubmitted:boolean}>();
export function withAgentToolAttempt<T>(run:()=>Promise<T>){return attempts.run({mayHaveSubmitted:false},run);}
export function agentToolAttempt(){return attempts.getStore();}
export class AgentToolHttpError extends Error {
  readonly deterministic=true;
  constructor(message:string,readonly status:number,readonly code:string|undefined,readonly submitted:false|"unknown"){
    super(message);this.name="AgentToolHttpError";
  }
}
