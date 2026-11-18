/** Use the authorized family and the original display rules. Keep reply text
 * and other wide fields out of both sorts; hydrate only the selected winners.
 * $2 is the recovered array, $3 the page size and $4 the offset. */
export const creationAssetPageCtes = `asset_rows AS(
 SELECT a.id,NULL::int AS recovered_index,a.direction,a.role,a.variant,a.position,a.storage_ref,a.hash,a.availability,a.media_type
 FROM app_creation_assets a JOIN family f ON f.id=a.creation_id
 UNION ALL SELECT value->>'id',(ordinality-1)::int,value->>'direction',value->>'role',value->>'variant',
  (value->>'position')::int,value->>'storage_ref',value->>'hash',value->>'availability',value->>'media_type'
 FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY),
 keyed_assets AS MATERIALIZED(SELECT id,recovered_index,role,variant,position,
  CASE WHEN direction='output' THEN 0 WHEN variant='original' THEN 1 ELSE 2 END AS display_group,
  CASE
   WHEN direction='output' AND storage_ref LIKE 'artwork:%' THEN jsonb_build_array('output',storage_ref)::text
   WHEN direction='input' AND media_type='image' AND availability='recorded'
    AND (hash ~ '^[a-fA-F0-9]{64}$' OR storage_ref LIKE '/media/%' OR storage_ref LIKE 'artwork:%')
    THEN jsonb_build_array('input-image',CASE WHEN role='mask' THEN 'mask' ELSE 'picture' END,
     CASE WHEN hash ~ '^[a-fA-F0-9]{64}$' THEN 'sha256:'||lower(hash) ELSE 'ref:'||storage_ref END)::text
   ELSE jsonb_build_array('record',id)::text END AS asset_key FROM asset_rows),
 representatives AS MATERIALIZED(SELECT DISTINCT ON(asset_key) asset_key,id,recovered_index,position,display_group FROM keyed_assets
  ORDER BY asset_key,(recovered_index IS NOT NULL),CASE WHEN variant='original' THEN 0 ELSE 1 END,
   CASE WHEN role='edit-target' THEN 0 ELSE 1 END,position,id),
 asset_page AS MATERIALIZED(SELECT * FROM representatives ORDER BY display_group,position,id LIMIT $3 OFFSET $4),
 asset_roles AS(SELECT a.asset_key,jsonb_agg(DISTINCT a.role ORDER BY a.role) AS roles
  FROM keyed_assets a JOIN asset_page p ON p.asset_key=a.asset_key GROUP BY a.asset_key)`;

export const creationAssetPageFields=`(SELECT count(*)::int FROM representatives) AS asset_total,
 COALESCE((SELECT jsonb_agg((CASE WHEN p.recovered_index IS NULL
  THEN (SELECT to_jsonb(a) FROM app_creation_assets a WHERE a.id=p.id)
  ELSE $2::jsonb->p.recovered_index END)||jsonb_build_object('roles',r.roles) ORDER BY p.display_group,p.position,p.id)
  FROM asset_page p JOIN asset_roles r USING(asset_key)),'[]'::jsonb) AS assets`;
