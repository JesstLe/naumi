/** Public lifecycle only. Provider reasoning, text, signatures and tool args
 * are deliberately never copied into this signal. */
export type PublicModelPhase = "processing" | "thinking" | "responding";
export function createModelActivityTracker(emit:(phase:PublicModelPhase)=>void) {
  let previous:PublicModelPhase|undefined;
  return (event:{type:string;message?:{role?:string};assistantMessageEvent?:{type?:string}})=>{
    let phase:PublicModelPhase|undefined;
    if(event.type==="message_start"&&event.message?.role==="assistant")phase="processing";
    if(event.type==="message_update"){
      const type=event.assistantMessageEvent?.type;
      if(type==="thinking_start"||type==="thinking_delta")phase="thinking";
      else if(type==="text_start"||type==="text_delta")phase="responding";
    }
    if(phase&&phase!==previous){previous=phase;emit(phase);}
  };
}
