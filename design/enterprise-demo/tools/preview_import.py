"""Read-only XLSX / exported ZIP -> local review JSON; standard library only."""
import argparse,collections,hashlib,io,json,pathlib,re,zipfile
import xml.etree.ElementTree as E

NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
MAX_XLSX=60*1024*1024
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def analyse(path):
 path=pathlib.Path(path);sourcehash=sha(path);outer_names=None
 if path.suffix.lower()=='.zip':
  with zipfile.ZipFile(path) as o:
   mains=[i for i in o.infolist() if '/' not in i.filename and '\\' not in i.filename and i.filename.lower().endswith('.xlsx')]
   if len(mains)!=1:raise ValueError('ZIP需且仅需一个根部主xlsx')
   if mains[0].file_size>MAX_XLSX:raise ValueError('主xlsx超过60MiB')
   data=o.read(mains[0]);outer_names=set(o.namelist())
 else:
  if path.suffix.lower()!='.xlsx' or path.stat().st_size>MAX_XLSX:raise ValueError('请提供60MiB以内xlsx或导出ZIP')
  data=path.read_bytes()
 issues=[]
 def issue(row,code,msg):issues.append({'excelRow':row,'code':code,'message':msg})
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  for f in ['xl/workbook.xml','xl/_rels/workbook.xml.rels']:
   if f not in z.namelist():raise ValueError('xlsx缺少工作簿结构')
  wb=E.fromstring(z.read('xl/workbook.xml'));sheets=wb.find('s:sheets',NS)
  if len(sheets)!=1:raise ValueError('本工具仅预演单工作表，请逐表提供，不自动合并多表')
  sheet=sheets[0];rid=sheet.get('{'+NS['r']+'}id');rels=E.fromstring(z.read('xl/_rels/workbook.xml.rels'))
  rel=next(x for x in rels if x.get('Id')==rid);target=rel.get('Target');sheetpath=target.lstrip('/') if target.startswith('/') else 'xl/'+target
  if '..' in pathlib.PurePosixPath(sheetpath).parts or not sheetpath.startswith('xl/worksheets/'):raise ValueError('工作表路径不支持')
  if z.getinfo(sheetpath).file_size>32*1024*1024:raise ValueError('工作表XML超过32MiB')
  strings=[]
  if 'xl/sharedStrings.xml' in z.namelist():
   if z.getinfo('xl/sharedStrings.xml').file_size>16*1024*1024:raise ValueError('共享文字超过16MiB')
   strings=[''.join(t.text or '' for t in si.findall('.//s:t',NS)) for si in E.fromstring(z.read('xl/sharedStrings.xml'))]
  def val(c):
   v=c.find('s:v',NS);s=v.text or '' if v is not None else ''.join(t.text or '' for t in c.findall('s:is//s:t',NS))
   return strings[int(s)] if c.get('t')=='s' and s else s
  xml=E.fromstring(z.read(sheetpath));rs=xml.findall('s:sheetData/s:row',NS)
  if not rs or len(rs)>10001:raise ValueError('工作表为空或超过10000行')
  headers={c.get('r').rstrip('0123456789'):val(c) for c in rs[0]}
  find=lambda name:next((k for k,v in headers.items() if v==name),None)
  if not find('产品需求名称') or not find('父记录'):raise ValueError('缺少产品需求名称/父记录字段')
  rows=[]
  for x in rs[1:]:
   raw={};cells={}
   for c in x:
    if c.find('s:f',NS) is not None:continue
    key=headers.get(c.get('r').rstrip('0123456789'),c.get('r').rstrip('0123456789'));v=val(c);cells[c.get('r')]=v
    if key not in raw or not raw[key]:raw[key]=v
   r={'excelRow':int(x.get('r')),'title':raw.get('产品需求名称',''),'parentLabel':raw.get('父记录',''),'raw':raw,'rawCells':cells};rows.append(r)
   if any(c.find('s:f',NS) is not None for c in x):issue(r['excelRow'],'FORMULA_NOT_EVALUATED','公式未执行；相关字段保持待核对')
  parent=collections.defaultdict(list)
  for r in rows:
   if r['title'] and not r['parentLabel']:parent[r['title']].append(r['excelRow'])
  freq=collections.Counter(r['raw'].get('设计完成日期') for r in rows if r['raw'].get('设计完成日期'))
  def realdate(v):
   from datetime import date
   try:return date.fromisoformat(v)
   except (ValueError,TypeError):return None
  for r in rows:
   no=r['excelRow'];raw=r['raw'];p=r['parentLabel'];r['parentCandidates']=parent.get(p,[]) if p else []
   if not r['title']:issue(no,'EMPTY_TITLE','名称空白，保留原行等待确认')
   if not raw.get('任务完成情况'):issue(no,'EMPTY_STATUS','状态空白，不自动补为未开始/已完成')
   if p and len(parent.get(p,[]))>1:issue(no,'AMBIGUOUS_PARENT','同名父记录不唯一：候选源行'+','.join(map(str,parent[p])))
   if p and not parent.get(p):issue(no,'MISSING_PARENT','父名称没有候选记录')
   a,b=realdate(raw.get('下发日期')),realdate(raw.get('设计完成日期'))
   if a and b and b<a:issue(no,'DATE_BEFORE_DISPATCH','设计完成日期早于下发日期，日期语义需确认')
   if raw.get('设计完成日期') and freq[raw['设计完成日期']]>=30:issue(no,'REPEATED_DESIGN_DATE','完成日期大量重复，不自动当作验收时间')
   q=raw.get('数量','')
   if re.fullmatch(r'\d+(\.\d+)?',q):issue(no,'UNKNOWN_QUANTITY_UNIT','纯数字数量缺单位')
   if '+' in q:issue(no,'ESTIMATED_MIN_QUANTITY','数量含+，保留原文，不转精确数量')
  issue(0,'MISSING_SOURCE_ID','导出未提供原始稳定recordId，行号仅用于本批追溯')
  issue(0,'UPLOAD_TIME_UNAVAILABLE','未取得文档真实上传时间，不用ZIP时间代替')
  links=0;missing=[];relpath=str(pathlib.PurePosixPath(sheetpath).parent/'_rels'/pathlib.PurePosixPath(sheetpath).name)+'.rels'
  if relpath in z.namelist():
   import urllib.parse
   for rel in E.fromstring(z.read(relpath)):
    if 'hyperlink' in rel.get('Type',''):
     links+=1;t=urllib.parse.unquote(rel.get('Target','')).replace('\\','/').lstrip('./')
     if outer_names is not None and t not in outer_names and not any(n.startswith(t.rstrip('/')+'/') for n in outer_names):missing.append(t)
  for t in missing:issue(0,'MISSING_ATTACHMENT','包内未定位附件：'+t)
 result={'schema':'enterprise-import-preview-v1','sourceHash':sourcehash,'workbookHash':hashlib.sha256(data).hexdigest(),'sheet':sheet.get('name'),'headers':headers,'rows':rows,'issues':issues,'summary':{'rows':len(rows),'children':sum(bool(r['parentLabel']) for r in rows),'issuesByCode':dict(collections.Counter(i['code'] for i in issues)),'attachmentReferences':links,'attachmentPathsChecked':outer_names is not None,'missingAttachmentReferences':len(missing)}}
 if sha(path)!=sourcehash:raise ValueError('源文件分析期间发生变化，停止交付预演')
 return result
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);args=p.parse_args()
 out=args.output.resolve();source=args.source.resolve()
 if out==source:raise ValueError('输出不得覆盖源文件')
 result=analyse(source);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 print('IMPORT_PREVIEW_PASS: rows='+str(len(result['rows']))+' children='+str(result['summary']['children'])+' ambiguous='+str(result['summary']['issuesByCode'].get('AMBIGUOUS_PARENT',0))+' business_writes=0 source_unchanged=1')
if __name__=='__main__':main()
