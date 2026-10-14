export type StorageDriver = 'local' | 'r2' | 's3';
export type StorageConfiguration = {
  driver: StorageDriver; enabled: boolean; mediaDir: string; privateMedia: boolean;
  accessMode: 'redirect' | 'proxy'; endpoint: string; bucket: string; region: string;
  accessKeyId: string; secretAccessKey: string; pathStyle: boolean; publicBase: string;
};
function baseUrl(raw: string, field: string) {
  if (!raw) return '';
  try { const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/+$/, '');
  } catch { throw new Error(`存储配置 ${field} 地址无效`); }
}
/** Pure parser: no network, no secret-bearing diagnostics, explicit local wins. */
export function storageConfiguration(env: Record<string, string | undefined>): StorageConfiguration {
  const requested = (env.STORAGE_DRIVER || '').toLowerCase();
  if (requested && !['local', 'r2', 's3'].includes(requested)) throw new Error('STORAGE_DRIVER 无效');
  const r2Ready = !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
  const s3Ready = !!(env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_BUCKET);
  if (!requested) {
    const partialR2 = [env.R2_ACCOUNT_ID,env.R2_ACCESS_KEY_ID,env.R2_SECRET_ACCESS_KEY,env.R2_BUCKET].some(Boolean);
    const partialS3 = [env.S3_ENDPOINT,env.S3_ACCESS_KEY_ID,env.S3_SECRET_ACCESS_KEY,env.S3_BUCKET].some(Boolean);
    if (!r2Ready && !s3Ready && (partialR2 || partialS3)) throw new Error('存储配置不完整，请显式选择驱动并补齐配置');
  }
  const driver = (requested || (r2Ready ? 'r2' : s3Ready ? 's3' : 'local')) as StorageDriver;
  const r2 = driver === 'r2';
  const accessMode = env.MEDIA_REMOTE_ACCESS || 'redirect';
  if (!['redirect', 'proxy'].includes(accessMode)) throw new Error('MEDIA_REMOTE_ACCESS 无效');
  const style = env.S3_FORCE_PATH_STYLE || 'true';
  if (driver === 's3' && !/^(true|false|1|0|yes|no)$/i.test(style)) throw new Error('S3_FORCE_PATH_STYLE 无效');
  const account = env.R2_ACCOUNT_ID || '';
  if (r2 && account && !/^[a-zA-Z0-9-]+$/.test(account)) throw new Error('R2_ACCOUNT_ID 无效');
  const bucket = driver === 'local' ? '' : (r2 ? env.R2_BUCKET : env.S3_BUCKET) || '';
  if (bucket && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(bucket)) throw new Error('存储 bucket 无效');
  return { driver, enabled: driver === 'local' || (r2 ? r2Ready : s3Ready), mediaDir: env.MEDIA_DIR || './data/media',
    privateMedia: env.MEDIA_PRIVATE === '1', accessMode: accessMode as 'redirect' | 'proxy',
    endpoint: driver === 'local' ? '' : r2 ? `https://${account}.r2.cloudflarestorage.com` : baseUrl(env.S3_ENDPOINT || '', 'S3_ENDPOINT'),
    bucket, region: r2 ? 'auto' : env.S3_REGION || 'us-east-1', accessKeyId: driver === 'local' ? '' : (r2 ? env.R2_ACCESS_KEY_ID : env.S3_ACCESS_KEY_ID) || '',
    secretAccessKey: driver === 'local' ? '' : (r2 ? env.R2_SECRET_ACCESS_KEY : env.S3_SECRET_ACCESS_KEY) || '',
    pathStyle: r2 || !/^(false|0|no)$/i.test(style), publicBase: driver === 'local' ? '' : baseUrl((r2 ? env.R2_PUBLIC_BASE_URL : env.S3_PUBLIC_BASE_URL) || '', 'PUBLIC_BASE_URL') };
}
