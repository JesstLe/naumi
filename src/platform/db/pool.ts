import "server-only";
import {Pool} from "pg";

/** Infrastructure only: importing this module never initializes schema or connects.
 * Both this entry and the legacy db facade use the same lazy query pool. */
export const dbEnabled=(process.env.DATABASE_URL??"").trim().length>0;
let pool:Pool|null=null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    const cs = connectionString || "";
    // 本地 / Docker 内网 / 显式 sslmode=disable → 不启用 SSL:自建或 compose 自带的
    // Postgres 默认不支持 SSL(host 常见为 db / localhost / 127.* / 私有网段 / 容器名)。
    // 只有远程托管库(如 Supabase 公网域名)才保留 SSL。
    const noSsl =
      /sslmode=disable/.test(cs) ||
      /@(localhost|127\.0\.0\.1|db|postgres|nv-postgres|host\.docker\.internal)[:/]/.test(cs) ||
      /@(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(cs);
    pool = new Pool({
      connectionString,
      ssl: noSsl ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}
