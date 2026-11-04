/** Audit named, changed function documentation without importing application code.
 * This local AST/token inventory is not CodeRabbit's proprietary coverage check.
 * Python docstrings are ignored only when comparing executable AST structure. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{
  assert.match(arg,/^--(?:base|scope-ref|baseline|source-root|output-dir)=.+$/);
  const separator=arg.indexOf('=');return [arg.slice(2,separator),arg.slice(separator+1)];
}));
const base=options.base,scope=options['scope-ref'];
assert.match(base??'',/^[a-f0-9]{40}$/);assert.match(scope??'',/^[a-f0-9]{40}$/);
if(options.baseline)assert.match(options.baseline,/^[a-f0-9]{40}$/);
assert.ok(!(options.baseline&&options['source-root']));
const sourceRoot=options['source-root']?path.resolve(options['source-root']):null;
assert.ok(!sourceRoot||sourceRoot!==ROOT);
const OUT=path.resolve(options['output-dir']??path.join(ROOT,'output/fleet-business-docstrings'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:32*1024*1024});

/** Find new-side changed lines, retaining a deletion's surviving insertion point. */
function changedRanges(file){
  return [...git('diff','--unified=0',base,scope,'--',file).matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)]
    .map(match=>[Number(match[1]),Number(match[1])+Math.max(1,Number(match[2]??1))-1]);
}

/** Associate a function with its declaration's JSDoc, including named arrows. */
function hasJSDoc(node){
  let current=node;
  for(let depth=0;current&&depth<5;depth++,current=current.parent){
    if((ts.getJSDocCommentsAndTags(current)??[]).some(doc=>ts.isJSDoc(doc)&&Boolean(doc.comment?.toString().trim())))return true;
    if(current!==node&&!ts.isVariableDeclaration(current)&&!ts.isVariableDeclarationList(current)&&!ts.isVariableStatement(current)&&!ts.isPropertyAssignment(current)&&!ts.isPropertyDeclaration(current))break;
  }
  return false;
}

/** Count local branches without attributing a nested function's decisions to its parent. */
function complexity(node){
  let value=1;
  const logical=new Set([ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken]);
  const branch=new Set([ts.SyntaxKind.IfStatement,ts.SyntaxKind.ForStatement,ts.SyntaxKind.ForInStatement,ts.SyntaxKind.ForOfStatement,ts.SyntaxKind.WhileStatement,ts.SyntaxKind.DoStatement,ts.SyntaxKind.CatchClause,ts.SyntaxKind.CaseClause,ts.SyntaxKind.ConditionalExpression]);
  const visit=child=>{
    if(child!==node&&ts.isFunctionLike(child))return;
    if(branch.has(child.kind)||ts.isBinaryExpression(child)&&logical.has(child.operatorToken.kind))value++;
    ts.forEachChild(child,visit);
  };
  visit(node);return value;
}

/** Preserve parsed syntax and literal spellings without scanning regex/JSX as raw code. */
function syntaxShape(node,source){
  const children=[];ts.forEachChild(node,child=>{children.push(syntaxShape(child,source));});
  const semanticFlags={};
  for(const key of ['isTypeOnly','isExportEquals','isThisTypeOfTypeGuard'])if(node[key]!==undefined)semanticFlags[key]=node[key];
  return [node.kind,semanticFlags,children.length?children:node.getText(source)];
}

/** Inventory named TS/JS functions with stable lexical keys and source spans. */
function javascriptInventory(file,text){
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),items=[],counts=new Map();
  const visit=(node,parents=[])=>{
    let name;
    if(ts.isFunctionLike(node)&&node.body){
      name=node.name?.getText(source);
      if(!name&&(ts.isVariableDeclaration(node.parent)||ts.isPropertyAssignment(node.parent)||ts.isPropertyDeclaration(node.parent)))name=node.parent.name?.getText(source);
    }
    let descendants=parents;
    if(name){
      const lexical=[...parents,name].join('.'),index=counts.get(lexical)??0;counts.set(lexical,index+1);
      items.push({key:lexical+'#'+index,name:lexical,start:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,end:source.getLineAndCharacterOfPosition(node.end-1).line+1,complexity:complexity(node),documented:hasJSDoc(node)});
      descendants=[...parents,name];
    }
    ts.forEachChild(node,child=>visit(child,descendants));
  };
  visit(source);
  return {items,semanticHash:hash(JSON.stringify(syntaxShape(source,source))),parseErrors:source.parseDiagnostics.length};
}

