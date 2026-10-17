"""Copy an authorized export to content-addressed local storage; never rewrite source."""
import argparse,hashlib,io,json,pathlib,re,zipfile,urllib.parse,os
import xml.etree.ElementTree as E
from preview_import import analyse,sha,NS

def prepare(source,out):
 source=pathlib.Path(source).resolve();out=pathlib.Path(out).resolve();out.mkdir(parents=True,exist_ok=True)
 p=analyse(source);assets=[];paths={};blobs=out/'blobs';blobs.mkdir(exist_ok=True)
 with zipfile.ZipFile(source) as z:
  infos=[i for i in z.infolist() if not i.is_dir()]
  if len(infos)>5000 or sum(i.file_size for i in infos)>5*1024**3:raise ValueError('EXPORT_LIMIT')
  if len({i.filename for i in infos})!=len(infos):raise ValueError('DUPLICATE_ZIP_PATH')
  for i in infos:
   name=i.filename.replace('\\','/')
   if name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts or ':' in name:raise ValueError('UNSAFE_ZIP_PATH')
   # Files are stored by byte hash, never extracted to user-controlled paths.
   h=hashlib.sha256();tmp=blobs/('part-'+hashlib.sha256(name.encode()).hexdigest())
   with z.open(i) as src,tmp.open('wb') as dst:
    for b in iter(lambda:src.read(1024*1024),b''):h.update(b);dst.write(b)
   digest=h.hexdigest();target=blobs/digest
   if target.exists():
    if sha(target)!=digest:raise ValueError('EXISTING_BLOB_CORRUPT')
    tmp.unlink()
   else:tmp.replace(target)
   aid=hashlib.sha256(name.encode()).hexdigest();a={'id':aid,'path':name,'name':pathlib.PurePosixPath(name).name,'sha256':digest,'bytes':i.file_size,'extension':pathlib.PurePosixPath(name).suffix.lower()}
   assets.append(a);paths[name]=aid
  main=next(i for i in infos if '/' not in i.filename and i.filename.lower().endswith('.xlsx'))
  with zipfile.ZipFile(io.BytesIO(z.read(main))) as x:
   rels={r.get('Id'):r.get('Target') for r in E.fromstring(x.read('xl/worksheets/_rels/sheet1.xml.rels')) if 'hyperlink' in r.get('Type','')}
   sheet=E.fromstring(x.read('xl/worksheets/sheet1.xml'));links=[]
   for link in sheet.findall('s:hyperlinks/s:hyperlink',NS):
    cell=link.get('ref');target=urllib.parse.unquote(rels[link.get('{'+NS['r']+'}id')]).replace('\\','/')
    while target.startswith('./'):target=target[2:]
    if '..' in pathlib.PurePosixPath(target).parts or target.startswith('/') or ':' in target:raise ValueError('UNSAFE_LINK')
    ids=[aid for name,aid in paths.items() if name==target or name.startswith(target.rstrip('/')+'/')]
    if not ids:raise ValueError('ATTACHMENT_MISSING')
    links.append({'excelRow':int(re.search(r'\d+',cell).group()),'cell':cell,'assets':ids})
 for r in p['rows']:
  r['attachments']=[l for l in links if l['excelRow']==r['excelRow']]
  r['issues']=[i for i in p['issues'] if i['excelRow']==r['excelRow']]
 p.update({'schema':'enterprise-source-import-v1','assets':assets,'links':links})
 if sha(source)!=p['sourceHash']:raise ValueError('SOURCE_CHANGED')
 # Derived thumbnails keep the grid from loading multi-megabyte original product images.
 from PIL import Image,ImageOps
 Image.MAX_IMAGE_PIXELS=40_000_000
 thumbs=out/'thumbs';thumbs.mkdir(exist_ok=True);thumb_errors=[]
 for digest in {a['sha256'] for a in assets if a['extension'] in ['.png','.jpg','.jpeg']}:
  try:
   with Image.open(blobs/digest) as im:
    im=ImageOps.exif_transpose(im);im.thumbnail((320,320));im.convert('RGBA').save(thumbs/(digest+'.png'),'PNG')
  except Exception:thumb_errors.append(digest)
 (out/'THUMBNAILS.json').write_text(json.dumps({'failed':thumb_errors,'ready':len(list(thumbs.glob('*.png')))}),encoding='utf-8')
 (out/'IMPORT_PAYLOAD.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f"IMPORT_PREPARE_PASS: rows={len(p['rows'])} assets={len(assets)} links={len(links)} unique_blobs={len({a['sha256'] for a in assets})} source_unchanged=1")
 return p
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--output',required=True);a=p.parse_args();prepare(a.source,a.output)
