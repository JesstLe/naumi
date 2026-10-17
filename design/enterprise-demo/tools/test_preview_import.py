import importlib.util,io,pathlib,tempfile,unittest,zipfile
spec=importlib.util.spec_from_file_location('preview_import',pathlib.Path(__file__).with_name('preview_import.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from xml.sax.saxutils import escape
def workbook(headers=None,rows=None):
 headers=headers or ['产品需求名称','父记录','任务完成情况','下发日期','设计完成日期','数量']
 rows=rows if rows is not None else [['同名','','已完成','2026-10-10','2026-07-16','1套'],['同名','','','2026-10-10','2026-07-16','5'],['主图','同名','','2026-10-10','2026-07-16','50张+'],['孤儿','找不到','','','','']]
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:
  z.writestr('xl/workbook.xml','<workbook xmlns="'+m.NS['s']+'" xmlns:r="'+m.NS['r']+'"><sheets><sheet name="预演" sheetId="1" r:id="r1"/></sheets></workbook>')
  z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
  xml='<worksheet xmlns="'+m.NS['s']+'"><sheetData>'
  for i,row in enumerate([headers]+rows,1):xml+='<row r="'+str(i)+'">'+''.join(f'<c r="{chr(65+j)}{i}" t="inlineStr"><is><t>{escape(str(v))}</t></is></c>' for j,v in enumerate(row))+'</row>'
  z.writestr('xl/worksheets/sheet1.xml',xml+'</sheetData></worksheet>')
 return b.getvalue()
class PreviewTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.p=pathlib.Path(self.tmp.name)/'test.xlsx';self.p.write_bytes(workbook())
 def tearDown(self):self.tmp.cleanup()
 def test_rows_and_source_unchanged(self):
  before=self.p.read_bytes();r=m.analyse(self.p);self.assertEqual(len(r['rows']),4);self.assertEqual(self.p.read_bytes(),before)
  self.p.write_bytes(workbook(['产品需求名称','父记录','运营需求文档','运营需求文档'],[['产品','','brief.xlsx','']]))
  r=m.analyse(self.p);self.assertEqual(r['rows'][0]['raw']['运营需求文档'],'brief.xlsx');self.assertEqual(r['rows'][0]['rawCells']['C2'],'brief.xlsx')
 def test_ambiguous_parent(self):self.assertEqual(m.analyse(self.p)['summary']['issuesByCode']['AMBIGUOUS_PARENT'],1)
 def test_orphan(self):self.assertEqual(m.analyse(self.p)['summary']['issuesByCode']['MISSING_PARENT'],1)
 def test_dates(self):self.assertEqual(m.analyse(self.p)['summary']['issuesByCode']['DATE_BEFORE_DISPATCH'],3)
 def test_quantity(self):
  r=m.analyse(self.p)['summary']['issuesByCode'];self.assertEqual(r['UNKNOWN_QUANTITY_UNIT'],1);self.assertEqual(r['ESTIMATED_MIN_QUANTITY'],1)
 def test_zip(self):
  p=self.p.with_suffix('.zip')
  with zipfile.ZipFile(p,'w') as z:z.writestr('主表.xlsx',self.p.read_bytes());z.writestr('附件/brief.xlsx',self.p.read_bytes())
  self.assertEqual(m.analyse(p)['summary']['rows'],4)
 def test_multi_root_reject(self):
  p=self.p.with_suffix('.zip')
  with zipfile.ZipFile(p,'w') as z:z.writestr('a.xlsx',self.p.read_bytes());z.writestr('b.xlsx',self.p.read_bytes())
  with self.assertRaises(ValueError):m.analyse(p)
 def test_missing_headers(self):
  self.p.write_bytes(workbook(['A','B'],[['x','y']]))
  with self.assertRaises(ValueError):m.analyse(self.p)
if __name__=='__main__':unittest.main()
