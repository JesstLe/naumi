import 'server-only';
import { Pool } from 'pg';

// Shared by business repositories; this module has no business dependencies.
let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    const cs = connectionString || '';
    const noSsl = /sslmode=disable/.test(cs)
      || /@(localhost|127\.0\.0\.1|db|postgres|nv-postgres|host\.docker\.internal)[:/]/.test(cs)
      || /@(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(cs);
    pool = new Pool({ connectionString, ssl: noSsl ? false : { rejectUnauthorized: false }, max: 5 });
  }
  return pool;
}
