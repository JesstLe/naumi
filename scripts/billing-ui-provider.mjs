import {createServer} from "node:http";
import sharp from "sharp";

/** An owned loopback supplier for the actual built application's browser tests.
 * It never proxies requests or records credentials, prompts or image bodies. */
export async function createBillingUiProvider() {
    const image = await sharp({create:{width:1024,height:1024,channels:3,background:"#ffffff"}}).png().toBuffer();
    const requests = [];
    const snapshot = () => ({fixture:true,requests:[...requests],imagePosts:requests.filter(row=>row.method==="POST"&&row.path.startsWith("/v1/images/")).length});
    const server = createServer(async (request, response) => {
        try {
            let raw = "";
            for await (const chunk of request) raw += chunk;
            let body = {};
            try { body = JSON.parse(raw); } catch { /* multipart is not needed by this generated-image case */ }
            response.setHeader("content-type", "application/json");
            if (request.method === "GET" && request.url === "/fixture/stats") { response.end(JSON.stringify(snapshot())); return; }
            requests.push({method:request.method,path:request.url,model:body.model||null,n:body.n||null});
            if (request.method === "GET" && request.url === "/v1/models") {
                response.end(JSON.stringify({object:"list",data:["gpt-image-1","gpt-image-2","gpt-image-1.5"].map(id=>({id,object:"model",owned_by:"fixture"}))}));return;
            }
            if (request.method === "POST" && request.url === "/v1/images/generations") {
                response.end(JSON.stringify({created:Math.floor(Date.now()/1000),model:body.model,data:Array.from({length:Number(body.n)||1},()=>({b64_json:image.toString("base64")}))}));return;
            }
            response.statusCode=404;response.end(JSON.stringify({error:{message:"No billing UI fixture endpoint"}}));
        } catch { response.statusCode=500;response.end(JSON.stringify({error:{message:"Billing UI fixture request failed"}})); }
    });
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
    return {origin:`http://127.0.0.1:${server.address().port}`,snapshot,async close(){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
