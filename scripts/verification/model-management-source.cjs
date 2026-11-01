// Follow the actual editor owners for the two historical structural regressions.
// A supplied single-file historical fixture remains a single-file fixture.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
exports.readManagement=file=>{
 const source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
 const modular=source.includes('from "./use-model-management"');
 const files=modular?fs.readdirSync(path.dirname(file)).filter(f=>/\.tsx?$/.test(f)).map(f=>path.join(path.dirname(file),f)):[file];
 let sessionOwner=null;
 if(modular){
  const hook=path.join(path.dirname(file),'use-model-management.ts'),text=fs.readFileSync(hook,'utf8'),ast=ts.createSourceFile(hook,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  for(const node of ast.statements){
   if(!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||!node.importClause?.namedBindings||!ts.isNamedImports(node.importClause.namedBindings))continue;
   const binding=node.importClause.namedBindings.elements.find(e=>(e.propertyName||e.name).text==='createModelManagementSession');if(!binding)continue;
   let called=false;const visit=n=>{if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text===binding.name.text)called=true;ts.forEachChild(n,visit);};visit(ast);if(!called)continue;
   const root=path.resolve(path.dirname(file),'../../../..'),spec=node.moduleSpecifier.text,owner=path.resolve(spec.startsWith('@/')?path.join(root,'src',spec.slice(2)):path.join(path.dirname(hook),spec))+'.ts';
   if(!owner.startsWith(root+path.sep))throw Error('MANAGEMENT_OWNER_PATH_ESCAPE');
   const body=fs.readFileSync(owner,'utf8'),ownerAst=ts.createSourceFile(owner,body,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
   if(!ownerAst.statements.some(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createModelManagementSession'))throw Error('MANAGEMENT_FACTORY_EXPORT_MISSING');
   sessionOwner={file:owner,binding:binding.name.text};files.push(owner);
   for(const child of ownerAst.statements)if(ts.isImportDeclaration(child)&&ts.isStringLiteral(child.moduleSpecifier)&&child.moduleSpecifier.text.startsWith('./management-'))files.push(path.resolve(path.dirname(owner),child.moduleSpecifier.text)+'.ts');
  }
 }
 // api's pre-dispatch ownership check and operation's UUID/version port changed
 // deliberately. Actual client/body/lifecycle parity is covered by the original
 // full React A/B and the registered management-session browser cases; all
 // unaffected dialogs/helpers below retain their original exact AST checks.
 return {source,modular,sessionOwner,changedSessionFunctions:new Set(sessionOwner?['api','operation']:[]),owners:[...new Set(files)].map(f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n')};
};
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
exports.functionMap=text=>{
 const file=ts.createSourceFile('source.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),map=new Map();
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name)map.set(node.name.text,printer.printNode(ts.EmitHint.Unspecified,node,file).replace(/^export /,'').replace(/\s+/g,' '));ts.forEachChild(node,visit);};visit(file);return map;
};
