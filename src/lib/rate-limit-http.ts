import 'server-only';
import { NextResponse } from 'next/server';
import { rateLimit, RateLimitUnavailableError } from './rate-limit';

export function rateLimitFailureResponse(error: unknown): NextResponse | null {
  if (!(error instanceof RateLimitUnavailableError)) return null;
  return NextResponse.json({ error: error.message, code: error.code }, {
    status: 503, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '1' },
  });
}

/** The entry keeps its existing exhausted-quota response (including headers).
 * An unavailable store is an immediate 503, never a truthy Promise or a 429.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean | NextResponse> {
  try { return await rateLimit(key, limit, windowMs); }
  catch (error) {
    const response = rateLimitFailureResponse(error);
    if (response) return response;
    throw error;
  }
}
