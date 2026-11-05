import type {PoolClient} from "pg";
/** Existing text reference/product admission, inside the same owner transaction
 * as autosave/history. Pure updates cannot validate one graph then write another. */
export async function validateCanvasTextLinksTx(tx:PoolClient,email:string,node:{id:string;projectKey:string;sourceIds:string[];productIds?:string[]}){
 const sources=[...new Set(node.sourceIds||[])];
 if(sources.length){
  const images=(await tx.query("SELECT id FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,sources])).rows;
  const graph=(await tx.query("SELECT id,source_ids FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2",[email,node.projectKey])).rows;
  const texts=graph.filter(row=>sources.includes(row.id)&&row.id!==node.id);
  if(new Set([...images.map(row=>row.id),...texts.map(row=>row.id)]).size!==sources.length)throw new Error("部分引用节点不存在或无权访问");
  const byId=new Map(graph.map(row=>[row.id,row.source_ids||[]])),todo=texts.map(row=>row.id),seen=new Set<string>();
  while(todo.length){const id=todo.pop()!;if(id===node.id)throw new Error("不能形成循环连线");if(seen.has(id))continue;seen.add(id);todo.push(...(byId.get(id)||[]));}
 }
 const products=[...new Set(node.productIds||[])];if(products.length&&(await tx.query("SELECT id FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[email,products])).rowCount!==products.length)throw new Error("绑定的产品图不存在或无权访问");
}
