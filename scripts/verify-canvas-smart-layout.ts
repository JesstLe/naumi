import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { smartLayout, type LayoutNode, type LayoutEdge } from "../src/lib/canvas/smart-layout";
import { complexCanvas } from "./fixtures/canvas-complex-layout";

const root = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".");
const client = fs.readFileSync(path.join(root, "src/components/canvas/canvas-client.tsx"), "utf8");
if (process.argv.includes("--baseline")) {
  const source = client.slice(client.indexOf("function layoutGraph("), client.indexOf("export function CanvasClient()"));
  const context = vm.createContext({ NODE_W: 320, X_GAP: 90, Y_GAP: 48,
    artworkNodeSize: (a: {width: number; height: number}) => ({width: a.width, height: a.height + 24}),
    artworkImageSize: (a: {width: number; height: number}) => ({width: a.width, height: a.height}),
  });
  vm.runInContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, context);
  const data = [{id:"A",width:320,height:600,createdAt:"1"},{id:"a",parentId:"A",width:320,height:100,createdAt:"2"},
    {id:"B",width:320,height:600,createdAt:"3"},{id:"b",parentId:"B",width:320,height:100,createdAt:"4"}];
  const result = context.layoutGraph(data, "", ...Array(5).fill(() => {}));
  const a = result.nodes[0], b = result.nodes[2];
  const overlap = Math.min(a.position.y + 600, b.position.y + 600) - Math.max(a.position.y, b.position.y);
  assert.equal(overlap, 428);
  const tidy = client.slice(client.indexOf("function tidyLayout("), client.indexOf("// 下载单张图"));
  assert.ok(!tidy.includes("textIds") && tidy.includes("active.members"));
  console.log("BASELINE=PASS TALL_PARENT_OVERLAP=428px TEXT_LAYOUT=ABSENT");
  process.exit(0);
}

function check(nodes: LayoutNode[], edges: LayoutEdge[]) {
  const snapshot = JSON.stringify({nodes,edges}), result = smartLayout(nodes, edges);
  assert.equal(result.size, new Set(nodes.map(node => node.id)).size);
  assert.equal(JSON.stringify({nodes,edges}), snapshot, "input mutation");
  for (const node of nodes) {
    const point = result.get(node.id)!;
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    if (node.fixed) assert.deepEqual(point, {x:node.x,y:node.y});
  }
  for (let a=0;a<nodes.length;a++) for(let b=a+1;b<nodes.length;b++) {
    if(nodes[a].fixed && nodes[b].fixed) continue;
    const p=result.get(nodes[a].id)!,q=result.get(nodes[b].id)!;
    assert.ok(p.x+nodes[a].width<=q.x || q.x+nodes[b].width<=p.x ||
      p.y+nodes[a].height<=q.y || q.y+nodes[b].height<=p.y, `overlap ${nodes[a].id}/${nodes[b].id}`);
  }
  assert.deepEqual(smartLayout(nodes.map(node=>({...node,...result.get(node.id)!})),edges),result,"repeat tidy must be stable");
  return result;
}
const complex=complexCanvas(), arranged=check(complex.nodes,complex.edges);
for(const edge of complex.edges) assert.ok(arranged.get(edge.source)!.x<arranged.get(edge.target)!.x,"DAG flow left to right");
const bounds={width:Math.max(...complex.nodes.map(n=>arranged.get(n.id)!.x+n.width)),
  height:Math.max(...complex.nodes.map(n=>arranged.get(n.id)!.y+n.height))};
assert.ok(bounds.width/bounds.height>=0.65 && bounds.width/bounds.height<=3.5,JSON.stringify(bounds));
check([{id:"A",width:320,height:600,x:0,y:0},{id:"a",width:320,height:100,x:0,y:0},
  {id:"B",width:320,height:600,x:0,y:0},{id:"b",width:320,height:100,x:0,y:0}],
  [{source:"A",target:"a"},{source:"B",target:"b"}]);
