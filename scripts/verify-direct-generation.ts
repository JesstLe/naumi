import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";

function verifyConfirmationScope(source:string){
  const file=ts.createSourceFile("billing-client.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const costPlus=(node:ts.Expression):boolean=>{
    if(ts.isParenthesizedExpression(node))return costPlus(node.expression);
    if(!ts.isBinaryExpression(node))return false;
    if(node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)return costPlus(node.left)||costPlus(node.right);
    if(node.operatorToken.kind!==ts.SyntaxKind.EqualsEqualsEqualsToken)return false;
    const matches=(left:ts.Expression,right:ts.Expression)=>ts.isPropertyAccessExpression(left)&&left.name.text==="mode"&&ts.isStringLiteral(right)&&right.text==="api-cost-plus";
    return matches(node.left,node.right)||matches(node.right,node.left);
  };
  const visit=(node:ts.Node)=>{
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(file)==="window"&&node.expression.name.text==="confirm"){
      let child:ts.Node=node,guarded=false;
      for(let parent=node.parent;parent&&!ts.isFunctionLike(parent);child=parent,parent=parent.parent){
        if(ts.isBinaryExpression(parent)&&parent.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&parent.right===child&&costPlus(parent.left))guarded=true;
        if(ts.isIfStatement(parent)&&parent.thenStatement===child&&costPlus(parent.expression))guarded=true;
      }
      assert(guarded,"fixed-price submission contains fee confirmation; only explicit api-cost-plus authorization may prompt");
    }
    ts.forEachChild(node,visit);
  };visit(file);
}

const root = resolve(process.argv[2] || ".");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
try {
  assert.throws(()=>verifyConfirmationScope('function fixed(){return window.confirm("fee");}'));
  assert.throws(()=>verifyConfirmationScope('function fixed(q){if(q.mode==="api-cost-plus"||true)return window.confirm("fee");}'));
  assert.throws(()=>verifyConfirmationScope('function later(q){if(q.mode==="api-cost-plus")register(()=>window.confirm("fee"));}'));
  verifyConfirmationScope('function cost(q){if(q.mode==="api-cost-plus"&&!window.confirm("cap"))throw Error("cancel");}');
  const client = read("src/lib/billing/client.tsx");
  verifyConfirmationScope(client);
  assert(client.includes("quoteAndSubmit"), "quote-first submission missing");
  assert(client.includes("q.version !== catalog.version") && client.includes("return submit(url, init, q)"), "quote version validation missing");
  for (const header of ["x-naumi-billing-version", "x-naumi-billing-credits", "x-naumi-billing-operation-id"]) assert(client.includes(header), `missing ${header}`);
  for (const path of ["src/components/canvas/canvas-client.tsx", "src/components/genchat/genchat-client.tsx"]) {
    const source = read(path);
    assert(source.includes("billing.quoteAndSubmit"), `${path} still uses old submission`);
    assert(!source.includes("提交前确认报价") && !source.includes("confirmAndSubmit"), `${path} contains obsolete confirmation`);
  }
  for (const name of ["generate", "cutout", "retouch", "replicate", "garment3d", "tryon", "suite", "aplus"]) {
    assert(read(`src/components/${name}/${name}-client.tsx`).includes("billing.submit"), `${name} must retain quoted direct submission`);
  }
  assert(read("src/components/admin/admin-artworks.tsx").includes("window.confirm"), "unrelated destructive confirmation was removed");
  assert(read("src/lib/billing/agent.ts").includes("confirm=true"), "Agent spending authorization must remain separate");
  console.log("DIRECT_SUBMISSION=PASS CANVAS=PASS TOOLBOX=PASS GENCHAT=PASS QUOTE_AND_IDEMPOTENCY=RETAINED");
} catch (error) {
  console.error(`DIRECT_SUBMISSION=FAIL ${(error as Error).message}`);
  process.exitCode = 1;
}
