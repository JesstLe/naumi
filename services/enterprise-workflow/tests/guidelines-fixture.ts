import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {CatalogStore} from '../src/catalog-store';
import {resolveDatabaseActor} from '../src/identity';
import type {CatalogDocument} from '../src/catalog-contracts';
export async function seedGuidelineCatalog(pool:Pool,enterpriseId:string,teamId:string,subject:string,publisher:string){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1')throw Error('ISOLATED_FIXTURE_REQUIRED');
 await pool.query('INSERT INTO enterprise_workflow.catalog_admins(enterprise_id,subject)VALUES($1,$2),($1,$3) ON CONFLICT(enterprise_id,subject)DO UPDATE SET enabled=true',[enterpriseId,subject,publisher]);
 const brandId=randomUUID(),shopId=randomUUID(),productId=randomUUID(),skuId=randomUUID(),catalog=new CatalogStore(pool,resolveDatabaseActor),p={enterpriseId,teamId,subject};
 const documents:CatalogDocument[]=[{id:brandId,kind:'brand',name:'合成品牌 · 清和',enabled:true,externalRef:null},{id:shopId,kind:'shop',name:'合成旗舰店',channel:'fixture',teamIds:[teamId],enabled:true,externalRef:null},{id:productId,kind:'product',name:'合成产品',brandId,sellingPoints:'待规范人工核准',enabled:true,externalRef:null},{id:skuId,kind:'sku',name:'合成SKU',productId,shopIds:[shopId],specification:'test',barcode:null,enabled:true,externalRef:null}],input={entries:documents.map(document=>({expectedVersion:0,document})),reason:'isolated guideline brand catalog'},plan=await catalog.preview(p,input);await catalog.apply(p,{...input,commandId:randomUUID(),previewHash:plan.previewHash,confirmed:true});return {brandId,shopId,productId,skuId,selection:{shopId,skuId,revisions:{brand:1,shop:1,product:1,sku:1}}};
}
export function guidelineFixtureDefinition(){return {title:'清和 · 电商主视觉规范',channel:'旗舰店详情页',brandNotes:'固定Logo留白与主色；图片只用已核对资料',palette:['#2456DF','#F4F7FC'],typography:'按企业已授权字体清单核对',approvedClaims:'仅采用已核准商品事实',restrictedClaims:'禁止未经依据的绝对化宣传',sourceNote:'合成测试资料，不代表真实品牌授权',validFrom:'2020-01-01T00:00:00Z',validUntil:'2030-01-01T00:00:00Z',checks:[{id:randomUUID(),label:'品牌与商品信息一致',mandatory:true},{id:randomUUID(),label:'辅助装饰按适用场景核对',mandatory:false}]};}
