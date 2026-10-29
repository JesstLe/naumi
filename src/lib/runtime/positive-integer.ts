/** Runtime capacity settings are explicit: a typo must not silently select a
 * different capacity. Only absence selects the compatible default. Never echo
 * environment values in a diagnostic. Owners supply their actual contract cap. */
export function runtimePositiveInteger(
  env: NodeJS.ProcessEnv, name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`INVALID_RUNTIME_SETTING:${name}`);
  }
  return value;
}
