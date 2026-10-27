// Follow the actual editor owners for the two historical structural regressions.
// A supplied single-file historical fixture remains a single-file fixture.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
exports.readManagement=file=>{
 const source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
 const modular=source.includes('from "./use-model-management"');
 const files=modular?fs.readdirSync(path.dirname(file)).filter(f=>/\.tsx?$/.test(f)).map(f=>path.join(path.dirname(file),f)):[file];
 return {source,modular,owners:files.map(f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n')};
};
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
exports.functionMap=text=>{
 const file=ts.createSourceFile('source.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),map=new Map();
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name)map.set(node.name.text,printer.printNode(ts.EmitHint.Unspecified,node,file).replace(/^export /,'').replace(/\s+/g,' '));ts.forEachChild(node,visit);};visit(file);return map;
};
