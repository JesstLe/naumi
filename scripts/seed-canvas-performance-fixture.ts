import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/canvas_perf_(admin_)?(baseline|candidate)_20261014$/);
 const db=await import('../src/lib/db'),pw=await import('../src/lib/pw'),media=await import('../src/lib/media-assets');
 const d=JSON.parse(readFileSync(process.env.CANVAS_PERF_SAMPLE!,'utf8')), email='canvas-perf@example.test';
 await db.ensureSchema();await db.getOrCreateUser(email,'画布性能验收');await db.setUserPassword(email,pw.hashPassword('canvas-perf-fixture-20261014'));
 await db.setSetting('admin_password_hash',pw.hashPassword('isolated-fixture-admin'));await db.setSetting('multi_user_enabled','1');
 const arts=d['/api/account'].artworks;await db.addArtworks(email,arts);
 for(const a of arts)await db.getPool().query('UPDATE app_artworks SET canvas_x=$2,canvas_y=$3,created_at=$4,marked=$5 WHERE id=$1',[a.id,a.canvasX??null,a.canvasY??null,a.createdAt,!!a.marked]);
 for(const [key,name] of Object.entries(d['/api/projects'].names))await db.setProjectName(email,key,String(name));
 for(const node of d['/api/canvas/text-nodes'].nodes)await db.upsertCanvasTextNode(email,node);
 const settingsStore=await import('../src/lib/canvas-node-settings-store');await settingsStore.ensureCanvasSettingsSchema();
 for(const [id,settings] of Object.entries(d['/api/canvas/node-settings'].settings)){const kind=arts.some((a:any)=>a.id===id)?'image':'text';await db.getPool().query('INSERT INTO app_canvas_node_settings(email,node_id,kind,settings)VALUES($1,$2,$3,$4::jsonb)ON CONFLICT(email,node_id)DO UPDATE SET settings=EXCLUDED.settings',[email,id,kind,JSON.stringify(settings)]);}

 const {existsSync}=await import('node:fs');let count=0;
 for(const a of arts){if(!a.image.startsWith('/media/'))continue;const key=a.image.slice(7),file=process.env.MEDIA_DIR+'/'+key;if(!existsSync(file))continue;
 const mime=/\.png$/.test(key)?'image/png':/\.webp$/.test(key)?'image/webp':'image/jpeg';await media.registerMediaAsset(key,readFileSync(file),mime,false,email);count++;}
 console.log('ISOLATED_FIXTURE_READY ARTWORKS='+arts.length+' REAL_MEDIA='+count+' WORKER=OFF PROVIDER_CALLS=0');await db.getPool().end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
