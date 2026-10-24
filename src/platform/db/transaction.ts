import "server-only";
import type {Pool,PoolClient} from "pg";

/** A single checked-out connection owns BEGIN/action/COMMIT/ROLLBACK/release.
 * No schema, retry, advisory lock, billing or other domain policy is implicit. */
export async function withTransaction<T>(pool: Pool, action: (tx: PoolClient) => Promise<T>): Promise<T> {
    const tx = await pool.connect();
    try {
        await tx.query("BEGIN");
        const result = await action(tx);
        await tx.query("COMMIT");
        return result;
    }
    catch (error) {
        await tx.query("ROLLBACK");
        throw error;
    }
    finally {
        tx.release();
    }
}
