/** Process configuration, without assembling control services. */
export function modelTrustedOrigins() { return (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean); }