const fixed=complex.nodes.map(n=>({...n,fixed:n.id==="p1-original" || n.id==="text-p2-review"}));
check([...fixed,{id:"task-running",x:0,y:0,width:420,height:360,fixed:true}],complex.edges);
check(complex.nodes,[...complex.edges,{source:"p0-final",target:"p0-original"},{source:"gone",target:"p1-original"}]);
check(complex.nodes.map(n=>({...n,group:n.id.endsWith("original")?"manual-group":null})),complex.edges);
assert.equal(smartLayout([],[]).size,0);
const crossingNodes=["a","b","c","d"].map(id=>({id,width:320,height:280,x:0,y:0}));
const crossing=check(crossingNodes,[{source:"a",target:"d"},{source:"b",target:"c"},{source:"a",target:"c"}]);
assert.ok((crossing.get("a")!.y-crossing.get("b")!.y)*(crossing.get("d")!.y-crossing.get("c")!.y)>=0);
const start=performance.now();
for(let seed=0;seed<20;seed++) {
  let value=seed+1; const random=()=>((value=(value*1664525+1013904223)>>>0)/4294967296);
  const nodes=Array.from({length:80},(_,i)=>({id:`n${i}`,width:120+Math.floor(random()*600),height:160+Math.floor(random()*800),x:i*12,y:i*20,fixed:i===0&&seed%2===0}));
  const edges:LayoutEdge[]=[];
  for(let i=1;i<nodes.length;i++) for(let e=0;e<2;e++) edges.push({source:`n${Math.floor(random()*i)}`,target:`n${i}`});
  check(nodes,edges);
}
const large=Array.from({length:400},(_,i)=>({id:`large-${i}`,width:300,height:400,x:0,y:0}));
check(large,large.slice(1).map((node,i)=>({source:`large-${Math.floor(i/3)}`,target:node.id})));
const elapsed=Math.round(performance.now()-start);
const tidy=client.slice(client.indexOf("async function tidyLayout("),client.indexOf("// 下载单张图"));
// Follow the real arrangement owner; retain the original geometry/stress cases.
const application=fs.readFileSync(path.join(root,"src/lib/canvas/arrange.ts"),"utf8");
for(const token of ["smartLayout", "flowNodeSize", "scene.edges", "fixed:", "await ports.history.apply(action)", "ports.history.record(action)", "ports.text.flush()", "moves.length>400"]) assert.ok(application.includes(token),token);
assert.ok(tidy.includes("arrangeCanvasDocument(canvasHistory.scope"));
assert.ok(!application.includes("/api/artworks/position"),"no fire-and-forget per-node writes");
const baselineArg=process.argv.indexOf("--business-baseline");
if(baselineArg>=0){
  const baseline=fs.readFileSync(path.join(process.argv[baselineArg+1],"src/components/canvas/canvas-client.tsx"),"utf8");
  const printer=ts.createPrinter({removeComments:true});
  const functions=(source:string)=>{const ast=ts.createSourceFile("canvas.tsx",source.replace(/\r\n/g,"\n"),99,true,4),map=new Map<string,string>();
    const walk=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name)map.set(node.name.text,printer.printNode(ts.EmitHint.Unspecified,node,ast));ts.forEachChild(node,walk);};walk(ast);return map;};
  const before=functions(baseline),after=functions(client);let protectedCount=0;
  for(const [name,body] of before)if(name!=="tidyLayout" && name!=="CanvasClient"){assert.equal(after.get(name),body,`unrelated function ${name}`);protectedCount++;}
  assert.ok(protectedCount>60);console.log(`BUSINESS=UNCHANGED PROTECTED_FUNCTIONS=${protectedCount}`);
}
console.log(`MODIFIED=PASS MIXED_NODES=${complex.nodes.length} OVERLAPS=0 LOCKED=UNCHANGED CYCLES=PASS REPEAT=STABLE CROSSING_FIXTURE=0 RANDOM_GRAPHS=20 CAPACITY=400`);
console.log(`BOUNDS=${bounds.width}x${bounds.height} STRESS_TIME_MS=${elapsed}`);
