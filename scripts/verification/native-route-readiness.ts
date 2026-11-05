import assert from 'node:assert/strict';

type FixtureReader={request(account:'a',method:'GET',url:string):Promise<{status:number}>};

/** Compile the existing method-only routes before Canvas/WebGL is resident.
 * GET must remain 405: no upload, render, generation or paid POST is issued. */
export async function prewarmNativeWriteRoutes(fixture:FixtureReader,urls:readonly string[]){
 const receipts:Array<{url:string;method:'GET';status:405}>=[];
 for(const url of urls){
  const response=await fixture.request('a','GET',url);
  assert.equal(response.status,405,`Native write route readiness: ${url}`);
  receipts.push({url,method:'GET',status:405});
 }
 return receipts;
}
