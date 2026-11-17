/** Read projection only. Original evidence and the authorized family are unchanged. */
export const creationAssetKeysSql = `
 keyed_assets AS MATERIALIZED(SELECT data,priority,CASE
  WHEN data->>'direction'='output' AND data->>'storage_ref' LIKE 'artwork:%'
   THEN jsonb_build_array('output',data->>'storage_ref')::text
  WHEN data->>'direction'='input' AND data->>'media_type'='image' AND data->>'availability'='recorded'
   AND (data->>'hash' ~ '^[a-fA-F0-9]{64}$' OR data->>'storage_ref' LIKE '/media/%' OR data->>'storage_ref' LIKE 'artwork:%')
   THEN jsonb_build_array('input-image',CASE WHEN data->>'role'='mask' THEN 'mask' ELSE 'picture' END,
    CASE WHEN data->>'hash' ~ '^[a-fA-F0-9]{64}$' THEN 'sha256:'||lower(data->>'hash') ELSE 'ref:'||(data->>'storage_ref') END)::text
  ELSE jsonb_build_array('record',data->>'id')::text END AS asset_key FROM asset_rows),
 representatives AS MATERIALIZED(SELECT DISTINCT ON(asset_key) asset_key,data FROM keyed_assets
  ORDER BY asset_key,priority,CASE WHEN data->>'variant'='original' THEN 0 ELSE 1 END,
   CASE WHEN data->>'role'='edit-target' THEN 0 ELSE 1 END,(data->>'position')::int,data->>'id')`;

export const creationAssetViewOrder = `CASE WHEN data->>'direction'='output' THEN 0
 WHEN data->>'variant'='original' THEN 1 ELSE 2 END,(data->>'position')::int,data->>'id'`;
