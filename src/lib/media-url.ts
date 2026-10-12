/** Persisted image URLs accepted by the product UI; not a fetch/authorization policy. */
export function isHostedImageUrl(value: unknown): value is string {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || value.startsWith("/media/"));
}
