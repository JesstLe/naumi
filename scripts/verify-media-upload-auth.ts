import assert from 'node:assert/strict';
async function main() {
 process.env.MEDIA_PRIVATE='1';delete process.env.DATABASE_URL;
 const media=await import('../src/app/media/[...path]/route');
 assert.equal((await media.GET(new Request('http://localhost/media/private/a.png'),{params:{path:['private','a.png']}})).status,401);
 assert.equal((await media.GET(new Request('http://localhost/media/../config'),{params:{path:['..','config']}})).status,400);
 const route=await import('../src/app/api/media/uploads/route');
 const unauth=await route.POST(new Request('http://localhost/api/media/uploads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'prepare',bytes:3,contentType:'image/png'})}));
 assert.equal(unauth.status,401,'direct upload must require real account before granting PUT');
 const download=await import('../src/app/api/download/route');
 assert.equal((await download.GET(new Request('http://localhost/api/download?u=%2Fmedia%2Fprivate%2Fa.png'))).status,401);
 console.log('PASS anonymous media/upload/download and traversal denied');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
