import { imageWorkerAuthorized } from "@/lib/worker/authorization";
import { readWorkerDrainStatus } from '@/lib/worker/drain-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'private, no-store' };

export async function GET(request: Request) {
  if (!imageWorkerAuthorized(request)) return Response.json({ error: 'worker authentication failed' }, { status: 401, headers });
  try { return Response.json(await readWorkerDrainStatus(), { headers }); }
  catch { return Response.json({ error: 'worker drain state not verified' }, { status: 503, headers }); }
}
