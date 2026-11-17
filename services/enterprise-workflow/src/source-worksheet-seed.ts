import type {ImportedRow} from './import-store';
import type {SheetColumn,SheetDocument,SheetRow} from './source-worksheet-store';
import {sourceDigest} from './source-files';

type Row = {document:Omit<ImportedRow,'version'|'resolution'>;resolution:ImportedRow['resolution']};
type Asset = {id:string;name:string};
export type WorksheetSeed = {rows:Row[];assets:Asset[]};

const baseColumns:[string,string,SheetColumn['type'],number,string?][]=[
 ['title','产品需求 / 制作任务','text',310,'产品需求名称'],['image','产品图','image',100],['designer','设计师','text',135,'设计师'],['owner','需求方','text',130,'需求方'],['started','沟通后开始','date',140,'任务沟通后开始时间'],['finished','完成日期','date',140,'设计完成日期'],['status','完成情况','text',115,'任务完成情况'],['schedule','排期标签','text',160,'任务排期情况'],['quantity','数量','text',110,'数量'],['files','需求附件','files',130],['dispatch','下发日期','date',140,'下发日期'],['taskType','任务类型','text',140,'任务类型'],['attributes','属性','text',160,'属性（运营填写）'],['send','发送任务','text',130,'发送任务'],['parentText','原父标签','text',180,'父记录']
];

/** Preserve the source asset order while looking up only the IDs attached to each row. */
export function projectImportedWorksheet({rows,assets}:WorksheetSeed):SheetDocument{
 const byAsset=new Map<string,{asset:Asset;position:number}[]>();
 assets.forEach((asset,position)=>{const indexed={asset,position},existing=byAsset.get(asset.id);if(existing)existing.push(indexed);else byAsset.set(asset.id,[indexed]);});
 const columns:SheetColumn[]=baseColumns.map(([id,label,type,width])=>({id,label,type,width,visible:!['dispatch','taskType','attributes','send','parentText'].includes(id),archived:false}));
 const fields=new Map(baseColumns.flatMap(([id,,,,field])=>field?[[id,field] as const]:[]));
 const known=new Set([...fields.values(),'白底产品图','运营需求文档（必传文档，按上传文档时间设计排期）']);
 outer:for(const {document} of rows)for(const field of Object.keys(document.raw)){
  if(known.has(field))continue;
  if(columns.length>=64)break outer;
  known.add(field);const id='raw_'+sourceDigest(field).slice(0,16);fields.set(id,field);
  columns.push({id,label:field.slice(0,80),type:'text',width:160,visible:false,archived:false});
 }
 return {columns,rows:rows.map(({document:r,resolution})=>{
  const attached=new Set(r.attachments.flatMap(link=>link.assets));
  const ordered=[...attached].flatMap(id=>byAsset.get(id)??[]).sort((a,b)=>a.position-b.position);
  const rowCells:SheetRow['cells']={};
  for(const col of columns)rowCells[col.id]=r.raw[fields.get(col.id)??'']||'';
  rowCells.image=[];rowCells.files=[];
  for(const {asset:{id,name}} of ordered)(/\.(png|jpe?g)$/i.test(name)?rowCells.image:rowCells.files).push({kind:'source',id,name});
  rowCells.title=r.title;const parent=resolution?.parentRow||(r.parentCandidates.length===1?r.parentCandidates[0]:null);
  return {id:'e'+r.excelRow,originRow:r.excelRow,parentId:parent?'e'+parent:null,parentConfirmed:!!resolution,archived:false,cells:rowCells};
 })};
}