const PYTHON=String.raw`
import ast,hashlib,json,sys
tree=ast.parse(sys.stdin.buffer.read().decode('utf-8'));items=[];counts={}
def inventory(node,parents=()):
    """Record named functions and count decisions outside nested function bodies."""
    nested=parents
    if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
        name='.'.join((*parents,node.name));index=counts.get(name,0);counts[name]=index+1
        def decisions(current):
            """Ignore child definitions while counting this function's branches."""
            if current is not node and isinstance(current,(ast.FunctionDef,ast.AsyncFunctionDef,ast.Lambda)):return 0
            value=int(isinstance(current,(ast.If,ast.For,ast.AsyncFor,ast.While,ast.ExceptHandler,ast.IfExp)))
            if isinstance(current,ast.BoolOp):value+=len(current.values)-1
            if isinstance(current,ast.Match):value+=len(current.cases)
            return value+sum(decisions(child) for child in ast.iter_child_nodes(current))
        items.append(dict(key=name+'#'+str(index),name=name,start=node.lineno,end=node.end_lineno,complexity=1+decisions(node),documented=bool(ast.get_docstring(node))))
        nested=(*parents,node.name)
    elif isinstance(node,ast.ClassDef):nested=(*parents,node.name)
    for child in ast.iter_child_nodes(node):inventory(child,nested)
inventory(tree)
for node in ast.walk(tree):
    if isinstance(node,(ast.Module,ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)) and ast.get_docstring(node) is not None:node.body.pop(0)
semantic=ast.dump(tree,include_attributes=False)
print(json.dumps(dict(items=items,semanticHash=hashlib.sha256(semantic.encode()).hexdigest(),parseErrors=0)))
`;

/** Parse Python statically in a subprocess; no module, fixture or deployment executes. */
function inventory(file,text){
  return file.endsWith('.py')?JSON.parse(execFileSync('python',['-c',PYTHON],{cwd:ROOT,input:text,encoding:'utf8',maxBuffer:16*1024*1024})):javascriptInventory(file,text);
}

/** Compare the fixed PR cohort against a Git baseline, worktree, or mandatory copy. */
async function main(){
  const files=git('diff','--name-only',base,scope).trim().split('\n').filter(file=>/\.(?:[cm]?js|tsx?|py)$/.test(file));
  const rows=[],sources={},origins={},semanticChanges=[];
  for(const file of files){
    const original=git('show',scope+':'+file),expected=inventory(file,original),ranges=changedRanges(file);
    const text=options.baseline?git('show',options.baseline+':'+file):await readFile(path.join(sourceRoot??ROOT,file),'utf8');
    origins[file]=options.baseline?'git:'+options.baseline:path.join(sourceRoot??ROOT,file);sources[file]=hash(text);
    const actual=inventory(file,text);assert.equal(actual.parseErrors,0,file+' must parse');
    if(actual.semanticHash!==expected.semanticHash)semanticChanges.push(file);
    for(const fn of expected.items.filter(fn=>fn.complexity>=2&&ranges.some(([start,end])=>fn.start<=end&&fn.end>=start))){
      const found=actual.items.find(item=>item.key===fn.key);
      rows.push({file,key:fn.key,name:fn.name,originalLine:fn.start,line:found?.start??null,complexity:fn.complexity,documented:Boolean(found?.documented),found:Boolean(found)});
    }
  }
  const missing=rows.filter(row=>!row.documented),passed=missing.length===0&&semanticChanges.length===0;
  const result=passed?'PASS':options.baseline?'REPRODUCED':'FAIL';
  const literal='FLEET_BUSINESS_DOCSTRINGS='+result+' files='+files.length+' eligible='+rows.length+' documented='+(rows.length-missing.length)+' missing='+missing.length+' semanticChanges='+semanticChanges.length+' REMOTE_COVERAGE=NOT_MEASURED';
  const record={result,exitStatus:passed?0:1,base,scopeRef:scope,sourceMode:options.baseline?'git-baseline':sourceRoot?'mandatory-copy':'working-tree',sourceRoot,sourceRef:options.baseline??null,localRule:'named touched functions, complexity >= 2 including nullish/logical/catch branches; anonymous callbacks excluded; not CodeRabbit algorithm',sourceSHA256:sources,sourceOrigins:origins,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),rows,missing,semanticChanges,literalOutput:literal};
  await mkdir(OUT,{recursive:true});const destination=path.join(OUT,options.baseline?'BASELINE_RESULT.json':sourceRoot?'ROLLBACK_RESULT.json':'MODIFIED_RESULT.json');
  await writeFile(destination,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(destination,'utf8')).literalOutput,literal);
  console.log(literal);if(missing.length)console.log('MISSING='+missing.map(row=>row.file+':'+row.name).join('; '));
  if(semanticChanges.length)console.log('SEMANTIC_CHANGES='+semanticChanges.join('; '));process.exitCode=passed?0:1;
}
await main();
