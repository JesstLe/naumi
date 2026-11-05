// Original CLI now exercises the real writer/Route/full-schema PG owner.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const p=spawnSync(process.execPath,['--conditions=react-server','--import','tsx',path.join(__dirname,'verify-canvas-position-owner-pg.ts'),...process.argv.slice(2)],{cwd:process.cwd(),env:process.env,stdio:'inherit',windowsHide:true});
if(p.error)throw p.error;process.exitCode=p.status??1;
