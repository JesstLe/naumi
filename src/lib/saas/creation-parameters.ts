/** Public creation facts only. Never expose model credentials, URLs or wire bodies. */
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
export function publicCreationParameters(value:unknown):Record<string,unknown>{
 const p=object(value),allowed=['ratio','resolution','quality','count','quantity','size','seconds','durationSeconds','aspectRatio','generateAudio','watermark','mode','width','height','x','y','platform','style','lang','seed','variants','inputFidelity','moderation','format','compression','background','compressionMode','flattenColor','downscaleMaxDim'];
 const out:Record<string,unknown>={};for(const k of allowed)if(Object.hasOwn(p,k)&&['string','number','boolean'].includes(typeof p[k]))out[k]=typeof p[k]==='string'?p[k].slice(0,120):p[k];
 for(const k of ['parameters','output','intent','crop'])if(p[k]&&typeof p[k]==='object'){const nested=publicCreationParameters(p[k]);if(Object.keys(nested).length)out[k]=nested;}
 return out;
}
/** Read exactly the accepted/frozen source shape, not today's model defaults. */
export function creationRequestFacts(payload:unknown,parameters?:unknown,prompt?:unknown){
 const p=object(payload),gen=object(p.p),request=object(object(p.plan).request||object(gen.imagegen).request||p.request);
 const text=request.prompt??gen.userPrompt??gen.prompt??object(parameters).newText??object(parameters).prompt??p.prompt??prompt;
 return {text:typeof text==='string'?text:null,values:publicCreationParameters({...gen,...(typeof request.variants==='number'?{variants:request.variants}:{}),...object(request.parameters),...object(request.output),...object(p.parameters),...object(parameters)})};
}
