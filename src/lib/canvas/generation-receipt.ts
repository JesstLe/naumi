/** One read-only receipt attempt. Transport failures leave acceptance unknown;
 * callers retry GET for the same job within their existing overall deadline. */
export async function readCanvasGenerationReceipt(jobId:string,headers:HeadersInit){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30_000);
  try {
    let response:Response,text:string;
    try {
      response=await fetch(`/api/generate-image?job=${encodeURIComponent(jobId)}`,{
        cache:'no-store',headers,signal:controller.signal,
      });
      // Keep the deadline active through body consumption, not just headers.
      text=await response.text();
    } catch {return null;}
    let data:any;
    try {data=text?JSON.parse(text):{};}
    catch {throw new Error(!response.ok?`服务暂时不可用(${response.status}),请刷新页面后重试`:'服务返回异常,请重试');}
    return {response,data};
  } finally {clearTimeout(timer);}
}
