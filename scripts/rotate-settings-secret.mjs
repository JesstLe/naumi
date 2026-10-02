import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Pool } from "pg";

// Run while the app and workers are stopped. Never prints plaintext or secrets.
const oldSecret=process.env.OLD_SETTINGS_SECRET;
const newSecret=process.env.NEW_SETTINGS_SECRET;
if (!process.env.DATABASE_URL || !oldSecret || !newSecret || newSecret.length<32 || oldSecret===newSecret || /^(naumi-insecure-default|change-me.*|changeme)$/.test(newSecret)) {
  throw new Error("需要 DATABASE_URL、OLD_SETTINGS_SECRET 和独立随机 NEW_SETTINGS_SECRET（至少32字符）");
}
const connectionString=process.env.DATABASE_URL;
const noSsl=/sslmode=disable|@(localhost|127\.0\.0\.1|db|postgres|nv-postgres|host\.docker\.internal)[:/]/.test(connectionString);
const pool=new Pool({connectionString,ssl:noSsl ? false : {rejectUnauthorized:false}});
const client=await pool.connect();
const apply=process.argv.includes("--apply");
const oldKey=createHash("sha256").update(oldSecret).digest();
const newKey=createHash("sha256").update(newSecret).digest();
function reencrypt(blob) {
  const parts=blob.split(".");
  if (parts.length!==3) throw new Error("密文格式异常，迁移已取消");
  const [iv,tag,ct]=parts.map(part=>Buffer.from(part,"base64"));
  const decipher=createDecipheriv("aes-256-gcm",oldKey,iv);
  decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(ct),decipher.final()]);
  const nextIv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",newKey,nextIv);
  const next=Buffer.concat([cipher.update(plain),cipher.final()]);
  plain.fill(0);
  return [nextIv,cipher.getAuthTag(),next].map(part=>part.toString("base64")).join(".");
}
try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE app_settings IN ACCESS EXCLUSIVE MODE");
  const settings=await client.query("SELECT k,v FROM app_settings WHERE right(k,4)='_enc' AND v<>'' FOR UPDATE");
  for(const row of settings.rows) {
    const value=reencrypt(row.v);
    if(apply) await client.query("UPDATE app_settings SET v=$2 WHERE k=$1",[row.k,value]);
  }
  let providers=0;
  const exists=await client.query("SELECT to_regclass('app_user_image_providers') AS name");
  if(exists.rows[0].name) {
    await client.query("LOCK TABLE app_user_image_providers IN ACCESS EXCLUSIVE MODE");
    const rows=await client.query("SELECT id,base_url_enc,api_key_enc FROM app_user_image_providers FOR UPDATE");
    for(const row of rows.rows) {
      const base=row.base_url_enc ? reencrypt(row.base_url_enc) : "";
      const api=row.api_key_enc ? reencrypt(row.api_key_enc) : "";
      if(apply) await client.query("UPDATE app_user_image_providers SET base_url_enc=$2,api_key_enc=$3 WHERE id=$1",[row.id,base,api]);
      providers++;
    }
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(`${apply ? "MIGRATED" : "CHECKED"} settings=${settings.rows.length} providers=${providers}`);
  if(apply) console.log("现在将部署 SETTINGS_SECRET 改为 NEW_SETTINGS_SECRET 后重启。原有会话已失效。");
} catch {
  await client.query("ROLLBACK");
  console.error("迁移失败：请核验旧密钥、数据库及密文；所有修改已回滚。");
  process.exitCode=1;
} finally {client.release();await pool.end();}
